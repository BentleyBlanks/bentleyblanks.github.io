/**
 * GravityTank — classic Battle City stages 1–5 with gravity bullets.
 * Visuals: classic NES Battle City–style sprites (StefanBS/battle-city-clone, MIT).
 */

import { STAGE_COUNT, GetStage } from "./Data_Stages.mjs";

const TILE = 16;
const MAP_W = 26;
const MAP_H = 26;
const CANVAS_W = MAP_W * TILE; // 416
const CANVAS_H = MAP_H * TILE;
const TANK_SIZE = 32;
const SHEET_CELL = 8;
const SPRITE = 16; // classic tank / metatile source size in the sheet
const MAX_ENEMIES_ON_FIELD = 4;
const PLAYER_LIVES = 3;
const GRAVITY = 504; // px/s^2 — was 420, +20% heavier
const BULLET_SPEED = 280;
/** Classic ~1/5 tanks flash (~0.20); +50% → 0.30. Only flashing tanks drop. */
const POWER_DROP_RATE = 0.3;
const PLAYER_SPEED = 88;
const SPAWN_PROTECT = 3.0;

const DIR = {
  up: { x: 0, y: -1, angle: -Math.PI / 2 },
  down: { x: 0, y: 1, angle: Math.PI / 2 },
  left: { x: -1, y: 0, angle: Math.PI },
  right: { x: 1, y: 0, angle: 0 },
};
const DIR_KEYS = ["up", "down", "left", "right"];

const TILE_EMPTY = 0;
const TILE_BRICK = 1;
const TILE_STEEL = 2;
const TILE_WATER = 3;
const TILE_GRASS = 4;
const TILE_ICE = 5;
const TILE_BASE = 6;
const TILE_BASE_DEAD = 7;

/** Classic Battle City brick = four 8×8 quarters inside a 16×16 cell. */
const BRICK_TL = 1;
const BRICK_TR = 2;
const BRICK_BL = 4;
const BRICK_BR = 8;
const BRICK_FULL = BRICK_TL | BRICK_TR | BRICK_BL | BRICK_BR;


const POWER = {
  star: "star",
  bomb: "bomb",
  clock: "clock",
  shovel: "shovel",
  helmet: "helmet",
  life: "life",
  gun: "gun",
  antigrav: "antigrav",
  bounce: "bounce",
  meteor: "meteor",
  ghost: "ghost",
  mirror: "mirror",
  magnet: "magnet",
  warp: "warp",
  // Bullet variants (positive)
  fork: "fork",
  rapid: "rapid",
  pierce: "pierce",
  spread: "spread",
  sniper: "sniper",
  // Field pickup is always a roulette token now.
  token: "token",
  // Ultra-strong
  nuke: "nuke",
  overdrive: "overdrive",
  apocalypse: "apocalypse",
  juggernaut: "juggernaut",
  // Curses / negatives
  spawnExtra: "spawnExtra",
  enemyShield: "enemyShield",
  heavyCurse: "heavyCurse",
  enemyRage: "enemyRage",
  softStun: "softStun",
  fortBreak: "fortBreak",
};

/** Tier colors — strong guidance: cool green = good, gold = ultra, hot red = bad. */
const TIER_PALETTE = {
  good: { color: "#70ff98", bg: "#0c2818", rim: "#38c060" },
  ultra: { color: "#ffe060", bg: "#3a2808", rim: "#f0b020" },
  bad: { color: "#ff6060", bg: "#380808", rim: "#e02828" },
};

function MakeSeg(kind, label, tier) {
  const pal = TIER_PALETTE[tier];
  return { kind, label, tier, color: pal.color, bg: pal.bg, rim: pal.rim };
}

/** Full prize pool — each spin picks ROULETTE_SIZE at random from here. */
const ROULETTE_POOL = [
  MakeSeg(POWER.star, "★星", "good"),
  MakeSeg(POWER.bomb, "炸弹", "good"),
  MakeSeg(POWER.helmet, "护盾", "good"),
  MakeSeg(POWER.life, "命+1", "good"),
  MakeSeg(POWER.clock, "冻结", "good"),
  MakeSeg(POWER.shovel, "钢墙", "good"),
  MakeSeg(POWER.gun, "钢弹", "good"),
  MakeSeg(POWER.antigrav, "反G", "good"),
  MakeSeg(POWER.bounce, "弹跳", "good"),
  MakeSeg(POWER.meteor, "陨石", "good"),
  MakeSeg(POWER.ghost, "幽灵", "good"),
  MakeSeg(POWER.mirror, "镜像", "good"),
  MakeSeg(POWER.magnet, "追踪", "good"),
  MakeSeg(POWER.warp, "闪现", "good"),
  MakeSeg(POWER.fork, "分叉", "good"),
  MakeSeg(POWER.rapid, "速射", "good"),
  MakeSeg(POWER.pierce, "穿甲", "good"),
  MakeSeg(POWER.spread, "散射", "good"),
  MakeSeg(POWER.sniper, "狙击", "good"),
  MakeSeg(POWER.nuke, "核爆", "ultra"),
  MakeSeg(POWER.overdrive, "超武", "ultra"),
  MakeSeg(POWER.apocalypse, "天罚", "ultra"),
  MakeSeg(POWER.juggernaut, "霸体", "ultra"),
  MakeSeg(POWER.spawnExtra, "援军", "bad"),
  MakeSeg(POWER.enemyShield, "敌盾", "bad"),
  MakeSeg(POWER.heavyCurse, "超重", "bad"),
  MakeSeg(POWER.enemyRage, "狂暴", "bad"),
  MakeSeg(POWER.softStun, "眩晕", "bad"),
  MakeSeg(POWER.fortBreak, "破堡", "bad"),
];

const ROULETTE_SIZE = 10;

const POWER_STYLE = Object.fromEntries(ROULETTE_POOL.map((s) => [s.kind, s]));
Object.assign(POWER_STYLE, {
  token: MakeSeg(POWER.token, "?", "good"),
});

function ShuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick 10 unique prizes: mix good / ultra / bad so the wheel stays readable. */
function PickRouletteSegments(count = ROULETTE_SIZE) {
  const goods = ShuffleInPlace(ROULETTE_POOL.filter((s) => s.tier === "good").slice());
  const ultras = ShuffleInPlace(ROULETTE_POOL.filter((s) => s.tier === "ultra").slice());
  const bads = ShuffleInPlace(ROULETTE_POOL.filter((s) => s.tier === "bad").slice());
  const badN = Math.min(bads.length, 2 + Math.floor(Math.random() * 2)); // 2–3
  const ultraN = Math.min(ultras.length, 1 + Math.floor(Math.random() * 2)); // 1–2
  const goodN = Math.max(0, count - badN - ultraN);
  const picked = [
    ...goods.slice(0, goodN),
    ...ultras.slice(0, ultraN),
    ...bads.slice(0, badN),
  ];
  // Fill if pool short
  while (picked.length < count) {
    const rest = ROULETTE_POOL.filter((s) => !picked.includes(s));
    if (!rest.length) break;
    picked.push(rest[Math.floor(Math.random() * rest.length)]);
  }
  return ShuffleInPlace(picked.slice(0, count));
}

const ROULETTE_FRICTION = 2.6; // viscous 1/s
const ROULETTE_COULOMB = 1.35; // rad/s^2 opposing
const ROULETTE_STOP = 0.18; // rad/s
const ROULETTE_MAX_OMEGA = 42;

const ENEMY_TYPES = [
  { id: "basic", hp: 1, speed: 54, score: 100, shootCd: 1.4, texture: "enemyBasic", weight: 10 },
  { id: "fast", hp: 1, speed: 96, score: 200, shootCd: 1.1, texture: "enemyFast", weight: 5 },
  { id: "power", hp: 1, speed: 62, score: 300, shootCd: 0.75, texture: "enemyPower", weight: 3, bulletBoost: 1.15 },
  { id: "armor", hp: 4, speed: 48, score: 400, shootCd: 1.2, texture: "enemyArmor", weight: 2 },
];

/** Classic sheet grid origins [gx, gy] in 8×8 cells (16×16 sprite = 2×2 cells). */
const TANK_DIR_COL = { up: 0, left: 4, down: 8, right: 12 };
const ENEMY_SHEET = {
  enemyBasic: { row: 8, redRow: 24, col: 16 },
  enemyFast: { row: 10, redRow: 26, col: 16 },
  enemyPower: { row: 12, redRow: 28, col: 16 },
  enemyArmor: { row: 14, redRow: 30, col: 16 },
  enemyAlt: { row: 24, redRow: 24, col: 16 },
};
const TILE_SHEET = {
  brick: [32, 8],
  steel: [32, 9],
  bush: [33, 9],
  ice: [34, 9],
  water: [
    [32, 10],
    [33, 10],
    [34, 10],
  ],
  baseAlive: [38, 4],
  baseDead: [40, 4],
};
const POWER_SHEET = {
  helmet: [32, 14],
  clock: [34, 14],
  shovel: [36, 14],
  star: [38, 14],
  bomb: [40, 14],
  life: [42, 14],
  gun: [40, 14],
};
/** Custom (non-classic) power icons — Battle City–style generated sprites. */
const POWER_ICON_IMG = {
  token: "powerToken",
  nuke: "powerNuke",
  overdrive: "powerOverdrive",
  apocalypse: "powerApocalypse",
  juggernaut: "powerJuggernaut",
  spawnExtra: "powerSpawnExtra",
  enemyShield: "powerEnemyShield",
  heavyCurse: "powerHeavyCurse",
  enemyRage: "powerEnemyRage",
};
const FX_SHEET = {
  spawn: [
    [32, 12],
    [34, 12],
    [36, 12],
    [38, 12],
  ],
  shield: [
    [32, 18],
    [34, 18],
  ],
  explosion: [
    [32, 16],
    [34, 16],
    [36, 16],
  ],
};
const BULLET_SHEET = {
  up: [323, 102, 3, 4],
  left: [330, 102, 4, 3],
  down: [339, 102, 3, 4],
  right: [346, 102, 4, 3],
};

/** Deep-copy a classic stage map (26×26 int grid). */
function BuildStageMap(stageIndex1Based) {
  const stage = GetStage(stageIndex1Based);
  return stage.map.map((row) => row.slice());
}

function BuildBrickMask(map) {
  const mask = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = new Array(MAP_W);
    for (let x = 0; x < MAP_W; x++) {
      row[x] = map[y][x] === TILE_BRICK ? BRICK_FULL : 0;
    }
    mask.push(row);
  }
  return mask;
}

function BrickHalfMaskFromDir(dir) {
  if (dir === "right") return BRICK_TL | BRICK_BL;
  if (dir === "left") return BRICK_TR | BRICK_BR;
  if (dir === "down") return BRICK_TL | BRICK_TR;
  return BRICK_BL | BRICK_BR; // up
}

function BrickHalfMaskFromVelocity(vx, vy) {
  return BrickHalfMaskFromDir(DirFromVector(vx, vy));
}

function BrickBitAtLocal(ox, oy) {
  const right = ox >= TILE / 2;
  const bottom = oy >= TILE / 2;
  if (!bottom && !right) return BRICK_TL;
  if (!bottom && right) return BRICK_TR;
  if (bottom && !right) return BRICK_BL;
  return BRICK_BR;
}

function Clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function RectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function DirFromVector(vx, vy) {
  if (Math.abs(vx) > Math.abs(vy)) return vx < 0 ? "left" : "right";
  return vy < 0 ? "up" : "down";
}

function SnapToGrid(v, grid = 4) {
  return Math.round(v / grid) * grid;
}

function LoadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

class AudioBus {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.buffers = {};
    this.engineNode = null;
    this.powerSpawnNode = null;
    this.bgmNode = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.masterGain = null;
    this.sfxVolume = 0.7;
    this.bgmVolume = 0.45;
    this.muted = false;
    this.ready = false;
  }

  async LoadAll() {
    const list = {
      shoot: "assets/AudioSfx_Shoot.wav",
      brick: "assets/AudioSfx_BrickHit.wav",
      steel: "assets/AudioSfx_SteelHit.wav",
      explode: "assets/AudioSfx_Explosion.wav",
      power: "assets/AudioSfx_Powerup.wav",
      powerSpawn: "assets/AudioSfx_PowerupSpawn.wav",
      stage: "assets/AudioSfx_StageStart.wav",
      gameOver: "assets/AudioSfx_GameOver.wav",
      victory: "assets/AudioSfx_Victory.wav",
      pause: "assets/AudioSfx_Pause.wav",
      ice: "assets/AudioSfx_Ice.wav",
      engine: "assets/AudioSfx_Engine.wav",
      bgm: "assets/AudioBgm_Battle.ogg",
    };
    const ctx = this.Ensure();
    if (!ctx) return;
    this.EnsureGraph();
    await Promise.all(Object.entries(list).map(async ([key, src]) => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        this.buffers[key] = await ctx.decodeAudioData(buf.slice(0));
      } catch (err) {
        console.warn("SFX load failed", key, err);
      }
    }));
    this.ready = true;
  }

  Ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  EnsureGraph() {
    const ctx = this.Ensure();
    if (!ctx) return null;
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      this.bgmGain = ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.bgmGain.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
      this.ApplyVolumes();
    }
    return ctx;
  }

  ApplyVolumes() {
    if (!this.sfxGain || !this.bgmGain || !this.masterGain) return;
    this.sfxGain.gain.value = this.sfxVolume;
    this.bgmGain.gain.value = this.bgmVolume;
    this.masterGain.gain.value = this.muted ? 0 : 1;
  }

  SetSfxVolume(v) {
    this.sfxVolume = Clamp(v, 0, 1);
    this.ApplyVolumes();
  }

  SetBgmVolume(v) {
    this.bgmVolume = Clamp(v, 0, 1);
    this.ApplyVolumes();
  }

  SetMuted(muted) {
    this.muted = !!muted;
    this.ApplyVolumes();
  }

  Play(name, { gain = 0.45, loop = false, rate = 1, bus = "sfx" } = {}) {
    if (!this.enabled) return null;
    const ctx = this.EnsureGraph();
    if (!ctx) return null;
    const buffer = this.buffers[name];
    if (!buffer) {
      if (bus === "sfx") this.ToneFallback(name);
      return null;
    }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    src.loop = loop;
    src.playbackRate.value = rate;
    g.gain.value = gain;
    src.connect(g);
    g.connect(bus === "bgm" ? this.bgmGain : this.sfxGain);
    src.start();
    return { src, g };
  }

  Tone(freq, dur, type = "square", gain = 0.04, slide = 0) {
    if (!this.enabled) return;
    const ctx = this.EnsureGraph();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  ToneFallback(name) {
    if (name === "shoot") this.Tone(320, 0.08, "square", 0.035, -180);
    else if (name === "brick" || name === "hit") this.Tone(200, 0.06, "square", 0.04, -80);
    else if (name === "steel") this.Tone(140, 0.05, "triangle", 0.03);
    else if (name === "explode") {
      this.Tone(90, 0.22, "sawtooth", 0.05, -60);
      this.Tone(55, 0.28, "square", 0.03, -20);
    } else if (name === "power") {
      this.Tone(520, 0.12, "square", 0.04, 200);
      this.Tone(780, 0.18, "triangle", 0.03);
    } else if (name === "victory") {
      this.Tone(440, 0.12, "square", 0.04);
      setTimeout(() => this.Tone(660, 0.18, "square", 0.04), 120);
    } else if (name === "gameOver") this.Tone(180, 0.35, "sawtooth", 0.05, -120);
    else if (name === "pause") this.Tone(600, 0.04, "square", 0.03);
  }

  Shoot() { this.Play("shoot", { gain: 0.5 }); }
  Bounce() { this.Play("steel", { gain: 0.45 }); }
  Hit() { this.Play("brick", { gain: 0.5 }); }
  Explode() { this.Play("explode", { gain: 0.55 }); }
  Power() {
    this.StopPowerSpawn();
    this.Play("power", { gain: 0.5 });
  }
  PowerSpawn() {
    this.StopPowerSpawn();
    this.powerSpawnNode = this.Play("powerSpawn", { gain: 0.28, loop: true });
  }
  StopPowerSpawn() {
    try { this.powerSpawnNode?.src?.stop(); } catch (_) { /* already stopped */ }
    this.powerSpawnNode = null;
  }
  StageStart() { this.Play("stage", { gain: 0.5 }); }
  StartBgm() {
    this.StopBgm();
    this.bgmNode = this.Play("bgm", { gain: 0.55, loop: true, bus: "bgm" });
  }
  StopBgm() {
    try { this.bgmNode?.src?.stop(); } catch (_) { /* already stopped */ }
    this.bgmNode = null;
  }
  Win() {
    this.StopEngine();
    this.StopPowerSpawn();
    this.StopBgm();
    this.Play("victory", { gain: 0.55 });
  }
  Lose() {
    this.StopEngine();
    this.StopPowerSpawn();
    this.StopBgm();
    this.Play("gameOver", { gain: 0.55 });
  }
  PauseBlip() { this.Play("pause", { gain: 0.4 }); }
  Ice() { this.Play("ice", { gain: 0.25 }); }

  SetEngine(on) {
    if (on) {
      if (this.engineNode) return;
      this.engineNode = this.Play("engine", { gain: 0.16, loop: true });
    } else {
      this.StopEngine();
    }
  }

  StopEngine() {
    try { this.engineNode?.src?.stop(); } catch (_) { /* already stopped */ }
    this.engineNode = null;
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.hud = {
      lives: document.getElementById("livesValue"),
      power: document.getElementById("powerValue"),
      score: document.getElementById("scoreValue"),
      remain: document.getElementById("remainValue"),
      stage: document.getElementById("stageValue"),
      enemyIcons: document.getElementById("enemyIcons"),
      mobileLives: document.getElementById("mobileLives"),
      mobilePower: document.getElementById("mobilePower"),
      mobileScore: document.getElementById("mobileScore"),
      mobileRemain: document.getElementById("mobileRemain"),
      mobileStage: document.getElementById("mobileStage"),
    };
    this.overlays = {
      start: document.getElementById("startOverlay"),
      startTitle: document.getElementById("startStageTitle"),
      startBlurb: document.getElementById("startStageBlurb"),
      pause: document.getElementById("pauseOverlay"),
      end: document.getElementById("endOverlay"),
      endTitle: document.getElementById("endTitle"),
      endMessage: document.getElementById("endMessage"),
      endPrimary: document.getElementById("restartButton"),
      endSecondary: document.getElementById("nextStageButton"),
    };
    this.touchUi = {
      stickWrap: document.getElementById("touchStickWrap"),
      actionsWrap: document.getElementById("touchActionsWrap"),
      stick: document.getElementById("touchStick"),
      knob: document.getElementById("stickKnob"),
      fire: document.getElementById("touchFire"),
      pause: document.getElementById("touchPause"),
      hudPause: document.getElementById("mobilePauseButton"),
    };

    this.audio = new AudioBus();
    this.images = {};
    this.keys = new Set();
    this.touchDir = null;
    this.touchFire = false;
    this.stickPointerId = null;
    this.firePointerId = null;
    this.stickVec = { x: 0, y: 0 };
    this.isTouchDevice = false;
    this.respawnTimer = 0;

    this.state = "boot";
    this.stage = 1;
    this.stageData = GetStage(1);
    this.totalEnemies = 20;
    this.endAction = "restart"; // restart | next | retry
    this.map = [];
    this.brickMask = [];
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.explosions = [];
    this.powerups = [];
    this.spawnQueue = [];
    this.score = 0;
    this.lives = PLAYER_LIVES;
    this.enemiesRemaining = 20;
    this.spawnTimer = 0;
    this.freezeTimer = 0;
    this.shovelTimer = 0;
    this.antigravTimer = 0;
    this.bounceTimer = 0;
    this.ghostTimer = 0;
    this.mirrorTimer = 0;
    this.magnetTimer = 0;
    this.overdriveTimer = 0;
    this.forkTimer = 0;
    this.rapidTimer = 0;
    this.pierceTimer = 0;
    this.spreadTimer = 0;
    this.sniperTimer = 0;
    this.heavyCurseTimer = 0;
    this.enemyRageTimer = 0;
    this.playerStunTimer = 0;
    this.buffToast = null;
    this.roulette = null;
    this.pendingFortRestore = false;
    this.baseAlive = true;
    this.waterPhase = 0;
    this.lastTs = 0;
    this.spawnSlots = [];
    this.nextSpawnSlot = 0;
    this.frame = 0;
    this.ApplyStageMeta(1);
  }

  async Init() {
    await this.LoadAssets();
    await this.audio.LoadAll().catch((err) => console.warn("SFX pack load", err));
    this.BindUi();
    this.RenderEnemyIcons();
    this.DrawBootFrame();
    if (new URLSearchParams(location.search).has("autostart")) {
      this.StartCampaign();
    }
    requestAnimationFrame((t) => this.Loop(t));
  }

  async LoadAssets() {
    const load = (src) => LoadImage(src).catch((err) => {
      console.warn("asset miss", src, err);
      return null;
    });
    this.images = {
      sheet: await load("assets/Texture_ClassicSheet.png"),
      powerToken: await load("assets/Texture_PowerToken.png"),
      rouletteWheel: await load("assets/Texture_UiRouletteWheel.png"),
      rouletteNeedle: await load("assets/Texture_UiRouletteNeedle.png"),
      powerNuke: await load("assets/Texture_PowerNuke.png"),
      powerOverdrive: await load("assets/Texture_PowerOverdrive.png"),
      powerApocalypse: await load("assets/Texture_PowerApocalypse.png"),
      powerJuggernaut: await load("assets/Texture_PowerJuggernaut.png"),
      powerSpawnExtra: await load("assets/Texture_PowerSpawnExtra.png"),
      powerEnemyShield: await load("assets/Texture_PowerEnemyShield.png"),
      powerHeavyCurse: await load("assets/Texture_PowerHeavyCurse.png"),
      powerEnemyRage: await load("assets/Texture_PowerEnemyRage.png"),
    };
  }

  /** Draw a power icon (custom texture or classic sheet cell) centered at (cx,cy). */
  DrawPowerIcon(ctx, kind, cx, cy, size = 16) {
    const key = POWER_ICON_IMG[kind];
    const img = key ? this.images[key] : null;
    if (img) {
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
      return true;
    }
    const cell = POWER_SHEET[kind];
    if (cell) {
      this.BlitGrid(ctx, cell[0], cell[1], cx - size / 2, cy - size / 2, size, size);
      return true;
    }
    return false;
  }

  /** Blit a grid-aligned 16×16 (or larger) sprite from the classic sheet. */
  BlitGrid(ctx, gx, gy, dx, dy, dw = TILE, dh = TILE, gw = 2, gh = 2) {
    const sheet = this.images.sheet;
    if (!sheet) return;
    ctx.drawImage(
      sheet,
      gx * SHEET_CELL,
      gy * SHEET_CELL,
      gw * SHEET_CELL,
      gh * SHEET_CELL,
      dx,
      dy,
      dw,
      dh
    );
  }

  BlitRect(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
    const sheet = this.images.sheet;
    if (!sheet) return;
    ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  BindUi() {
    this.DetectTouchUi();

    document.getElementById("startButton").addEventListener("click", () => this.StartCampaign());
    document.getElementById("restartButton").addEventListener("click", () => this.HandleEndPrimary());
    document.getElementById("nextStageButton")?.addEventListener("click", () => this.AdvanceStage());
    document.getElementById("resumeButton").addEventListener("click", () => this.SetPaused(false));

    this.canvas.addEventListener("pointerdown", (ev) => this.OnCanvasPointerDown(ev));
    this.canvas.addEventListener("pointermove", (ev) => this.OnCanvasPointerMove(ev));
    this.canvas.addEventListener("pointerup", (ev) => this.OnCanvasPointerUp(ev));
    this.canvas.addEventListener("pointercancel", (ev) => this.OnCanvasPointerUp(ev));

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "j"].includes(k) || e.code === "Space") {
        e.preventDefault();
      }
      this.keys.add(k);
      if (e.code === "Space") this.keys.add(" ");
      if (k === "p" || k === "escape") this.TogglePause();
      if ((k === "enter" || k === " ") && this.state === "ready") this.StartCampaign();
      if ((k === "enter" || k === " ") && this.state === "stageIntro") this.SkipStageIntro();
      if ((k === " " || k === "j") && this.state === "roulette") this.RouletteKick(14 + Math.random() * 10);
      if ((k === "enter" || k === " ") && this.state === "won") this.HandleEndPrimary();
      if ((k === "enter" || k === " ") && this.state === "lost") this.HandleEndPrimary();
      this.audio.Ensure();
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (e.code === "Space") this.keys.delete(" ");
    });

    this.BindTouchControls();
    this.BindVolumeControls();

    // Stop page scroll / pinch while interacting with the stage on mobile.
    const shell = document.querySelector(".stage-shell");
    const block = (ev) => {
      if (this.isTouchDevice && this.state === "playing") ev.preventDefault();
    };
    shell?.addEventListener("touchmove", block, { passive: false });
    this.touchUi.stickWrap?.addEventListener("touchmove", (ev) => ev.preventDefault(), { passive: false });
    this.touchUi.actionsWrap?.addEventListener("touchmove", (ev) => ev.preventDefault(), { passive: false });

    window.addEventListener("resize", () => this.DetectTouchUi());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.DetectTouchUi(), 120);
    });
    window.visualViewport?.addEventListener("resize", () => this.FitPortraitStage());
    window.visualViewport?.addEventListener("scroll", () => this.FitPortraitStage());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.ResetTouchInput();
    });
    window.addEventListener("pagehide", () => this.ResetTouchInput());
    window.addEventListener("blur", () => this.ResetTouchInput());
  }

  ResetTouchInput() {
    this.stickPointerId = null;
    this.firePointerId = null;
    this.touchFire = false;
    this.touchDir = null;
    this.stickVec.x = 0;
    this.stickVec.y = 0;
    if (this.touchUi.knob) this.touchUi.knob.style.transform = "translate(0, 0)";
    this.touchUi.fire?.classList.remove("is-active");
  }

  DetectTouchUi() {
    const params = new URLSearchParams(location.search);
    const forced = params.has("touch") || params.has("mobile");
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const noHover = window.matchMedia("(hover: none)").matches;
    const narrow = window.matchMedia("(max-width: 860px)").matches;
    const shortLandscape = window.matchMedia("(orientation: landscape) and (max-height: 560px)").matches;
    const touchPoints = navigator.maxTouchPoints > 0;
    this.isTouchDevice = forced || coarse || noHover || touchPoints || narrow || shortLandscape;
    document.body.classList.toggle("is-touch", this.isTouchDevice);
    document.body.classList.toggle("force-touch", forced);
    document.body.classList.toggle("is-portrait", window.matchMedia("(orientation: portrait)").matches);
    this.SyncTouchControlsVisibility();
    this.FitPortraitStage();
  }

  /** Size the square stage so HUD + canvas + controls fit in one portrait viewport. */
  FitPortraitStage() {
    const shell = document.querySelector(".stage-shell");
    if (!shell) return;
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    const narrow = window.innerWidth <= 900;
    if (!(this.isTouchDevice && portrait && narrow)) {
      shell.style.width = "";
      shell.style.maxWidth = "";
      return;
    }
    const vv = window.visualViewport;
    const viewH = vv?.height ?? window.innerHeight;
    const viewW = vv?.width ?? window.innerWidth;
    const padX = 16;
    const hud = document.querySelector(".mobile-hud");
    const hudH = Math.max(36, hud ? hud.getBoundingClientRect().height : 44);
    const controlsOn = this.touchUi.stickWrap && !this.touchUi.stickWrap.hidden;
    const controlsBudget = controlsOn ? 128 : 16;
    const gapBudget = 24;
    const size = Math.floor(Math.max(180, Math.min(viewW - padX, viewH - hudH - controlsBudget - gapBudget)));
    shell.style.width = `${size}px`;
    shell.style.maxWidth = `${size}px`;
  }

  SyncTouchControlsVisibility() {
    const show = this.isTouchDevice && (this.state === "playing" || this.state === "paused" || this.state === "roulette");
    if (this.touchUi.stickWrap) this.touchUi.stickWrap.hidden = !show;
    if (this.touchUi.actionsWrap) this.touchUi.actionsWrap.hidden = !show;
    // Immersive mobile chrome: hide long marketing/side panels so portrait fits one screen.
    const immersive = this.isTouchDevice && ["playing", "paused", "roulette", "stageIntro", "won", "lost"].includes(this.state);
    document.body.classList.toggle("is-touch-play", immersive);
    document.body.classList.toggle("is-portrait", window.matchMedia("(orientation: portrait)").matches);
    // Defer so layout reflects control visibility before measuring.
    requestAnimationFrame(() => this.FitPortraitStage());
  }

  BindVolumeControls() {
    const bgm = document.getElementById("bgmVolume");
    const sfx = document.getElementById("sfxVolume");
    const bgmPause = document.getElementById("bgmVolumePause");
    const sfxPause = document.getElementById("sfxVolumePause");
    const bgmVal = document.getElementById("bgmVolumeValue");
    const sfxVal = document.getElementById("sfxVolumeValue");
    const mute = document.getElementById("muteToggle");

    const syncLabels = () => {
      if (bgmVal) bgmVal.textContent = String(Math.round(this.audio.bgmVolume * 100));
      if (sfxVal) sfxVal.textContent = String(Math.round(this.audio.sfxVolume * 100));
      if (bgm) bgm.value = String(Math.round(this.audio.bgmVolume * 100));
      if (sfx) sfx.value = String(Math.round(this.audio.sfxVolume * 100));
      if (bgmPause) bgmPause.value = String(Math.round(this.audio.bgmVolume * 100));
      if (sfxPause) sfxPause.value = String(Math.round(this.audio.sfxVolume * 100));
      if (mute) mute.checked = this.audio.muted;
    };

    const onBgm = (ev) => {
      this.audio.Ensure();
      this.audio.SetBgmVolume(Number(ev.target.value) / 100);
      syncLabels();
    };
    const onSfx = (ev) => {
      this.audio.Ensure();
      this.audio.SetSfxVolume(Number(ev.target.value) / 100);
      syncLabels();
    };

    bgm?.addEventListener("input", onBgm);
    sfx?.addEventListener("input", onSfx);
    bgmPause?.addEventListener("input", onBgm);
    sfxPause?.addEventListener("input", onSfx);
    mute?.addEventListener("change", () => {
      this.audio.Ensure();
      this.audio.SetMuted(mute.checked);
      syncLabels();
    });
    syncLabels();
  }

  BindTouchControls() {
    const { stick, knob, fire, pause, hudPause } = this.touchUi;
    if (!stick || !fire) return;

    const stickRadius = () => {
      const base = stick.querySelector(".stick-base");
      return (base?.clientWidth || 118) * 0.5;
    };

    const setKnob = (nx, ny) => {
      if (!knob) return;
      const max = stickRadius() * 0.55;
      knob.style.transform = `translate(${nx * max}px, ${ny * max}px)`;
    };

    const clearStick = () => {
      this.stickPointerId = null;
      this.stickVec.x = 0;
      this.stickVec.y = 0;
      this.touchDir = null;
      setKnob(0, 0);
    };

    const updateStickFromEvent = (ev) => {
      const base = stick.querySelector(".stick-base");
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = ev.clientX - cx;
      let dy = ev.clientY - cy;
      const max = rect.width * 0.5;
      const len = Math.hypot(dx, dy) || 1;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      const nx = dx / max;
      const ny = dy / max;
      this.stickVec.x = nx;
      this.stickVec.y = ny;
      setKnob(nx, ny);

      const dead = 0.28;
      if (Math.hypot(nx, ny) < dead) {
        this.touchDir = null;
        return;
      }
      this.touchDir = Math.abs(nx) > Math.abs(ny)
        ? (nx < 0 ? "left" : "right")
        : (ny < 0 ? "up" : "down");
    };

    stick.addEventListener("pointerdown", (ev) => {
      // Allow reclaim if previous pointer was lost without an up event.
      if (this.stickPointerId !== null && this.stickPointerId !== ev.pointerId) {
        this.stickPointerId = null;
      }
      if (this.stickPointerId !== null) return;
      ev.preventDefault();
      stick.setPointerCapture?.(ev.pointerId);
      this.stickPointerId = ev.pointerId;
      this.audio.Ensure();
      updateStickFromEvent(ev);
    });
    stick.addEventListener("pointermove", (ev) => {
      if (ev.pointerId !== this.stickPointerId) return;
      ev.preventDefault();
      updateStickFromEvent(ev);
    });
    const endStick = (ev) => {
      if (ev.pointerId !== this.stickPointerId) return;
      ev.preventDefault();
      clearStick();
    };
    stick.addEventListener("pointerup", endStick);
    stick.addEventListener("pointercancel", endStick);
    stick.addEventListener("lostpointercapture", () => {
      if (this.stickPointerId !== null) clearStick();
    });

    fire.addEventListener("pointerdown", (ev) => {
      if (this.state === "stageIntro") {
        ev.preventDefault();
        this.SkipStageIntro();
        return;
      }
      if (this.state === "roulette") {
        ev.preventDefault();
        this.RouletteKick(16 + Math.random() * 12);
        return;
      }
      if (this.firePointerId !== null && this.firePointerId !== ev.pointerId) {
        this.firePointerId = null;
      }
      if (this.firePointerId !== null) return;
      ev.preventDefault();
      fire.setPointerCapture?.(ev.pointerId);
      this.firePointerId = ev.pointerId;
      this.touchFire = true;
      fire.classList.add("is-active");
      this.audio.Ensure();
    });
    const endFire = (ev) => {
      if (ev.pointerId !== this.firePointerId) return;
      ev.preventDefault();
      this.firePointerId = null;
      this.touchFire = false;
      fire.classList.remove("is-active");
    };
    fire.addEventListener("pointerup", endFire);
    fire.addEventListener("pointercancel", endFire);
    fire.addEventListener("lostpointercapture", () => {
      this.firePointerId = null;
      this.touchFire = false;
      fire.classList.remove("is-active");
    });

    const onPauseTap = (ev) => {
      ev.preventDefault();
      this.audio.Ensure();
      this.TogglePause();
    };
    pause?.addEventListener("click", onPauseTap);
    hudPause?.addEventListener("click", onPauseTap);
    document.getElementById("desktopPauseButton")?.addEventListener("click", onPauseTap);
  }

  ApplyStageMeta(stageIndex1Based) {
    this.stage = Math.max(1, Math.min(STAGE_COUNT, stageIndex1Based | 0));
    this.stageData = GetStage(this.stage);
    const e = this.stageData.enemies;
    this.totalEnemies = e.basic + e.fast + e.power + e.armor;
    this.spawnSlots = (this.stageData.enemySpawns || [[0, 0], [12, 0], [24, 0]]).map(([x, y]) => ({
      x: x * TILE,
      y: y * TILE,
    }));
    this.SyncStageLabels();
  }

  SyncStageLabels() {
    const label = String(this.stage);
    if (this.hud.stage) this.hud.stage.textContent = label;
    if (this.hud.mobileStage) this.hud.mobileStage.textContent = label;
    if (this.overlays.startTitle) this.overlays.startTitle.textContent = `STAGE ${this.stage}`;
    if (this.overlays.startBlurb) {
      const e = this.stageData.enemies;
      this.overlays.startBlurb.textContent =
        `第 ${this.stage}/${STAGE_COUNT} 关 · 敌军 ${this.totalEnemies}（普${e.basic}/快${e.fast}/强${e.power}/甲${e.armor}）。保卫老鹰。炮弹带重力，水平射击会下坠。七种道具掉率比原版高 50%。`;
    }
  }

  StartCampaign() {
    this.score = 0;
    this.lives = PLAYER_LIVES;
    this.StartGame({ stage: 1, keepStats: false });
  }

  AdvanceStage() {
    if (this.stage >= STAGE_COUNT) {
      this.StartCampaign();
      return;
    }
    const keep = this.player
      ? { power: this.player.power, maxBullets: this.player.maxBullets }
      : { power: 1, maxBullets: 1 };
    this.StartGame({ stage: this.stage + 1, keepStats: keep, keepScore: true, keepLives: true });
  }

  HandleEndPrimary() {
    if (this.endAction === "next") this.AdvanceStage();
    else if (this.endAction === "retry") this.StartGame({ stage: this.stage, keepStats: false, keepScore: false, keepLives: false });
    else this.StartCampaign();
  }

  StartGame({ stage = 1, keepStats = false, keepScore = false, keepLives = false } = {}) {
    this.ApplyStageMeta(stage);
    this.map = BuildStageMap(this.stage);
    this.brickMask = BuildBrickMask(this.map);
    this.bullets = [];
    this.explosions = [];
    this.powerups = [];
    this.enemies = [];
    if (!keepScore) this.score = 0;
    if (!keepLives) this.lives = PLAYER_LIVES;
    this.enemiesRemaining = this.totalEnemies;
    this.spawnTimer = 0.2;
    this.freezeTimer = 0;
    this.shovelTimer = 0;
    this.antigravTimer = 0;
    this.bounceTimer = 0;
    this.ghostTimer = 0;
    this.mirrorTimer = 0;
    this.magnetTimer = 0;
    this.overdriveTimer = 0;
    this.forkTimer = 0;
    this.rapidTimer = 0;
    this.pierceTimer = 0;
    this.spreadTimer = 0;
    this.sniperTimer = 0;
    this.heavyCurseTimer = 0;
    this.enemyRageTimer = 0;
    this.playerStunTimer = 0;
    this.buffToast = null;
    this.roulette = null;
    this.pendingFortRestore = false;
    this.baseAlive = true;
    this.nextSpawnSlot = 0;
    this.respawnTimer = 0;
    this.endAction = "restart";
    this.BuildSpawnQueue();
    this.SpawnPlayer(true, keepStats || null);
    // Enemies spawn after the STAGE curtain finishes.
    this.spawnTimer = 0.15;
    this.overlays.start.hidden = true;
    this.overlays.pause.hidden = true;
    this.overlays.end.hidden = true;
    if (this.overlays.endSecondary) this.overlays.endSecondary.hidden = true;
    this.ResetTouchInput();
    this.SyncTouchControlsVisibility();
    this.UpdateHud();
    this.RenderEnemyIcons();
    this.audio.Ensure();
    this.audio.StopEngine();
    this.audio.StopPowerSpawn();
    this.audio.StopBgm();
    this.BeginStageIntro();
  }

  BeginStageIntro() {
    this.state = "stageIntro";
    this.stageIntro = {
      t: 0,
      phase: "close", // close → hold → open → playing
      closeDur: 0.55,
      holdDur: 1.65,
      openDur: 0.55,
    };
    this.audio.StageStart();
    this.SyncTouchControlsVisibility();
  }

  SkipStageIntro() {
    if (this.state !== "stageIntro" || !this.stageIntro) return;
    // Jump to open if still closing/holding; finish if already opening.
    if (this.stageIntro.phase === "open") {
      this.FinishStageIntro();
      return;
    }
    this.stageIntro.phase = "open";
    this.stageIntro.t = 0;
  }

  UpdateStageIntro(dt) {
    const intro = this.stageIntro;
    if (!intro) return;
    intro.t += dt;
    const dur =
      intro.phase === "close" ? intro.closeDur :
      intro.phase === "hold" ? intro.holdDur :
      intro.openDur;
    if (intro.t >= dur) {
      intro.t = 0;
      if (intro.phase === "close") intro.phase = "hold";
      else if (intro.phase === "hold") intro.phase = "open";
      else this.FinishStageIntro();
    }
  }

  FinishStageIntro() {
    this.stageIntro = null;
    this.state = "playing";
    this.lastTs = 0;
    // Classic: a few enemies already on field when the curtain lifts.
    for (let i = 0; i < 3; i++) {
      this.TrySpawnEnemy(10);
      const last = this.enemies[this.enemies.length - 1];
      if (last) last.spawnFlash = 0;
    }
    this.spawnTimer = 1.2;
    this.UpdateHud();
    this.RenderEnemyIcons();
    this.SyncTouchControlsVisibility();
    this.audio.StartBgm();
  }

  BuildSpawnQueue() {
    const counts = this.stageData.enemies;
    const mix = [];
    for (let i = 0; i < counts.basic; i++) mix.push(ENEMY_TYPES[0]);
    for (let i = 0; i < counts.fast; i++) mix.push(ENEMY_TYPES[1]);
    for (let i = 0; i < counts.power; i++) mix.push(ENEMY_TYPES[2]);
    for (let i = 0; i < counts.armor; i++) mix.push(ENEMY_TYPES[3]);
    for (let i = mix.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mix[i], mix[j]] = [mix[j], mix[i]];
    }
    this.spawnQueue = mix;
  }

  SpawnPlayer(fullProtect, keepStats = null) {
    const [sx, sy] = this.stageData.playerSpawns?.[0] || [8, 24];
    const power = keepStats?.power ?? 1;
    const maxBullets = keepStats?.maxBullets ?? (power >= 2 ? 2 : 1);
    this.player = {
      x: sx * TILE + 2,
      y: sy * TILE + 2,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: "up",
      speed: PLAYER_SPEED,
      power,
      maxBullets,
      alive: true,
      protect: fullProtect ? SPAWN_PROTECT : 2.2,
      fireCd: 0,
      moving: false,
      slipVx: 0,
      slipVy: 0,
      blink: 0,
      animTick: 0,
    };
  }

  TogglePause() {
    if (this.state === "stageIntro") {
      this.SkipStageIntro();
      return;
    }
    if (this.state === "roulette") return; // finish the spin first
    if (this.state === "playing") this.SetPaused(true);
    else if (this.state === "paused") this.SetPaused(false);
  }

  SetPaused(paused) {
    if (paused && this.state === "playing") {
      this.state = "paused";
      this.overlays.pause.hidden = false;
      this.ResetTouchInput();
      this.audio.StopEngine();
      this.audio.StopBgm();
      this.audio.PauseBlip();
      this.SyncTouchControlsVisibility();
    } else if (!paused && this.state === "paused") {
      this.state = "playing";
      this.overlays.pause.hidden = true;
      this.lastTs = 0;
      this.ResetTouchInput();
      this.audio.PauseBlip();
      this.audio.StartBgm();
      // If death timeout was skipped while paused, still respawn.
      if ((!this.player || !this.player.alive) && this.lives > 0 && this.respawnTimer <= 0) {
        this.respawnTimer = 0.05;
      }
      this.SyncTouchControlsVisibility();
    }
  }

  Loop(ts) {
    const dt = this.lastTs ? Math.min(0.033, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    this.frame++;

    if (this.state === "playing") this.Update(dt);
    else if (this.state === "stageIntro") this.UpdateStageIntro(dt);
    else if (this.state === "roulette") this.UpdateRoulette(dt);
    this.Render();
    requestAnimationFrame((t) => this.Loop(t));
  }

  Update(dt) {
    this.waterPhase += dt;
    if (this.freezeTimer > 0) this.freezeTimer -= dt;
    if (this.shovelTimer > 0) {
      this.shovelTimer -= dt;
      if (this.shovelTimer <= 0) this.pendingFortRestore = true;
    }
    if (this.antigravTimer > 0) this.antigravTimer -= dt;
    if (this.bounceTimer > 0) this.bounceTimer -= dt;
    if (this.ghostTimer > 0) this.ghostTimer -= dt;
    if (this.mirrorTimer > 0) this.mirrorTimer -= dt;
    if (this.magnetTimer > 0) this.magnetTimer -= dt;
    if (this.overdriveTimer > 0) this.overdriveTimer -= dt;
    if (this.forkTimer > 0) this.forkTimer -= dt;
    if (this.rapidTimer > 0) this.rapidTimer -= dt;
    if (this.pierceTimer > 0) this.pierceTimer -= dt;
    if (this.spreadTimer > 0) this.spreadTimer -= dt;
    if (this.sniperTimer > 0) this.sniperTimer -= dt;
    if (this.heavyCurseTimer > 0) this.heavyCurseTimer -= dt;
    if (this.enemyRageTimer > 0) this.enemyRageTimer -= dt;
    if (this.playerStunTimer > 0) this.playerStunTimer -= dt;
    if (this.buffToast) {
      this.buffToast.ttl -= dt;
      if (this.buffToast.ttl <= 0) this.buffToast = null;
    }
    if (this.pendingFortRestore) {
      if (this.TryRestoreBaseFort()) this.pendingFortRestore = false;
    }

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnTimer = 0;
        if (this.state === "playing" && this.lives > 0 && (!this.player || !this.player.alive)) {
          // Classic: death resets star power.
          this.SpawnPlayer(true);
          this.UnstickTank(this.player);
        }
      }
    }

    this.UpdatePlayer(dt);
    this.UpdateEnemies(dt);
    this.UpdateBullets(dt);
    this.UpdatePowerups(dt);
    this.UpdateExplosions(dt);
    this.TrySpawnEnemy(dt);
    this.CheckEnd();
    this.UpdateHud();
  }

  GetMoveInput() {
    if (this.touchDir) return this.touchDir;
    if (this.keys.has("arrowup") || this.keys.has("w")) return "up";
    if (this.keys.has("arrowdown") || this.keys.has("s")) return "down";
    if (this.keys.has("arrowleft") || this.keys.has("a")) return "left";
    if (this.keys.has("arrowright") || this.keys.has("d")) return "right";
    return null;
  }

  WantsFire() {
    return this.keys.has(" ") || this.keys.has("j") || this.touchFire;
  }

  UpdatePlayer(dt) {
    const p = this.player;
    if (!p || !p.alive) return;
    if (p.protect > 0) p.protect -= dt;
    if (p.fireCd > 0) p.fireCd -= dt;
    p.blink += dt;

    // Always try to escape accidental embeds (wall / fort / tank overlap).
    this.UnstickTank(p);

    if (this.playerStunTimer > 0) {
      p.moving = false;
      this.audio.SetEngine(false);
      return;
    }

    const input = this.GetMoveInput();
    p.moving = false;

    const onIce = this.TankOnTile(p, TILE_ICE);
    if (input) {
      if (p.dir !== input) {
        p.dir = input;
        // snap lightly when turning — revert if it would embed in a wall
        const ox = p.x;
        const oy = p.y;
        p.x = SnapToGrid(p.x, 4);
        p.y = SnapToGrid(p.y, 4);
        if (this.TankBlocked(p)) {
          p.x = ox;
          p.y = oy;
        }
      }
      const d = DIR[input];
      const speed = p.speed * (onIce ? 1.15 : 1);
      this.MoveTank(p, d.x * speed * dt, d.y * speed * dt);
      p.moving = true;
      if (onIce) {
        if (!p.onIceSfx) {
          this.audio.Ice();
          p.onIceSfx = true;
        }
        p.slipVx = d.x * speed;
        p.slipVy = d.y * speed;
      } else {
        p.onIceSfx = false;
      }
    } else if (onIce && (Math.abs(p.slipVx) > 8 || Math.abs(p.slipVy) > 8)) {
      this.MoveTank(p, p.slipVx * dt, p.slipVy * dt);
      p.slipVx *= 0.92;
      p.slipVy *= 0.92;
      p.moving = true;
    } else {
      p.slipVx = 0;
      p.slipVy = 0;
      p.onIceSfx = false;
    }

    this.audio.SetEngine(p.moving);
    if (p.moving) p.animTick += dt * 10;

    if (this.WantsFire()) this.TryFire(p, true);

    // pickup → physics roulette (outcome not pre-rolled)
    for (const pu of this.powerups) {
      if (!pu.alive) continue;
      if (RectsOverlap(p, { x: pu.x, y: pu.y, w: 28, h: 28 })) {
        pu.alive = false;
        this.OpenRoulette();
      }
    }
  }

  UpdateEnemies(dt) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.spawnFlash > 0) {
        e.spawnFlash -= dt;
        if (e.spawnFlash <= 0) {
          e.spawnFlash = 0;
          this.UnstickTank(e);
        }
        continue;
      }
      this.UnstickTank(e);
      if (e.protect > 0) e.protect -= dt;
      if (e.fireCd > 0) e.fireCd -= dt;

      if (this.freezeTimer > 0) continue;

      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiTimer = 0.4 + Math.random() * 1.2;
        // prefer moving toward player / base
        const roll = Math.random();
        if (roll < 0.45 && this.player?.alive) {
          const dx = this.player.x - e.x;
          const dy = this.player.y - e.y;
          e.dir = DirFromVector(dx, dy);
        } else if (roll < 0.7) {
          // toward base
          e.dir = DirFromVector(12 * TILE - e.x, 24 * TILE - e.y);
        } else {
          e.dir = DIR_KEYS[Math.floor(Math.random() * 4)];
        }
      }

      const d = DIR[e.dir];
      const beforeX = e.x;
      const beforeY = e.y;
      const rage = this.enemyRageTimer > 0 ? 1.55 : 1;
      this.MoveTank(e, d.x * e.speed * rage * dt, d.y * e.speed * rage * dt);
      if (Math.abs(e.x - beforeX) > 0.01 || Math.abs(e.y - beforeY) > 0.01) {
        e.moving = true;
        e.animTick += dt * 10;
      } else {
        e.moving = false;
        // blocked — pick new dir soon
        e.aiTimer = Math.min(e.aiTimer, 0.15);
      }

      // shoot logic: if roughly aligned with player or base, fire
      if (e.fireCd <= 0) {
        const should = Math.random() < 0.025 || this.AlignedForShot(e, this.player) || this.AlignedForShot(e, { x: 12 * TILE, y: 24 * TILE, w: 32, h: 32 });
        if (should) this.TryFire(e, false);
      }
    }

    this.enemies = this.enemies.filter((e) => e.alive || e.deathTimer > 0);
    for (const e of this.enemies) {
      if (!e.alive && e.deathTimer > 0) e.deathTimer -= dt;
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.deathTimer > 0);
  }

  AlignedForShot(from, target) {
    if (!target) return false;
    const cx = from.x + from.w / 2;
    const cy = from.y + from.h / 2;
    const tx = target.x + (target.w || 0) / 2;
    const ty = target.y + (target.h || 0) / 2;
    const tol = 18;
    if (from.dir === "up" || from.dir === "down") return Math.abs(cx - tx) < tol;
    return Math.abs(cy - ty) < tol;
  }

  MoveTank(tank, dx, dy) {
    this.UnstickTank(tank);

    if (dx !== 0) {
      const before = tank.x;
      tank.x += dx;
      if (this.TankBlocked(tank)) {
        tank.x = before;
        this.TrySlideAssist(tank, dx, 0);
      }
      tank.x = Clamp(tank.x, 0, CANVAS_W - tank.w);
    }
    if (dy !== 0) {
      const before = tank.y;
      tank.y += dy;
      if (this.TankBlocked(tank)) {
        tank.y = before;
        this.TrySlideAssist(tank, 0, dy);
      }
      tank.y = Clamp(tank.y, 0, CANVAS_H - tank.h);
    }
  }

  TankBlocked(tank) {
    return this.CollidesTerrain(tank) || this.CollidesTanks(tank);
  }

  UnstickTank(tank) {
    if (!tank || !tank.alive) return false;
    if (!this.TankBlocked(tank)) return false;

    const originX = tank.x;
    const originY = tank.y;
    const steps = [4, 8, 12, 16, 20, 24, 28, 32];
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const dist of steps) {
      for (const [ox, oy] of dirs) {
        tank.x = Clamp(originX + ox * dist, 0, CANVAS_W - tank.w);
        tank.y = Clamp(originY + oy * dist, 0, CANVAS_H - tank.h);
        if (!this.TankBlocked(tank)) return true;
      }
    }
    tank.x = originX;
    tank.y = originY;
    return false;
  }

  TrySlideAssist(tank, dx, dy) {
    // If blocked forward, try a small perpendicular snap so corners don't soft-lock.
    const axis = dx !== 0 ? "y" : "x";
    const origin = tank[axis];
    const snapped = SnapToGrid(origin, 8);
    const limit = axis === "x" ? CANVAS_W - tank.w : CANVAS_H - tank.h;
    const candidates = [snapped, snapped - 8, snapped + 8, origin - 4, origin + 4];
    for (const candidate of candidates) {
      tank[axis] = Clamp(candidate, 0, limit);
      if (dx !== 0) {
        tank.x += dx;
        if (!this.TankBlocked(tank)) return true;
        tank.x -= dx;
      } else {
        tank.y += dy;
        if (!this.TankBlocked(tank)) return true;
        tank.y -= dy;
      }
    }
    tank[axis] = origin;
    return false;
  }

  CollidesTerrain(tank) {
    const ghost = tank === this.player && this.ghostTimer > 0;
    const pads = [
      [tank.x + 3, tank.y + 3],
      [tank.x + tank.w - 4, tank.y + 3],
      [tank.x + 3, tank.y + tank.h - 4],
      [tank.x + tank.w - 4, tank.y + tank.h - 4],
      [tank.x + tank.w / 2, tank.y + tank.h / 2],
    ];
    for (const [px, py] of pads) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
      const t = this.map[ty][tx];
      if (ghost) {
        // Ghost slips through brick & water; steel / base still solid.
        if (t === TILE_STEEL || t === TILE_BASE || t === TILE_BASE_DEAD) return true;
        continue;
      }
      if (t === TILE_BRICK) {
        if (this.BrickSolidAt(px, py)) return true;
        continue;
      }
      if (t === TILE_STEEL || t === TILE_WATER || t === TILE_BASE || t === TILE_BASE_DEAD) return true;
    }
    return false;
  }

  CollidesTanks(self) {
    const bodies = [];
    if (this.player?.alive && self !== this.player) bodies.push(this.player);
    for (const e of this.enemies) {
      // Include spawning tanks so nobody drives into a spawn flash and hard-locks.
      if (e.alive && e !== self) bodies.push(e);
    }
    const box = { x: self.x + 2, y: self.y + 2, w: self.w - 4, h: self.h - 4 };
    for (const o of bodies) {
      const ob = { x: o.x + 2, y: o.y + 2, w: o.w - 4, h: o.h - 4 };
      if (RectsOverlap(box, ob)) return true;
    }
    return false;
  }

  TankOnTile(tank, tileType) {
    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    return this.map[ty][tx] === tileType;
  }

  TryFire(tank, isPlayer) {
    if (isPlayer && this.playerStunTimer > 0) return;
    if (tank.fireCd > 0) return;
    const owned = this.bullets.filter((b) => b.alive && b.owner === tank).length;
    let maxB = isPlayer ? tank.maxBullets : 1;
    if (isPlayer && this.overdriveTimer > 0) maxB = Math.max(maxB, 4);
    if (isPlayer && this.rapidTimer > 0) maxB = Math.max(maxB, 3);
    if (isPlayer && (this.forkTimer > 0 || this.spreadTimer > 0)) maxB = Math.max(maxB, 5);
    if (owned >= maxB) return;

    this.SpawnShell(tank, tank.dir, isPlayer);
    if (isPlayer && this.forkTimer > 0) {
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: -0.38 });
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: 0.38 });
    } else if (isPlayer && this.spreadTimer > 0) {
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: -0.55 });
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: 0.55 });
    }
    if (isPlayer && this.mirrorTimer > 0) {
      const opp = { up: "down", down: "up", left: "right", right: "left" }[tank.dir];
      this.SpawnShell(tank, opp, true, { bonusShot: true });
    }
    if (isPlayer && this.rapidTimer > 0) tank.fireCd = 0.045;
    else if (isPlayer && this.overdriveTimer > 0) tank.fireCd = 0.07;
    else if (isPlayer && this.sniperTimer > 0) tank.fireCd = 0.42;
    else tank.fireCd = isPlayer ? (tank.power >= 2 ? 0.22 : 0.32) : tank.shootCd * (this.enemyRageTimer > 0 ? 0.55 : 1);
    this.audio.Shoot();
  }

  SpawnShell(tank, dirName, isPlayer, opts = {}) {
    const d = DIR[dirName];
    let speedMul = 1;
    if (isPlayer && tank.power >= 2) speedMul *= 1.12;
    if (isPlayer && this.sniperTimer > 0) speedMul *= 1.55;
    if (isPlayer && this.rapidTimer > 0) speedMul *= 1.1;
    const speed = BULLET_SPEED * (tank.bulletBoost || 1) * speedMul;
    let vx = d.x * speed;
    let vy = d.y * speed;
    if (dirName === "left" || dirName === "right") vy -= 90;
    else if (dirName === "up") vy -= 40;

    if (opts.angleOffset) {
      const c = Math.cos(opts.angleOffset);
      const s = Math.sin(opts.angleOffset);
      const rx = vx * c - vy * s;
      const ry = vx * s + vy * c;
      vx = rx;
      vy = ry;
    }

    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    let gravityMul = 1;
    if (isPlayer && this.antigravTimer > 0) gravityMul = -0.35;
    if (isPlayer && this.heavyCurseTimer > 0) gravityMul *= 2.6;
    if (isPlayer && this.sniperTimer > 0) gravityMul *= 0.45;
    const bounceLeft = isPlayer && this.bounceTimer > 0 ? 5 : 0;
    const homing = isPlayer && this.magnetTimer > 0;
    const pierceLeft = isPlayer && this.pierceTimer > 0 ? 3 : 0;

    this.bullets.push({
      x: cx - 4 + d.x * 14,
      y: cy - 4 + d.y * 14,
      w: 8,
      h: 8,
      vx,
      vy,
      alive: true,
      owner: tank,
      isPlayer,
      face: dirName,
      power: isPlayer ? (this.sniperTimer > 0 ? Math.max(tank.power, 3) : tank.power) : (tank.typeId === "power" ? 2 : 1),
      trail: [],
      arm: opts.bonusShot ? 0.12 : 0.22,
      traveled: 0,
      gravityMul,
      bounceLeft,
      pierceLeft,
      homing,
      meteor: !!opts.meteor,
    });
  }

  UpdateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.alive) continue;

      // GRAVITY — the signature mechanic (per-bullet multiplier for antigrav / meteors)
      const gMul = b.gravityMul ?? 1;
      b.vy += GRAVITY * gMul * dt;

      if (b.homing && b.isPlayer) {
        let best = null;
        let bestD = 160;
        for (const e of this.enemies) {
          if (!e.alive || e.spawnFlash > 0) continue;
          const dx = e.x + e.w / 2 - (b.x + 4);
          const dy = e.y + e.h / 2 - (b.y + 4);
          const d = Math.hypot(dx, dy);
          if (d < bestD) {
            bestD = d;
            best = { dx, dy, d };
          }
        }
        if (best && best.d > 1) {
          const steer = 220 * dt;
          b.vx += (best.dx / best.d) * steer;
          b.vy += (best.dy / best.d) * steer;
          const spd = Math.hypot(b.vx, b.vy) || 1;
          const cap = BULLET_SPEED * 1.25;
          if (spd > cap) {
            b.vx = (b.vx / spd) * cap;
            b.vy = (b.vy / spd) * cap;
          }
        }
      }

      const stepX = b.vx * dt;
      const stepY = b.vy * dt;
      b.x += stepX;
      b.y += stepY;
      b.traveled += Math.hypot(stepX, stepY);
      if (b.arm > 0) b.arm -= dt;

      b.trail.push({ x: b.x + 4, y: b.y + 4 });
      if (b.trail.length > 10) b.trail.shift();

      // Screen-edge bounce for bounce shells; otherwise despawn out of bounds.
      if (b.bounceLeft > 0) {
        let bounced = false;
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); bounced = true; }
        if (b.x > CANVAS_W - b.w) { b.x = CANVAS_W - b.w; b.vx = -Math.abs(b.vx); bounced = true; }
        if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) * 0.85; bounced = true; }
        if (b.y > CANVAS_H - b.h) { b.y = CANVAS_H - b.h; b.vy = -Math.abs(b.vy) * 0.85; bounced = true; }
        if (bounced) {
          b.bounceLeft -= 1;
          this.audio.Bounce();
        }
      } else if (b.x < -20 || b.y < -40 || b.x > CANVAS_W + 20 || b.y > CANVAS_H + 40) {
        b.alive = false;
        continue;
      }

      // terrain hit
      if (this.BulletHitTerrain(b)) continue;

      // Armed bullets can hit any tank, including the shooter (gravity self-kill).
      const canSelfHit = b.arm <= 0 || b.traveled >= 36;

      // hit enemies
      for (const e of this.enemies) {
        if (!e.alive || e.spawnFlash > 0) continue;
        if (!canSelfHit && e === b.owner) continue;
        if (RectsOverlap(b, e)) {
          this.DamageEnemy(e, b.power);
          if (b.pierceLeft > 0) {
            b.pierceLeft -= 1;
            b.arm = Math.max(b.arm, 0.05);
          } else {
            b.alive = false;
          }
          break;
        }
      }
      if (!b.alive) continue;

      // hit player (enemy fire, or own returning shell)
      if (this.player?.alive) {
        const isOwnShell = b.owner === this.player;
        if (isOwnShell && !canSelfHit) {
          // still leaving the barrel
        } else if (RectsOverlap(b, this.player)) {
          b.alive = false;
          if (this.player.protect > 0) {
            this.SpawnExplosion(b.x, b.y, 0.5);
            this.audio.Bounce();
          } else {
            this.KillPlayer();
          }
        }
      }

      // bullet vs bullet
      if (b.alive) {
        for (const o of this.bullets) {
          if (!o.alive || o === b || o.isPlayer === b.isPlayer) continue;
          if (RectsOverlap(b, o)) {
            b.alive = false;
            o.alive = false;
            this.SpawnExplosion(b.x, b.y, 0.4);
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  BulletHitTerrain(b) {
    const samples = [
      [b.x + 4, b.y + 4],
      [b.x + 4 + Math.sign(b.vx) * 3, b.y + 4 + Math.sign(b.vy) * 3],
    ];
    for (const [px, py] of samples) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      const t = this.map[ty][tx];
      if (t === TILE_EMPTY || t === TILE_GRASS || t === TILE_ICE || t === TILE_WATER) continue;

      if (t === TILE_BRICK) {
        if (!this.BrickSolidAt(px, py)) continue;
        this.DestroyBrickHalf(tx, ty, b, b.power);
        b.alive = false;
        this.SpawnExplosion(b.x, b.y, 0.45);
        this.audio.Hit();
        return true;
      }
      if (t === TILE_STEEL) {
        if (b.bounceLeft > 0 && b.power < 3) {
          // Ricochet off steel — prefer flipping the stronger axis of motion.
          if (Math.abs(b.vx) >= Math.abs(b.vy)) b.vx *= -1;
          else b.vy *= -1;
          b.x += Math.sign(b.vx) * 4;
          b.y += Math.sign(b.vy) * 4;
          b.bounceLeft -= 1;
          this.audio.Bounce();
          return false;
        }
        if (b.power >= 3) {
          this.map[ty][tx] = TILE_EMPTY;
          this.audio.Hit();
        } else {
          this.audio.Bounce();
        }
        b.alive = false;
        this.SpawnExplosion(b.x, b.y, 0.4);
        return true;
      }
      if (t === TILE_BASE || t === TILE_BASE_DEAD) {
        b.alive = false;
        if (t === TILE_BASE) this.DestroyBase();
        else this.SpawnExplosion(b.x, b.y, 0.4);
        return true;
      }
    }
    return false;
  }

  BrickSolidAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    if (this.map[ty][tx] !== TILE_BRICK) return false;
    const mask = this.brickMask?.[ty]?.[tx] ?? BRICK_FULL;
    if (!mask) return false;
    const ox = px - tx * TILE;
    const oy = py - ty * TILE;
    return (mask & BrickBitAtLocal(ox, oy)) !== 0;
  }

  /** Classic: one shot shaves a half-tile (8px strip); power≥2 clears the whole cell. */
  DestroyBrickHalf(tx, ty, bullet, power) {
    if (!this.brickMask?.[ty]) return;
    if (this.map[ty][tx] !== TILE_BRICK) return;
    let mask = this.brickMask[ty][tx] || BRICK_FULL;
    if (power >= 2) {
      mask = 0;
    } else {
      const face = bullet.face || DirFromVector(bullet.vx, bullet.vy);
      mask &= ~BrickHalfMaskFromDir(face);
    }
    this.brickMask[ty][tx] = mask;
    if (mask === 0) this.map[ty][tx] = TILE_EMPTY;
  }

  SetBrickCell(x, y, on) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    if (on) {
      this.map[y][x] = TILE_BRICK;
      if (!this.brickMask[y]) this.brickMask[y] = new Array(MAP_W).fill(0);
      this.brickMask[y][x] = BRICK_FULL;
    } else {
      if (this.map[y][x] === TILE_BRICK) this.map[y][x] = TILE_EMPTY;
      if (this.brickMask[y]) this.brickMask[y][x] = 0;
    }
  }

  DamageEnemy(e, power) {
    if (e.protect > 0) {
      this.SpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 0.4);
      this.audio.Bounce();
      return;
    }
    e.hp -= Math.max(1, power >= 3 ? 2 : 1);
    this.SpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 0.55);
    this.audio.Hit();
    if (e.hp <= 0) {
      e.alive = false;
      e.deathTimer = 0.01;
      this.score += e.score;
      this.SpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 1);
      this.audio.Explode();
      // Classic: only flashing (dropsPower) tanks drop. Rate +50% vs original ~0.20.
      if (e.dropsPower) this.DropPowerup(e.x, e.y);
      this.RenderEnemyIcons();
    }
  }

  KillPlayer() {
    const p = this.player;
    if (!p?.alive) return;
    p.alive = false;
    this.audio.StopEngine();
    this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 1.2);
    this.audio.Explode();
    this.lives -= 1;
    this.UpdateHud();
    if (this.lives <= 0) {
      this.lives = 0;
      this.respawnTimer = 0;
      this.EndGame(false, "生命耗尽。老鹰还在，但无人驾驶。");
      return;
    }
    // Use update-loop timer so pause cannot cancel respawn forever.
    this.respawnTimer = 0.9;
  }

  DestroyBase() {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === TILE_BASE) this.map[y][x] = TILE_BASE_DEAD;
      }
    }
    this.SpawnExplosion(13 * TILE, 25 * TILE, 1.4);
    this.audio.Lose();
    this.EndGame(false, "总部被毁。战役失败。");
  }

  DropPowerup(x, y) {
    // Field token only — the roulette decides the real prize with physics.
    this.powerups.push({
      x: Clamp(x, 8, CANVAS_W - 32),
      y: Clamp(y, 8, CANVAS_H - 32),
      kind: POWER.token,
      alive: true,
      ttl: 14,
      blink: 0,
    });
    this.audio.PowerSpawn();
  }

  ShowBuffToast(text) {
    this.buffToast = { text, ttl: 3.2 };
  }

  OpenRoulette() {
    this.audio.StopEngine();
    this.ResetTouchInput();
    this.state = "roulette";
    const segments = PickRouletteSegments(ROULETTE_SIZE);
    this.roulette = {
      angle: Math.random() * Math.PI * 2, // orientation only — NOT the result
      omega: 0,
      dragging: false,
      pointerId: null,
      lastAng: null,
      lastT: 0,
      stillT: 0,
      hasSpun: false,
      phase: "spin", // spin | result
      result: null,
      resultT: 0,
      segments,
      cx: CANVAS_W / 2,
      cy: CANVAS_H / 2 + 28,
      radius: 138,
    };
    this.SyncTouchControlsVisibility();
    const nBad = segments.filter((s) => s.tier === "bad").length;
    const nUltra = segments.filter((s) => s.tier === "ultra").length;
    this.ShowBuffToast(`转轮 ×${segments.length}（绿好 / 金超 / 红负${nBad}）`);
    this.audio.PowerSpawn();
  }

  RouletteSegments() {
    return this.roulette?.segments || [];
  }

  CanvasToLocal(ev) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((ev.clientY - rect.top) / rect.height) * CANVAS_H;
    return { x, y };
  }

  OnCanvasPointerDown(ev) {
    if (this.state === "stageIntro") {
      this.SkipStageIntro();
      return;
    }
    if (this.state !== "roulette" || !this.roulette || this.roulette.phase !== "spin") return;
    const r = this.roulette;
    const p = this.CanvasToLocal(ev);
    const dx = p.x - r.cx;
    const dy = p.y - r.cy;
    if (Math.hypot(dx, dy) > r.radius + 8) return;
    ev.preventDefault();
    this.canvas.setPointerCapture?.(ev.pointerId);
    r.dragging = true;
    r.pointerId = ev.pointerId;
    r.lastAng = Math.atan2(dy, dx);
    r.lastT = performance.now() / 1000;
    r.stillT = 0;
  }

  OnCanvasPointerMove(ev) {
    const r = this.roulette;
    if (this.state !== "roulette" || !r?.dragging || ev.pointerId !== r.pointerId) return;
    const p = this.CanvasToLocal(ev);
    const ang = Math.atan2(p.y - r.cy, p.x - r.cx);
    const now = performance.now() / 1000;
    let dAng = ang - r.lastAng;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    const dt = Math.max(0.001, now - r.lastT);
    // Direct drive + flick impulse from angular velocity of the finger.
    r.angle += dAng;
    const flick = dAng / dt;
    r.omega = Clamp(r.omega * 0.35 + flick * 0.65, -ROULETTE_MAX_OMEGA, ROULETTE_MAX_OMEGA);
    if (Math.abs(r.omega) > 0.5 || Math.abs(dAng) > 0.02) r.hasSpun = true;
    r.lastAng = ang;
    r.lastT = now;
  }

  OnCanvasPointerUp(ev) {
    const r = this.roulette;
    if (!r || ev.pointerId !== r.pointerId) return;
    r.dragging = false;
    r.pointerId = null;
    r.lastAng = null;
  }

  RouletteKick(amount) {
    const r = this.roulette;
    if (!r || r.phase !== "spin" || r.dragging) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    r.omega = Clamp(r.omega + dir * amount, -ROULETTE_MAX_OMEGA, ROULETTE_MAX_OMEGA);
    r.hasSpun = true;
    r.stillT = 0;
    this.audio.Shoot();
  }

  UpdateRoulette(dt) {
    const r = this.roulette;
    if (!r) return;

    if (r.phase === "result") {
      r.resultT += dt;
      if (r.resultT >= 1.85) this.CloseRoulette();
      return;
    }

    if (!r.dragging) {
      // Viscous + coulomb friction — real deceleration, no pre-chosen stop angle.
      r.omega *= Math.exp(-ROULETTE_FRICTION * dt);
      if (r.omega > 0) r.omega = Math.max(0, r.omega - ROULETTE_COULOMB * dt);
      else if (r.omega < 0) r.omega = Math.min(0, r.omega + ROULETTE_COULOMB * dt);
      r.angle += r.omega * dt;
      if (Math.abs(r.omega) < ROULETTE_STOP) {
        r.omega = 0;
        if (r.hasSpun) {
          r.stillT += dt;
          if (r.stillT > 0.22) this.ResolveRoulette();
        }
      } else {
        r.stillT = 0;
        r.hasSpun = true;
      }
    } else {
      r.stillT = 0;
    }

    if (this.buffToast) {
      this.buffToast.ttl -= dt;
      if (this.buffToast.ttl <= 0) this.buffToast = null;
    }
  }

  /** Needle fixed at top; segment under it wins from current angle. */
  RouletteIndexAtNeedle() {
    const segs = this.RouletteSegments();
    const n = Math.max(1, segs.length);
    const slice = (Math.PI * 2) / n;
    // Segment i is drawn from angle (i*slice + wheel.angle).
    // Needle at -PI/2 (top). Find i where needle lies in that wedge.
    let a = (-Math.PI / 2 - this.roulette.angle) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return Math.floor(a / slice) % n;
  }

  ResolveRoulette() {
    const r = this.roulette;
    if (!r || r.phase !== "spin") return;
    const idx = this.RouletteIndexAtNeedle();
    const seg = this.RouletteSegments()[idx];
    if (!seg) return;
    r.phase = "result";
    r.result = seg;
    r.resultT = 0;
    r.omega = 0;
    r.dragging = false;
    this.ApplyPowerup(seg.kind);
  }

  CloseRoulette() {
    this.roulette = null;
    if (this.state === "roulette") this.state = "playing";
    this.lastTs = 0;
    this.SyncTouchControlsVisibility();
  }

  ApplyPowerup(kind) {
    this.audio.Power();
    const p = this.player;
    switch (kind) {
      case POWER.star:
        if (p) {
          p.power = Math.min(3, p.power + 1);
          if (p.power >= 2) p.maxBullets = Math.max(p.maxBullets, 2);
          if (p.power >= 3) {
            p.maxBullets = Math.max(p.maxBullets, 3);
            this.overdriveTimer = Math.max(this.overdriveTimer, 8);
          }
        }
        this.ShowBuffToast(p?.power >= 3 ? "★ 火力满载 + 超武" : "★ 火力升级");
        break;
      case POWER.gun:
        if (p) {
          p.power = 3;
          p.maxBullets = Math.max(p.maxBullets, 3);
        }
        this.overdriveTimer = Math.max(this.overdriveTimer, 10);
        this.ShowBuffToast("手枪：钢墙可破 + 疯射");
        break;
      case POWER.life:
        this.lives += 2;
        this.ShowBuffToast("额外生命 +2");
        break;
      case POWER.helmet:
        if (p) p.protect = Math.max(p.protect, 16);
        this.ShowBuffToast("护盾 16 秒");
        break;
      case POWER.clock:
        this.freezeTimer = 16;
        this.ShowBuffToast("敌军冻结 16 秒");
        break;
      case POWER.bomb:
        this.KillAllFieldEnemies();
        this.NukeBricks(0.45);
        this.ShowBuffToast("全场爆破 + 掀砖");
        break;
      case POWER.shovel:
        this.shovelTimer = 22;
        this.pendingFortRestore = false;
        this.FortifyBase(true);
        this.ShowBuffToast("总部钢墙加固 22 秒");
        break;
      case POWER.antigrav:
        this.antigravTimer = 18;
        this.ShowBuffToast("反重力 18 秒！");
        break;
      case POWER.bounce:
        this.bounceTimer = 20;
        this.ShowBuffToast("弹跳弹 20 秒！");
        break;
      case POWER.meteor:
        this.SpawnMeteorRain(16);
        this.ShowBuffToast("陨石雨 ×16");
        break;
      case POWER.ghost:
        this.ghostTimer = 16;
        if (p) {
          this.UnstickTank(p);
          p.protect = Math.max(p.protect, 4);
        }
        this.ShowBuffToast("幽灵穿墙 16 秒");
        break;
      case POWER.mirror:
        this.mirrorTimer = 18;
        this.ShowBuffToast("镜像炮 18 秒");
        break;
      case POWER.magnet:
        this.magnetTimer = 18;
        this.ShowBuffToast("磁导追踪 18 秒");
        break;
      case POWER.warp:
        this.WarpPlayer();
        if (p) p.protect = Math.max(p.protect, 5);
        this.ShowBuffToast("闪现 + 短盾");
        break;
      case POWER.fork:
        this.forkTimer = 16;
        this.spreadTimer = 0;
        this.ShowBuffToast("分叉弹：一次三发 16 秒");
        break;
      case POWER.rapid:
        this.rapidTimer = 14;
        if (p) p.maxBullets = Math.max(p.maxBullets, 3);
        this.ShowBuffToast("超快射速 14 秒！");
        break;
      case POWER.pierce:
        this.pierceTimer = 14;
        this.ShowBuffToast("穿甲弹：可穿透敌坦 14 秒");
        break;
      case POWER.spread:
        this.spreadTimer = 14;
        this.forkTimer = 0;
        this.ShowBuffToast("散射弹：大角度三发 14 秒");
        break;
      case POWER.sniper:
        this.sniperTimer = 12;
        if (p) p.power = Math.max(p.power, 3);
        this.ShowBuffToast("狙击：高速低坠高伤 12 秒");
        break;
      case POWER.nuke:
        this.KillAllFieldEnemies();
        this.NukeBricks(0.92);
        this.SpawnMeteorRain(6);
        if (p) {
          p.protect = Math.max(p.protect, 10);
          p.power = 3;
          p.maxBullets = Math.max(p.maxBullets, 3);
        }
        this.ShowBuffToast("☢ 核爆：清场+掀砖+陨石");
        break;
      case POWER.overdrive:
        if (p) {
          p.power = 3;
          p.maxBullets = 4;
          p.protect = Math.max(p.protect, 6);
        }
        this.overdriveTimer = 24;
        this.bounceTimer = Math.max(this.bounceTimer, 14);
        this.magnetTimer = Math.max(this.magnetTimer, 14);
        this.antigravTimer = Math.max(this.antigravTimer, 8);
        this.ShowBuffToast("超武：四联疯射 24 秒！！");
        break;
      case POWER.apocalypse:
        this.freezeTimer = 18;
        this.KillAllFieldEnemies();
        this.NukeBricks(0.7);
        this.SpawnMeteorRain(24);
        this.FortifyBase(true);
        this.shovelTimer = Math.max(this.shovelTimer, 16);
        this.overdriveTimer = Math.max(this.overdriveTimer, 14);
        if (p) {
          p.power = 3;
          p.maxBullets = 4;
          p.protect = 20;
        }
        this.bounceTimer = Math.max(this.bounceTimer, 12);
        this.magnetTimer = Math.max(this.magnetTimer, 12);
        this.ShowBuffToast("天罚降临！！清场+陨石海");
        break;
      case POWER.juggernaut:
        if (p) {
          p.power = 3;
          p.maxBullets = 4;
          p.protect = 28;
        }
        this.ghostTimer = 22;
        this.bounceTimer = 22;
        this.magnetTimer = 22;
        this.antigravTimer = 12;
        this.overdriveTimer = Math.max(this.overdriveTimer, 12);
        this.ShowBuffToast("霸体：几乎无敌的 22 秒！！");
        break;
      case POWER.spawnExtra:
        this.ForceSpawnExtras(4);
        this.ShowBuffToast("⚠ 敌军援军 ×4");
        break;
      case POWER.enemyShield:
        for (const e of this.enemies) {
          if (e.alive) e.protect = Math.max(e.protect || 0, 14);
        }
        this.ShowBuffToast("⚠ 全员敌盾");
        break;
      case POWER.heavyCurse:
        this.heavyCurseTimer = 14;
        this.antigravTimer = 0;
        this.ShowBuffToast("⚠ 超重诅咒：弹更坠");
        break;
      case POWER.enemyRage:
        this.enemyRageTimer = 12;
        this.ShowBuffToast("⚠ 敌军狂暴");
        break;
      case POWER.softStun:
        this.playerStunTimer = 2.8;
        this.ShowBuffToast("⚠ 眩晕！动不了");
        break;
      case POWER.fortBreak:
        this.BreakBaseFort();
        this.ShowBuffToast("⚠ 堡垒崩塌");
        break;
      default:
        break;
    }
    this.UpdateHud();
  }

  KillAllFieldEnemies() {
    for (const e of this.enemies) {
      if (e.alive && e.spawnFlash <= 0) {
        e.hp = 0;
        e.alive = false;
        e.deathTimer = 0.01;
        this.score += e.score;
        this.SpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 1.1);
      }
    }
    this.audio.Explode();
    this.RenderEnemyIcons();
  }

  NukeBricks(chance = 0.55) {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === TILE_BRICK && Math.random() < chance) this.SetBrickCell(x, y, false);
      }
    }
  }

  BreakBaseFort() {
    const cells = [
      [11, 23], [12, 23], [13, 23], [14, 23],
      [11, 24], [14, 24],
      [11, 25], [14, 25],
    ];
    for (const [x, y] of cells) {
      if (this.map[y][x] === TILE_BRICK) this.SetBrickCell(x, y, false);
      else if (this.map[y][x] === TILE_STEEL) this.map[y][x] = TILE_EMPTY;
    }
    this.shovelTimer = 0;
    this.pendingFortRestore = false;
  }

  ForceSpawnExtras(n) {
    for (let i = 0; i < n; i++) {
      const type = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
      this.spawnQueue.unshift(type);
    }
    this.totalEnemies += n;
    // Try to dump them onto the field beyond the usual cap.
    for (let i = 0; i < n; i++) this.TrySpawnEnemyForced();
    this.RenderEnemyIcons();
    this.UpdateHud();
  }

  TrySpawnEnemyForced() {
    if (!this.spawnQueue.length) return;
    const slot = this.spawnSlots[this.nextSpawnSlot % this.spawnSlots.length];
    this.nextSpawnSlot++;
    const type = this.spawnQueue.shift();
    const enemy = {
      x: slot.x + 2,
      y: slot.y + 2,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: "down",
      speed: type.speed,
      hp: type.hp,
      maxHp: type.hp,
      score: type.score,
      shootCd: type.shootCd,
      bulletBoost: type.bulletBoost || 1,
      typeId: type.id,
      texture: type.texture,
      alive: true,
      fireCd: 0.4,
      aiTimer: 0.2,
      spawnFlash: 0.35,
      protect: 0,
      dropsPower: Math.random() < POWER_DROP_RATE,
      deathTimer: 0,
      animTick: 0,
      moving: false,
    };
    this.enemies.push(enemy);
    this.UnstickTank(enemy);
  }

  SpawnMeteorRain(count = 6) {
    const owner = this.player;
    for (let i = 0; i < count; i++) {
      const x = 24 + Math.random() * (CANVAS_W - 48);
      this.bullets.push({
        x,
        y: -30 - i * 14,
        w: 10,
        h: 10,
        vx: (Math.random() - 0.5) * 70,
        vy: 50 + Math.random() * 50,
        alive: true,
        owner,
        isPlayer: true,
        power: Math.max(2, owner?.power || 2),
        trail: [],
        arm: 0.3,
        traveled: 0,
        gravityMul: 2.4,
        bounceLeft: 0,
        pierceLeft: 0,
        face: "down",
        homing: false,
        meteor: true,
      });
    }
    this.audio.Explode();
  }

  WarpPlayer() {
    const p = this.player;
    if (!p?.alive) return;
    const candidates = [];
    for (let y = 0; y < MAP_H - 1; y++) {
      for (let x = 0; x < MAP_W - 1; x++) {
        const ok = [0, 1].every((oy) =>
          [0, 1].every((ox) => {
            const t = this.map[y + oy][x + ox];
            return t === TILE_EMPTY || t === TILE_GRASS || t === TILE_ICE;
          })
        );
        if (!ok) continue;
        candidates.push({ x: x * TILE + 2, y: y * TILE + 2 });
      }
    }
    const far = candidates.filter((c) => Math.hypot(c.x - p.x, c.y - p.y) > 80);
    const pool = far.length ? far : candidates;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 0.7);
    p.x = pick.x;
    p.y = pick.y;
    p.protect = Math.max(p.protect, 1.5);
    this.UnstickTank(p);
    this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 0.7);
  }

  FortifyBase(steel) {
    const cells = [
      [11, 23], [12, 23], [13, 23], [14, 23],
      [11, 24], [14, 24],
      [11, 25], [14, 25],
    ];
    for (const [x, y] of cells) {
      if (this.map[y][x] === TILE_BASE || this.map[y][x] === TILE_BASE_DEAD) continue;
      // Never bury a live tank inside fort walls — that soft-locks movement.
      if (this.TileOccupiedByTank(x, y)) continue;
      if (steel) {
        this.map[y][x] = TILE_STEEL;
        if (this.brickMask[y]) this.brickMask[y][x] = 0;
      } else {
        this.SetBrickCell(x, y, true);
      }
    }
    if (this.player?.alive) this.UnstickTank(this.player);
    for (const e of this.enemies) {
      if (e.alive) this.UnstickTank(e);
    }
  }

  TileOccupiedByTank(tx, ty) {
    const rect = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
    if (this.player?.alive && RectsOverlap(this.player, rect)) return true;
    for (const e of this.enemies) {
      if (e.alive && RectsOverlap(e, rect)) return true;
    }
    return false;
  }

  TryRestoreBaseFort() {
    // Defer restore while any fort cell is occupied, otherwise wait one frame and place free cells.
    const cells = [
      [11, 23], [12, 23], [13, 23], [14, 23],
      [11, 24], [14, 24],
      [11, 25], [14, 25],
    ];
    let blocked = false;
    for (const [x, y] of cells) {
      if (this.map[y][x] === TILE_BASE || this.map[y][x] === TILE_BASE_DEAD) continue;
      if (this.TileOccupiedByTank(x, y)) {
        blocked = true;
        continue;
      }
      this.SetBrickCell(x, y, true);
    }
    if (this.player?.alive) this.UnstickTank(this.player);
    return !blocked;
  }

  RestoreBaseFort() {
    this.TryRestoreBaseFort();
  }

  UpdatePowerups(dt) {
    for (const pu of this.powerups) {
      if (!pu.alive) continue;
      pu.ttl -= dt;
      pu.blink += dt;
      if (pu.ttl <= 0) pu.alive = false;
    }
    this.powerups = this.powerups.filter((p) => p.alive);
    if (this.powerups.length === 0) this.audio.StopPowerSpawn();
  }

  TrySpawnEnemy(dt) {
    const aliveCount = this.enemies.filter((e) => e.alive).length;
    const remainingToSpawn = this.spawnQueue.length;
    this.enemiesRemaining = remainingToSpawn + aliveCount;
    if (remainingToSpawn <= 0) return;
    if (aliveCount >= MAX_ENEMIES_ON_FIELD) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 2.2;

    const slot = this.spawnSlots[this.nextSpawnSlot % this.spawnSlots.length];
    this.nextSpawnSlot++;
    const type = this.spawnQueue.shift();

    // ensure slot free
    const probe = { x: slot.x + 2, y: slot.y + 2, w: TANK_SIZE, h: TANK_SIZE };
    if (this.CollidesTanks(probe) || (this.player?.alive && RectsOverlap(probe, this.player))) {
      this.spawnQueue.unshift(type);
      this.spawnTimer = 0.6;
      return;
    }

    const enemy = {
      x: slot.x + 2,
      y: slot.y + 2,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: "down",
      speed: type.speed,
      hp: type.hp,
      maxHp: type.hp,
      score: type.score,
      shootCd: type.shootCd,
      bulletBoost: type.bulletBoost || 1,
      typeId: type.id,
      texture: type.texture,
      alive: true,
      fireCd: 0.8,
      aiTimer: 0.3,
      spawnFlash: 1.0,
      protect: 0,
      dropsPower: type.id === "armor" || Math.random() < POWER_DROP_RATE,
      deathTimer: 0,
      animTick: 0,
      moving: false,
    };
    this.enemies.push(enemy);
    this.RenderEnemyIcons();
  }

  SpawnExplosion(x, y, scale = 1) {
    this.explosions.push({
      x,
      y,
      t: 0,
      dur: 0.35 + scale * 0.1,
      scale,
    });
  }

  UpdateExplosions(dt) {
    for (const ex of this.explosions) ex.t += dt;
    this.explosions = this.explosions.filter((ex) => ex.t < ex.dur);
  }

  CheckEnd() {
    if (this.state !== "playing") return;
    if (!this.baseAlive) return;
    const alive = this.enemies.filter((e) => e.alive).length;
    if (alive === 0 && this.spawnQueue.length === 0) {
      if (this.stage < STAGE_COUNT) {
        this.EndGame(true, `第 ${this.stage} 关肃清！得分 ${this.score}`, "next");
      } else {
        this.EndGame(true, `五关全通！最终得分 ${this.score}`, "restart");
      }
    }
  }

  EndGame(won, message, action = "restart") {
    this.state = won ? "won" : "lost";
    this.endAction = won ? action : "retry";
    this.overlays.end.hidden = false;
    this.overlays.endTitle.textContent = won
      ? (this.stage >= STAGE_COUNT && action === "restart" ? "战役胜利" : "关卡通过")
      : "游戏结束";
    this.overlays.endMessage.textContent = message;
    if (this.overlays.endPrimary) {
      this.overlays.endPrimary.textContent = won
        ? (action === "next" ? "下一关" : "再来一局")
        : "重试本关";
    }
    if (this.overlays.endSecondary) {
      // Keep a second shortcut only when advancing — same action as primary.
      this.overlays.endSecondary.hidden = true;
    }
    this.respawnTimer = 0;
    this.ResetTouchInput();
    this.SyncTouchControlsVisibility();
    if (won) this.audio.Win();
    else this.audio.Lose();
  }

  UpdateHud() {
    const lives = String(Math.max(0, this.lives));
    const power = String(this.player?.power ?? 1);
    const score = String(this.score);
    const remain = String(this.spawnQueue.length + this.enemies.filter((e) => e.alive).length);
    const stage = String(this.stage);
    this.hud.lives.textContent = lives;
    this.hud.power.textContent = power;
    this.hud.score.textContent = score;
    this.hud.remain.textContent = remain;
    if (this.hud.stage) this.hud.stage.textContent = stage;
    if (this.hud.mobileLives) this.hud.mobileLives.textContent = lives;
    if (this.hud.mobilePower) this.hud.mobilePower.textContent = power;
    if (this.hud.mobileScore) this.hud.mobileScore.textContent = score;
    if (this.hud.mobileRemain) this.hud.mobileRemain.textContent = remain;
    if (this.hud.mobileStage) this.hud.mobileStage.textContent = stage;
  }

  RenderEnemyIcons() {
    const queued = this.spawnQueue?.length ?? this.totalEnemies;
    const alive = this.enemies.filter((e) => e.alive).length;
    const pending = this.state === "ready" || this.state === "boot" ? this.totalEnemies : queued + alive;
    const killed = Math.max(0, this.totalEnemies - pending);
    const box = this.hud.enemyIcons;
    box.innerHTML = "";
    for (let i = 0; i < this.totalEnemies; i++) {
      const icon = document.createElement("i");
      if (i < killed) icon.classList.add("gone");
      box.appendChild(icon);
    }
  }

  DrawBootFrame() {
    this.ApplyStageMeta(this.stage || 1);
    this.state = "ready";
    this.map = BuildStageMap(this.stage);
    this.brickMask = BuildBrickMask(this.map);
    this.Render();
  }

  Render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (this.state === "stageIntro") {
      this.DrawStageIntro(ctx);
      return;
    }

    this.DrawGround(ctx);
    this.DrawTiles(ctx, false); // non-grass
    this.DrawBase(ctx);

    for (const pu of this.powerups) this.DrawPowerup(ctx, pu);
    for (const e of this.enemies) if (e.alive) this.DrawTank(ctx, e, false);
    if (this.player?.alive) this.DrawTank(ctx, this.player, true);
    for (const b of this.bullets) this.DrawBullet(ctx, b);
    this.DrawTiles(ctx, true); // grass on top
    for (const ex of this.explosions) this.DrawExplosion(ctx, ex);

    // gravity hint arc when aiming sideways/up (playing only)
    if (this.state === "playing" && this.player?.alive) this.DrawAimGhost(ctx);
    this.DrawBuffHud(ctx);
    if (this.state === "roulette") this.DrawRoulette(ctx);
  }

  /** Classic Battle City curtain: grey shutters + STAGE N. */
  DrawStageIntro(ctx) {
    const intro = this.stageIntro;
    if (!intro) return;

    const dur =
      intro.phase === "close" ? intro.closeDur :
      intro.phase === "hold" ? intro.holdDur :
      intro.openDur;
    const u = Clamp(intro.t / Math.max(0.001, dur), 0, 1);

    // Underlay: stage map peeks during close/open.
    if (intro.phase === "close" || intro.phase === "open") {
      this.DrawGround(ctx);
      this.DrawTiles(ctx, false);
      this.DrawBase(ctx);
      if (this.player?.alive) this.DrawTank(ctx, this.player, true);
      this.DrawTiles(ctx, true);
    } else {
      ctx.fillStyle = "#636363";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // Curtain coverage: 1 = fully closed, 0 = open.
    let cover = 1;
    if (intro.phase === "close") cover = u;
    else if (intro.phase === "hold") cover = 1;
    else cover = 1 - u;

    const half = CANVAS_H / 2;
    const h = half * cover;
    ctx.fillStyle = "#737373";
    ctx.fillRect(0, 0, CANVAS_W, h);
    ctx.fillRect(0, CANVAS_H - h, CANVAS_W, h);

    // Seam line when nearly closed
    if (cover > 0.92) {
      ctx.fillStyle = "#4a4a4a";
      ctx.fillRect(0, half - 1, CANVAS_W, 2);
    }

    // STAGE label while closed enough
    if (cover > 0.55) {
      const fade = Clamp((cover - 0.55) / 0.35, 0, 1);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = "#000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 36px monospace";
      ctx.fillText("STAGE", CANVAS_W / 2, CANVAS_H / 2 - 28);

      // Big stage number with a slight blink on hold
      const blink = intro.phase === "hold" && Math.floor(intro.t * 6) % 8 === 0 ? 0.55 : 1;
      ctx.globalAlpha = fade * blink;
      ctx.font = "bold 64px monospace";
      ctx.fillText(String(this.stage), CANVAS_W / 2, CANVAS_H / 2 + 28);

      ctx.globalAlpha = fade * 0.9;
      ctx.font = "bold 16px monospace";
      ctx.fillText(`第 ${this.stage} 关 / 共 ${STAGE_COUNT} 关`, CANVAS_W / 2, CANVAS_H / 2 + 72);

      if (intro.phase === "hold") {
        ctx.globalAlpha = fade * (0.35 + 0.35 * Math.sin(intro.t * 4));
        ctx.font = "12px monospace";
        ctx.fillText("按空格 / 点击跳过", CANVAS_W / 2, CANVAS_H - 28);
      }
      ctx.restore();
    }
  }

  DrawGround(ctx) {
    // Classic Battle City playfield is flat black.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  DrawTiles(ctx, grassOnly) {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (grassOnly) {
          if (t === TILE_GRASS) this.DrawGrass(ctx, px, py);
          continue;
        }
        if (t === TILE_BRICK) this.DrawBrick(ctx, px, py);
        else if (t === TILE_STEEL) this.DrawSteel(ctx, px, py);
        else if (t === TILE_WATER) this.DrawWater(ctx, px, py);
        else if (t === TILE_ICE) this.DrawIce(ctx, px, py);
      }
    }
  }

  DrawBrick(ctx, px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const mask = this.brickMask?.[ty]?.[tx] ?? BRICK_FULL;
    if (!mask) return;
    const [gx, gy] = TILE_SHEET.brick;
    // Draw remaining 8×8 quarters — classic half-brick look.
    if (mask & BRICK_TL) this.BlitGrid(ctx, gx, gy, px, py, 8, 8, 1, 1);
    if (mask & BRICK_TR) this.BlitGrid(ctx, gx, gy, px + 8, py, 8, 8, 1, 1);
    if (mask & BRICK_BL) this.BlitGrid(ctx, gx, gy, px, py + 8, 8, 8, 1, 1);
    if (mask & BRICK_BR) this.BlitGrid(ctx, gx, gy, px + 8, py + 8, 8, 8, 1, 1);
  }

  DrawSteel(ctx, px, py) {
    const [gx, gy] = TILE_SHEET.steel;
    this.BlitGrid(ctx, gx, gy, px, py, TILE, TILE, 1, 1);
  }

  DrawWater(ctx, px, py) {
    const frames = TILE_SHEET.water;
    const idx = Math.floor(this.waterPhase * 3) % frames.length;
    const [gx, gy] = frames[idx];
    this.BlitGrid(ctx, gx, gy, px, py, TILE, TILE, 1, 1);
  }

  DrawIce(ctx, px, py) {
    const [gx, gy] = TILE_SHEET.ice;
    this.BlitGrid(ctx, gx, gy, px, py, TILE, TILE, 1, 1);
  }

  DrawGrass(ctx, px, py) {
    const [gx, gy] = TILE_SHEET.bush;
    this.BlitGrid(ctx, gx, gy, px, py, TILE, TILE, 1, 1);
  }

  DrawBase(ctx) {
    const bx = 12 * TILE;
    const by = 24 * TILE;
    const key = this.baseAlive ? "baseAlive" : "baseDead";
    const [gx, gy] = TILE_SHEET[key];
    this.BlitGrid(ctx, gx, gy, bx, by, TILE * 2, TILE * 2, 2, 2);
  }

  TankSheetOrigin(tank, isPlayer) {
    const dirCol = TANK_DIR_COL[tank.dir] ?? 0;
    const anim = Math.floor(tank.animTick || 0) % 2;
    const colOff = anim * 2;
    if (isPlayer) {
      const tier = Math.max(0, Math.min(3, (tank.power || 1) - 1));
      return { gx: dirCol + colOff, gy: tier * 2 };
    }
    const spec = ENEMY_SHEET[tank.texture] || ENEMY_SHEET.enemyBasic;
    let row = spec.row;
    if (tank.dropsPower && Math.floor(this.frame / 8) % 2 === 0) row = spec.redRow;
    // Armor HP flash: cycle brightness via red sheet when damaged hard.
    if (tank.maxHp > 1 && tank.hp <= 2 && Math.floor(this.frame / 6) % 2 === 0) {
      row = spec.redRow;
    }
    return { gx: spec.col + dirCol + colOff, gy: row };
  }

  DrawTank(ctx, tank, isPlayer) {
    if (tank.spawnFlash > 0) {
      const frames = FX_SHEET.spawn;
      const idx = Math.min(frames.length - 1, Math.floor((1 - tank.spawnFlash) * frames.length));
      const [gx, gy] = frames[idx];
      this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);
      return;
    }

    const ghosting = isPlayer && this.ghostTimer > 0;
    if (ghosting) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(this.frame * 0.35);
    const { gx, gy } = this.TankSheetOrigin(tank, isPlayer);
    this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);
    if (ghosting) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(200,160,255,0.7)";
      ctx.strokeRect(tank.x + 1, tank.y + 1, tank.w - 2, tank.h - 2);
    }

    if (tank.protect > 0) {
      // Outline-only shield frames (black keyed transparent) — scale up so body stays readable.
      const [sx, sy] = FX_SHEET.shield[Math.floor(this.frame / 4) % 2];
      const pad = 3;
      this.BlitGrid(ctx, sx, sy, tank.x - pad, tank.y - pad, tank.w + pad * 2, tank.h + pad * 2);
      // Soft pulse ring so shield reads even when sheet contrast is low.
      const pulse = 0.45 + 0.35 * Math.abs(Math.sin(this.frame * 0.28));
      ctx.strokeStyle = `rgba(200,240,255,${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(tank.x - 1, tank.y - 1, tank.w + 2, tank.h + 2);
    }
  }

  DrawBullet(ctx, b) {
    if (b.trail.length > 1) {
      ctx.strokeStyle = b.meteor
        ? "rgba(255,120,40,0.55)"
        : b.isPlayer
          ? (b.homing ? "rgba(255,120,160,0.45)" : "rgba(255,220,120,0.35)")
          : "rgba(255,120,100,0.3)";
      ctx.lineWidth = b.meteor ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(b.trail[0].x, b.trail[0].y);
      for (let i = 1; i < b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
      ctx.stroke();
    }

    if (b.meteor) {
      ctx.fillStyle = "#ff6020";
      ctx.beginPath();
      ctx.arc(b.x + 5, b.y + 5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd080";
      ctx.fillRect(b.x + 2, b.y + 2, 4, 4);
      return;
    }

    // Pick nearest cardinal for classic 4-dir bullet sprite.
    const ang = Math.atan2(b.vy, b.vx);
    let dir = "right";
    if (ang >= -Math.PI * 0.75 && ang < -Math.PI * 0.25) dir = "up";
    else if (ang >= -Math.PI * 0.25 && ang < Math.PI * 0.25) dir = "right";
    else if (ang >= Math.PI * 0.25 && ang < Math.PI * 0.75) dir = "down";
    else dir = "left";
    const [sx, sy, sw, sh] = BULLET_SHEET[dir];
    const dw = sw * 2;
    const dh = sh * 2;
    this.BlitRect(ctx, sx, sy, sw, sh, b.x + 4 - dw / 2, b.y + 4 - dh / 2, dw, dh);
  }

  DrawAimGhost(ctx) {
    const p = this.player;
    if (!p) return;
    const d = DIR[p.dir];
    let vx = d.x * BULLET_SPEED * (p.power >= 2 ? 1.12 : 1);
    let vy = d.y * BULLET_SPEED * (p.power >= 2 ? 1.12 : 1);
    if (p.dir === "left" || p.dir === "right") vy -= 90;
    else if (p.dir === "up") vy -= 40;
    const gMul = this.antigravTimer > 0 ? -0.35 : 1;

    let x = p.x + p.w / 2 + d.x * 14;
    let y = p.y + p.h / 2 + d.y * 14;
    ctx.strokeStyle = this.antigravTimer > 0 ? "rgba(120,220,255,0.45)" : "rgba(232, 160, 90, 0.35)";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const step = 1 / 30;
    for (let i = 0; i < 55; i++) {
      vy += GRAVITY * gMul * step;
      x += vx * step;
      y += vy * step;
      ctx.lineTo(x, y);
      if (x < 0 || y < 0 || x > CANVAS_W || y > CANVAS_H) break;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const t = this.map[ty]?.[tx];
      if (t === TILE_STEEL || t === TILE_BASE) break;
      if (t === TILE_BRICK && this.BrickSolidAt(x, y)) break;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  DrawPowerup(ctx, pu) {
    if (pu.ttl < 3 && Math.floor(pu.blink * 6) % 2 === 0) return;
    const pulse = 1 + 0.06 * Math.sin(this.frame * 0.28);
    const s = Math.round(26 * pulse);
    const cx = pu.x + TILE / 2;
    const cy = pu.y + TILE / 2;
    const token = this.images.powerToken;
    if (token) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(token, cx - s / 2, cy - s / 2, s, s);
      return;
    }
    // Fallback classic-framed "?"
    ctx.fillStyle = "#000";
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - s / 2 + 1, cy - s / 2 + 1, s - 2, s - 2);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  DrawRoulette(ctx) {
    const r = this.roulette;
    if (!r) return;
    const segs = this.RouletteSegments();
    const n = Math.max(1, segs.length);
    const slice = (Math.PI * 2) / n;
    const needleIdx = this.RouletteIndexAtNeedle();
    const under = segs[needleIdx] || segs[0];
    const focus = r.phase === "result" && r.result ? r.result : under;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Legend strip: green good / gold ultra / red bad
    ctx.fillStyle = TIER_PALETTE.good.bg;
    ctx.fillRect(16, 4, 90, 14);
    ctx.fillStyle = TIER_PALETTE.good.color;
    ctx.font = "bold 9px monospace";
    ctx.fillText("好", 22, 14);
    ctx.fillStyle = TIER_PALETTE.ultra.bg;
    ctx.fillRect(110, 4, 90, 14);
    ctx.fillStyle = TIER_PALETTE.ultra.color;
    ctx.fillText("超", 116, 14);
    ctx.fillStyle = TIER_PALETTE.bad.bg;
    ctx.fillRect(204, 4, 90, 14);
    ctx.fillStyle = TIER_PALETTE.bad.color;
    ctx.fillText("负", 210, 14);
    ctx.fillStyle = "#808080";
    ctx.fillText(`×${n}`, 310, 14);

    const bannerY = 22;
    const bannerH = 48;
    ctx.fillStyle = focus.bg;
    ctx.fillRect(16, bannerY, CANVAS_W - 32, bannerH);
    ctx.strokeStyle = focus.rim || focus.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, bannerY, CANVAS_W - 32, bannerH);

    this.DrawPowerIcon(ctx, focus.kind, 48, bannerY + bannerH / 2, 26);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#a0a0a0";
    ctx.font = "bold 9px monospace";
    ctx.fillText(r.phase === "spin" ? "NEEDLE" : "HIT", 72, bannerY + 14);
    ctx.fillStyle = focus.color;
    ctx.font = "bold 18px monospace";
    const tierTag = focus.tier === "ultra" ? "超 " : focus.tier === "bad" ? "负 " : "好 ";
    ctx.fillText(`${tierTag}${focus.label}`, 72, bannerY + 34);
    ctx.textBaseline = "alphabetic";

    const wheelImg = this.images.rouletteWheel;
    ctx.save();
    ctx.translate(r.cx, r.cy);
    ctx.rotate(r.angle);
    if (wheelImg) {
      const diam = r.radius * 2 + 8;
      ctx.globalAlpha = 0.22;
      ctx.drawImage(wheelImg, -diam / 2, -diam / 2, diam, diam);
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < n; i++) {
      const seg = segs[i];
      const a0 = i * slice;
      const a1 = a0 + slice;
      const isFocus = i === needleIdx;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r.radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = isFocus ? seg.bg : (seg.tier === "bad" ? "#200808" : seg.tier === "ultra" ? "#201808" : "#081808");
      ctx.globalAlpha = isFocus ? 0.98 : 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isFocus ? (seg.rim || seg.color) : (seg.rim || "#404040");
      ctx.lineWidth = isFocus ? 3.5 : 1.5;
      ctx.stroke();

      ctx.save();
      ctx.rotate(a0 + slice / 2);
      const iconR = r.radius * 0.58;
      const drew = this.DrawPowerIcon(ctx, seg.kind, 0, -iconR, isFocus ? 20 : 15);
      ctx.fillStyle = isFocus ? "#ffffff" : seg.color;
      ctx.font = isFocus ? "bold 11px monospace" : "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(seg.label, 0, -iconR + (drew ? 16 : 4));
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = focus.bg;
    ctx.fill();
    ctx.strokeStyle = focus.rim || focus.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    this.DrawPowerIcon(ctx, focus.kind, 0, 0, 18);
    ctx.restore();

    const ny = r.cy - r.radius;
    const needle = this.images.rouletteNeedle;
    if (needle) {
      ctx.drawImage(needle, r.cx - 16, ny - 40, 32, 48);
    } else {
      ctx.fillStyle = "#f0d060";
      ctx.beginPath();
      ctx.moveTo(r.cx, ny);
      ctx.lineTo(r.cx - 12, ny - 24);
      ctx.lineTo(r.cx + 12, ny - 24);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = "#b0b0b0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r.cx, r.cy, r.radius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(r.cx, r.cy);
    const aFocus0 = needleIdx * slice + r.angle;
    ctx.strokeStyle = focus.rim || focus.color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r.radius + 6, aFocus0, aFocus0 + slice);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#a8a8a8";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    if (r.phase === "spin") {
      const moving = Math.abs(r.omega) > 0.2 || r.dragging;
      ctx.fillText(moving ? "SPIN..." : "DRAG / SPACE", r.cx, CANVAS_H - 22);
    } else {
      ctx.fillStyle = focus.color;
      ctx.font = "bold 12px monospace";
      ctx.fillText("GET!", r.cx, CANVAS_H - 22);
    }
    ctx.textAlign = "left";

    if (this.buffToast) {
      const alpha = Clamp(this.buffToast.ttl / 0.4, 0, 1);
      ctx.globalAlpha = alpha;
      const msg = this.buffToast.text;
      ctx.font = "bold 12px monospace";
      const tw = Math.min(CANVAS_W - 24, ctx.measureText(msg).width + 24);
      ctx.fillStyle = "#000";
      ctx.fillRect((CANVAS_W - tw) / 2, CANVAS_H - 52, tw, 26);
      ctx.strokeStyle = focus.color;
      ctx.lineWidth = 2;
      ctx.strokeRect((CANVAS_W - tw) / 2, CANVAS_H - 52, tw, 26);
      ctx.fillStyle = "#f0d060";
      ctx.textAlign = "center";
      ctx.fillText(msg, CANVAS_W / 2, CANVAS_H - 34);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  }

  DrawBuffHud(ctx) {
    const chips = [];
    if (this.antigravTimer > 0) chips.push({ t: `反G ${Math.ceil(this.antigravTimer)}`, c: "#b8f0ff" });
    if (this.bounceTimer > 0) chips.push({ t: `弹 ${Math.ceil(this.bounceTimer)}`, c: "#70ff98" });
    if (this.ghostTimer > 0) chips.push({ t: `幽 ${Math.ceil(this.ghostTimer)}`, c: "#70ff98" });
    if (this.mirrorTimer > 0) chips.push({ t: `镜 ${Math.ceil(this.mirrorTimer)}`, c: "#70ff98" });
    if (this.magnetTimer > 0) chips.push({ t: `磁 ${Math.ceil(this.magnetTimer)}`, c: "#70ff98" });
    if (this.forkTimer > 0) chips.push({ t: `叉 ${Math.ceil(this.forkTimer)}`, c: "#70ff98" });
    if (this.rapidTimer > 0) chips.push({ t: `速 ${Math.ceil(this.rapidTimer)}`, c: "#70ff98" });
    if (this.pierceTimer > 0) chips.push({ t: `穿 ${Math.ceil(this.pierceTimer)}`, c: "#70ff98" });
    if (this.spreadTimer > 0) chips.push({ t: `散 ${Math.ceil(this.spreadTimer)}`, c: "#70ff98" });
    if (this.sniperTimer > 0) chips.push({ t: `狙 ${Math.ceil(this.sniperTimer)}`, c: "#70ff98" });
    if (this.overdriveTimer > 0) chips.push({ t: `超武 ${Math.ceil(this.overdriveTimer)}`, c: "#ffe060" });
    if (this.heavyCurseTimer > 0) chips.push({ t: `超重 ${Math.ceil(this.heavyCurseTimer)}`, c: "#ff6060" });
    if (this.enemyRageTimer > 0) chips.push({ t: `狂暴 ${Math.ceil(this.enemyRageTimer)}`, c: "#ff6060" });
    if (this.playerStunTimer > 0) chips.push({ t: `眩晕 ${Math.ceil(this.playerStunTimer)}`, c: "#ff6060" });
    if (this.freezeTimer > 0) chips.push({ t: `冻 ${Math.ceil(this.freezeTimer)}`, c: "#70ff98" });

    let x = 6;
    ctx.font = "bold 10px monospace";
    for (const chip of chips) {
      const w = ctx.measureText(chip.t).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x, 4, w, 14);
      ctx.fillStyle = chip.c;
      ctx.fillText(chip.t, x + 5, 14);
      x += w + 4;
    }

    if (this.buffToast && this.state !== "roulette") {
      const alpha = Clamp(this.buffToast.ttl / 0.4, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      const msg = this.buffToast.text;
      ctx.font = "bold 13px monospace";
      const tw = ctx.measureText(msg).width + 20;
      ctx.fillRect((CANVAS_W - tw) / 2, 22, tw, 22);
      ctx.fillStyle = "#ffe08a";
      ctx.textAlign = "center";
      ctx.fillText(msg, CANVAS_W / 2, 38);
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  }

  DrawExplosion(ctx, ex) {
    const frames = FX_SHEET.explosion;
    const idx = Math.min(frames.length - 1, Math.floor((ex.t / ex.dur) * frames.length));
    const [gx, gy] = frames[idx];
    const size = 28 * ex.scale + 20 * (ex.t / ex.dur);
    this.BlitGrid(ctx, gx, gy, ex.x - size / 2, ex.y - size / 2, size, size);
  }
}

const game = new Game();
game.Init().catch((err) => {
  console.error(err);
  document.getElementById("startOverlay").querySelector("p").textContent =
    "资源加载失败，请检查 assets 目录。";
});
