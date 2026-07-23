/**
 * GravityTank — classic Battle City stages 1–5 with gravity bullets.
 * Visuals: classic NES Battle City–style sprites (StefanBS/battle-city-clone, MIT).
 */

import { STAGE_COUNT, GetStage, IsTutorialStage, IsBarricadeTeachStage, TUTORIAL_STAGE, BARRICADE_TEACH_STAGE } from "./Data_Stages.mjs";
import { STAGE_UPGRADES, BOSS_UPGRADES, TUTORIAL_UPGRADES, PickUpgradeCards, FindUpgrade } from "./Data_Upgrades.mjs";

const DIFFICULTY = {
  easy: "easy",
  normal: "normal",
};

const PIXEL_FONT = '"Fusion Pixel 12", monospace';
const TILE = 16;
const MAP_W = 26;
const MAP_H = 26;
const CANVAS_W = MAP_W * TILE; // 416
const CANVAS_H = MAP_H * TILE;
const TANK_SIZE = 32;
const SHEET_CELL = 8;
const SPRITE = 16; // classic tank / metatile source size in the sheet
const MAX_ENEMIES_ON_FIELD = 4;
const MAX_ENEMIES_LATE = 5;
/** From this stage onward, enemy shells never damage other enemies. */
const ENEMY_FRIENDLY_FIRE_OFF_STAGE = 6;
const MAX_ABSORB_HITS = 8;
const PLAYER_LIVES = 3;
const CARRY_WOOD_HP = 2;
const CARRY_METAL_HP = 5;
const GRAVITY = 504; // px/s^2 — was 420, +20% heavier
const BULLET_SPEED = 280;
/** Classic ~1/5 tanks flash (~0.20); +50% → 0.30. Only flashing tanks drop. */
const POWER_DROP_RATE = 0.3;
const PLAYER_SPEED = 88;
const GIANT_SCALE = 2;
const GIANT_DURATION = 14;
const GIANT_HITS = 12;
const GIANT_SPEED_MUL = 0.7;
const SPAWN_PROTECT = 3.0;

const DIR = {
  up: { x: 0, y: -1, angle: -Math.PI / 2 },
  down: { x: 0, y: 1, angle: Math.PI / 2 },
  left: { x: -1, y: 0, angle: Math.PI },
  right: { x: 1, y: 0, angle: 0 },
  upRight: { x: Math.SQRT1_2, y: -Math.SQRT1_2, angle: -Math.PI / 4 },
  downRight: { x: Math.SQRT1_2, y: Math.SQRT1_2, angle: Math.PI / 4 },
  downLeft: { x: -Math.SQRT1_2, y: Math.SQRT1_2, angle: (Math.PI * 3) / 4 },
  upLeft: { x: -Math.SQRT1_2, y: -Math.SQRT1_2, angle: (-Math.PI * 3) / 4 },
};
const DIR_KEYS = ["up", "down", "left", "right"];
const DIR_CARDINAL = ["up", "right", "down", "left"];
const DIR_OCTO = ["up", "upRight", "right", "downRight", "down", "downLeft", "left", "upLeft"];

/** Classic Battle City armor-tank palette by remaining HP (Columbia NES clone notes). */
const ARMOR_HP_PALETTE = {
  // mid gray / dark teal / white on the gray enemy sheet → remapped
  4: { mid: [0, 168, 72], dark: [0, 90, 40], light: [200, 255, 220], flash: [230, 230, 230] }, // green↔white
  3: { mid: [230, 180, 40], dark: [120, 90, 10], light: [255, 240, 170], flash: [240, 240, 240] }, // yellow↔white
  2: { mid: [0, 168, 72], dark: [0, 90, 40], light: [200, 255, 220], flash: [230, 180, 40] }, // green↔yellow
  1: { mid: [200, 200, 200], dark: [70, 70, 80], light: [255, 255, 255], flash: [200, 200, 200] }, // white/gray
};

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
  giant: "giant",
  // Curses / negatives
  spawnExtra: "spawnExtra",
  enemyShield: "enemyShield",
  heavyCurse: "heavyCurse",
  enemyRage: "enemyRage",
  softStun: "softStun",
  fortBreak: "fortBreak",
  eagleStroll: "eagleStroll",
  // Hit-charge armor (survives N lethal hits)
  plates: "plates",
  bastion: "bastion",
  // Stage-9 boss throws your gun barrel as a field pickup
  gunBarrel: "gunBarrel",
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
  MakeSeg(POWER.plates, "装甲", "good"),
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
  MakeSeg(POWER.bastion, "壁垒", "ultra"),
  MakeSeg(POWER.giant, "巨大", "ultra"),
  MakeSeg(POWER.spawnExtra, "援军", "bad"),
  MakeSeg(POWER.enemyShield, "敌盾", "bad"),
  MakeSeg(POWER.heavyCurse, "超重", "bad"),
  MakeSeg(POWER.enemyRage, "狂暴", "bad"),
  MakeSeg(POWER.softStun, "眩晕", "bad"),
  MakeSeg(POWER.fortBreak, "破堡", "bad"),
  MakeSeg(POWER.eagleStroll, "遛鹰", "bad"),
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

/** Pick 10 unique prizes: mix good / ultra / bad so the wheel stays readable.
 *  opts.allowGiant — late-game only (after stage 6). */
function PickRouletteSegments(count = ROULETTE_SIZE, difficulty = DIFFICULTY.normal, opts = {}) {
  const goods = ShuffleInPlace(ROULETTE_POOL.filter((s) => s.tier === "good").slice());
  let ultras = ROULETTE_POOL.filter((s) => s.tier === "ultra");
  if (!opts.allowGiant) ultras = ultras.filter((s) => s.kind !== POWER.giant);
  ultras = ShuffleInPlace(ultras.slice());
  const bads = ShuffleInPlace(ROULETTE_POOL.filter((s) => s.tier === "bad").slice());
  // Easy: fewer negative wedges (0–1). Normal: 2–3.
  const badN = difficulty === DIFFICULTY.easy
    ? Math.min(bads.length, Math.floor(Math.random() * 2))
    : Math.min(bads.length, 2 + Math.floor(Math.random() * 2));
  const ultraN = Math.min(ultras.length, 1 + Math.floor(Math.random() * 2)); // 1–2
  const goodN = Math.max(0, count - badN - ultraN);
  const picked = [
    ...goods.slice(0, goodN),
    ...ultras.slice(0, ultraN),
    ...bads.slice(0, badN),
  ];
  // Late-game: sometimes guarantee 巨大 on the wheel so it shows up.
  if (opts.allowGiant && ultraN > 0 && Math.random() < 0.4) {
    const giantSeg = ROULETTE_POOL.find((s) => s.kind === POWER.giant);
    if (giantSeg && !picked.includes(giantSeg)) {
      const swapIdx = picked.findIndex((s) => s.tier === "ultra" && s.kind !== POWER.giant);
      if (swapIdx >= 0) picked[swapIdx] = giantSeg;
      else if (picked.length < count) picked.push(giantSeg);
    }
  }
  // Fill if pool short — prefer non-bad on easy
  while (picked.length < count) {
    const rest = ROULETTE_POOL.filter((s) => !picked.includes(s) && (opts.allowGiant || s.kind !== POWER.giant));
    if (!rest.length) break;
    const prefer = difficulty === DIFFICULTY.easy
      ? rest.filter((s) => s.tier !== "bad")
      : rest;
    const pool = prefer.length ? prefer : rest;
    picked.push(pool[Math.floor(Math.random() * pool.length)]);
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
  {
    id: "boss",
    hp: 120,
    speed: 19, // -50% vs original 38
    score: 5000,
    shootCd: 2.4,
    texture: "enemyArmor",
    weight: 0,
    bulletBoost: 0.7,
    size: 56,
    boss: true,
    fireIntervalMul: 0.5, // 射击间隔 -50%
  },
  {
    id: "tankKing",
    hp: 40,
    speed: 36,
    score: 8000,
    shootCd: 1.5,
    texture: "enemyArmor",
    weight: 0,
    bulletBoost: 1,
    size: 64,
    boss: true,
    tankKing: true,
    fireIntervalMul: 1,
  },
  {
    id: "tankMan",
    hp: 110,
    speed: 42,
    score: 12000,
    shootCd: 1.2,
    texture: "enemyArmor",
    weight: 0,
    bulletBoost: 1,
    size: 72,
    boss: true,
    tankMan: true,
    fireIntervalMul: 0.85,
    barrelCount: 1,
  },
];

const BOSS_ATTACKS = ["barrage", "fan", "mortar", "sweep", "rain", "burst"];
const TANK_KING_ATTACKS = ["quadCross", "spinFire", "axisBurst", "chaseVolley", "ringShot"];
const BOSS_OCTO_ATTACKS = ["octoCross", "octoSpin", "octoRing"];
/** Stage-9 bipedal tank man: disarm / bombs / sniper + flashy mix. */
const TANK_MAN_ATTACKS = ["disarmThrow", "layBomb", "sniperVolley", "bounceFan", "mortarLob", "chaseBurst", "stompRain"];
const BOSS_SHELL_SPEED = 0.7; // of BULLET_SPEED
/** Fire-rate multipliers vs the original boss cadence (lower = slower). */
const BOSS_FIRE_RATE_NORMAL = 0.7;
const BOSS_FIRE_RATE_EASY = 0.5;
const BOSS_FINAL_HP_RATIO = 0.35;
/** Eagle curse: stage-3 Tank King shorter; stage-6 Gravity Cannon longer. */
const EAGLE_CURSE_DURATION_STAGE3 = 6.2;
const EAGLE_CURSE_DURATION_STAGE6 = 10.5;
const EAGLE_CURSE_SHIELD_STAGE3 = 2.8;
const EAGLE_CURSE_SHIELD_STAGE6 = 4.0;
/** Transform telegraph before eagle form — gives players time to read the prompt. */
const EAGLE_MORPH_DUR = 2.15;

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
  plates: [32, 14], // reuse helmet plate art
  bastion: [32, 14],
  gunBarrel: [40, 14],
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

/** Axis-aligned rect for one 8×8 brick quarter inside a 16×16 cell. */
function BrickQuarterRect(tx, ty, bit) {
  const px = tx * TILE;
  const py = ty * TILE;
  const right = (bit === BRICK_TR || bit === BRICK_BR);
  const bottom = (bit === BRICK_BL || bit === BRICK_BR);
  return {
    x: px + (right ? TILE / 2 : 0),
    y: py + (bottom ? TILE / 2 : 0),
    w: TILE / 2,
    h: TILE / 2,
  };
}

const BRICK_QUARTER_BITS = [BRICK_TL, BRICK_TR, BRICK_BL, BRICK_BR];

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
    this.sfxVolume = 0.25;
    this.bgmVolume = 0.4;
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
      upgrade: document.getElementById("upgradeOverlay"),
      upgradeTitle: document.getElementById("upgradeTitle"),
      upgradeBlurb: document.getElementById("upgradeBlurb"),
      upgradeCards: document.getElementById("upgradeCards"),
    };
    this.touchUi = {
      stickWrap: document.getElementById("touchStickWrap"),
      actionsWrap: document.getElementById("touchActionsWrap"),
      stick: document.getElementById("touchStick"),
      knob: document.getElementById("stickKnob"),
      fire: document.getElementById("touchFire"),
      carry: document.getElementById("touchCarry"),
      pause: document.getElementById("touchPause"),
      hudPause: document.getElementById("mobilePauseButton"),
    };

    this.audio = new AudioBus();
    this.images = {};
    this.keys = new Set();
    this.touchDir = null;
    this.touchFire = false;
    this.touchCarry = false;
    this.touchCarryPressed = false;
    this.interactArmed = true;
    this.stickPointerId = null;
    this.stickTouchId = null;
    this.firePointerId = null;
    this.fireTouchId = null;
    this.carryPointerId = null;
    this.carryTouchId = null;
    this.stickVec = { x: 0, y: 0 };
    this.isTouchDevice = false;
    this.respawnTimer = 0;

    this.state = "boot";
    this.difficulty = DIFFICULTY.normal;
    this.debugGodMode = false;
    this.debugPanelOpen = false;
    this.stagePerk = null; // active this stage only
    this.pendingStagePerk = null; // chosen after clear, applied on next StartGame
    this.runPerks = []; // permanent after boss until campaign ends
    this.absorbHits = 0; // run-wide armor charges (lethal-hit absorbs)
    this.meteorPulseTimer = 0;
    this.timeRiftCd = 0;
    this.upgradePick = null; // { special, cards, resumeAction }
    this.stage = 1;
    this.stageData = GetStage(1);
    this.isTutorial = false;
    this.isBarricadeTeach = false;
    this.isBossStage = false;
    this.totalEnemies = 20;
    this.endAction = "restart"; // restart | next | retry
    this.map = [];
    this.brickMask = [];
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.explosions = [];
    this.powerups = [];
    this.bombs = [];
    this.carryables = [];
    this.carriedBlock = null;
    this.prepTimer = 0;
    this.playerDisarmed = false;
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
    this.giantTimer = 0;
    this.giantHits = 0;
    this.playerEagleTimer = 0;
    this.eagleWarnT = 0;
    this.eagleMorph = null;
    this.eagleStroll = null;
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
    // Ensure pixel CJK is ready before first canvas text (stage intro / HUD).
    if (document.fonts?.load) {
      await Promise.all([
        document.fonts.load(`12px ${PIXEL_FONT}`),
        document.fonts.load(`24px ${PIXEL_FONT}`),
      ]).catch(() => {});
    }
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
      barricadeWood: await load("assets/Texture_BarricadeWood.png"),
      barricadeMetal: await load("assets/Texture_BarricadeMetal.png"),
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
    // Roulette badges without dedicated art — draw classic eagle for 遛鹰.
    if (kind === POWER.eagleStroll) {
      const [gx, gy] = TILE_SHEET.baseAlive;
      this.BlitGrid(ctx, gx, gy, cx - size / 2, cy - size / 2, size, size, 2, 2);
      return true;
    }
    if (kind === POWER.giant) {
      ctx.fillStyle = "#3a2808";
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.strokeStyle = "#ffe060";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - size / 2 + 0.5, cy - size / 2 + 0.5, size - 1, size - 1);
      ctx.fillStyle = "#ffe060";
      ctx.font = `${Math.max(9, size * 0.5)}px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("巨", cx, cy + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      return true;
    }
    if (kind === POWER.softStun || kind === POWER.fortBreak) {
      ctx.fillStyle = "#380808";
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.strokeStyle = "#ff6060";
      ctx.strokeRect(cx - size / 2 + 0.5, cy - size / 2 + 0.5, size - 1, size - 1);
      ctx.fillStyle = "#ff8080";
      ctx.font = `${Math.max(8, size * 0.45)}px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(kind === POWER.softStun ? "眩" : "堡", cx, cy + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
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
    this.BindDifficultyPick();
    this.BindDebugPanel();

    this.canvas.addEventListener("pointerdown", (ev) => this.OnCanvasPointerDown(ev));
    this.canvas.addEventListener("pointermove", (ev) => this.OnCanvasPointerMove(ev));
    this.canvas.addEventListener("pointerup", (ev) => this.OnCanvasPointerUp(ev));
    this.canvas.addEventListener("pointercancel", (ev) => this.OnCanvasPointerUp(ev));

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "j", "k"].includes(k) || e.code === "Space") {
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
    this.stickTouchId = null;
    this.firePointerId = null;
    this.fireTouchId = null;
    this.carryPointerId = null;
    this.carryTouchId = null;
    this.touchFire = false;
    this.touchCarry = false;
    this.touchCarryPressed = false;
    this.interactArmed = true;
    this.touchDir = null;
    this.stickVec.x = 0;
    this.stickVec.y = 0;
    if (this.touchUi.knob) this.touchUi.knob.style.transform = "translate(0, 0)";
    this.touchUi.fire?.classList.remove("is-active");
    this.touchUi.carry?.classList.remove("is-active");
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
    const controlsBudget = controlsOn ? 196 : 16;
    const gapBudget = 24;
    const size = Math.floor(Math.max(180, Math.min(viewW - padX, viewH - hudH - controlsBudget - gapBudget)));
    shell.style.width = `${size}px`;
    shell.style.maxWidth = `${size}px`;
  }

  SyncTouchControlsVisibility() {
    const show = this.isTouchDevice && (this.state === "playing" || this.state === "paused" || this.state === "roulette");
    if (this.touchUi.stickWrap) this.touchUi.stickWrap.hidden = !show;
    if (this.touchUi.actionsWrap) this.touchUi.actionsWrap.hidden = !show;
    const hasCarry =
      !!(this.stageData?.carryBlocks?.length) ||
      !!this.carriedBlock ||
      this.carryables.some((c) => c.alive);
    if (this.touchUi.carry) this.touchUi.carry.hidden = !(show && hasCarry);
    // Immersive mobile chrome: hide long marketing/side panels so portrait fits one screen.
    const immersive = this.isTouchDevice && ["playing", "paused", "roulette", "stageIntro", "won", "lost", "upgrade"].includes(this.state);
    document.body.classList.toggle("is-touch-play", immersive);
    document.body.classList.toggle("is-portrait", window.matchMedia("(orientation: portrait)").matches);
    document.body.classList.toggle("has-carry-control", show && hasCarry);
    // Lock page gestures while the virtual stick is live — critical on iOS Safari.
    document.documentElement.classList.toggle("touch-play-lock", show);
    document.body.classList.toggle("touch-play-lock", show);
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
    const { stick, stickWrap, knob, fire, carry, pause, hudPause, actionsWrap } = this.touchUi;
    if (!stick || !fire) return;

    const stickRadius = () => {
      const base = stick.querySelector(".stick-base");
      return (base?.clientWidth || 140) * 0.5;
    };

    const setKnob = (nx, ny) => {
      if (!knob) return;
      const max = stickRadius() * 0.55;
      knob.style.transform = `translate(${nx * max}px, ${ny * max}px)`;
    };

    const clearStick = () => {
      this.stickPointerId = null;
      this.stickTouchId = null;
      this.stickVec.x = 0;
      this.stickVec.y = 0;
      this.touchDir = null;
      setKnob(0, 0);
    };

    const clearFire = () => {
      this.firePointerId = null;
      this.fireTouchId = null;
      this.touchFire = false;
      fire.classList.remove("is-active");
    };

    const clearCarry = () => {
      this.carryPointerId = null;
      this.carryTouchId = null;
      this.touchCarry = false;
      carry?.classList.remove("is-active");
    };

    const updateStickFromClient = (clientX, clientY) => {
      const base = stick.querySelector(".stick-base") || stick;
      const rect = base.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const max = Math.max(rect.width, rect.height) * 0.5;
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

      // Slightly softer deadzone — Safari touch jitter is noisier than mouse.
      const dead = 0.22;
      if (Math.hypot(nx, ny) < dead) {
        this.touchDir = null;
        return;
      }
      this.touchDir = Math.abs(nx) > Math.abs(ny)
        ? (nx < 0 ? "left" : "right")
        : (ny < 0 ? "up" : "down");
    };

    const beginStick = (clientX, clientY, trackId) => {
      if (this.stickTouchId != null && this.stickTouchId !== trackId) return false;
      this.stickTouchId = trackId;
      this.stickPointerId = trackId;
      this.audio.Ensure();
      updateStickFromClient(clientX, clientY);
      return true;
    };

    const moveStick = (clientX, clientY, trackId) => {
      if (this.stickTouchId !== trackId && this.stickPointerId !== trackId) return;
      updateStickFromClient(clientX, clientY);
    };

    const endStickIf = (trackId) => {
      if (this.stickTouchId !== trackId && this.stickPointerId !== trackId) return;
      clearStick();
    };

    const beginFire = (trackId) => {
      if (this.state === "stageIntro") {
        this.SkipStageIntro();
        return false;
      }
      if (this.state === "roulette") {
        this.RouletteKick(16 + Math.random() * 12);
        return false;
      }
      if (this.fireTouchId != null && this.fireTouchId !== trackId) return false;
      this.fireTouchId = trackId;
      this.firePointerId = trackId;
      this.touchFire = true;
      fire.classList.add("is-active");
      this.audio.Ensure();
      return true;
    };

    const endFireIf = (trackId) => {
      if (this.fireTouchId !== trackId && this.firePointerId !== trackId) return;
      clearFire();
    };

    const beginCarry = (trackId) => {
      if (this.state === "stageIntro") {
        this.SkipStageIntro();
        return false;
      }
      if (!carry || carry.hidden) return false;
      if (this.carryTouchId != null && this.carryTouchId !== trackId) return false;
      this.carryTouchId = trackId;
      this.carryPointerId = trackId;
      this.touchCarry = true;
      this.touchCarryPressed = true;
      carry.classList.add("is-active");
      this.audio.Ensure();
      return true;
    };

    const endCarryIf = (trackId) => {
      if (this.carryTouchId !== trackId && this.carryPointerId !== trackId) return;
      clearCarry();
    };

    // —— Touch path (Safari-reliable): track on document so moves outside the pad still work ——
    const onTouchStart = (ev) => {
      const target = ev.target;
      const onStick = stick.contains(target) || stickWrap?.contains(target);
      const onFire = fire === target || fire.contains(target);
      const onCarry = !!(carry && (carry === target || carry.contains(target)));
      if (!onStick && !onFire && !onCarry) return;

      // Claim new touches; support multitouch (stick + fire together).
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const t = ev.changedTouches[i];
        if (onStick && this.stickTouchId == null) {
          if (beginStick(t.clientX, t.clientY, t.identifier)) ev.preventDefault();
        } else if (onFire && this.fireTouchId == null) {
          if (beginFire(t.identifier)) ev.preventDefault();
        } else if (onCarry && this.carryTouchId == null) {
          if (beginCarry(t.identifier)) ev.preventDefault();
        }
      }
    };

    const onTouchMove = (ev) => {
      let used = false;
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const t = ev.changedTouches[i];
        if (t.identifier === this.stickTouchId) {
          moveStick(t.clientX, t.clientY, t.identifier);
          used = true;
        }
      }
      // Also check active touches list — some Safari builds only update touches, not changedTouches consistently.
      if (this.stickTouchId != null) {
        for (let i = 0; i < ev.touches.length; i++) {
          const t = ev.touches[i];
          if (t.identifier === this.stickTouchId) {
            moveStick(t.clientX, t.clientY, t.identifier);
            used = true;
          }
        }
      }
      if (used) ev.preventDefault();
    };

    const onTouchEnd = (ev) => {
      for (let i = 0; i < ev.changedTouches.length; i++) {
        const t = ev.changedTouches[i];
        endStickIf(t.identifier);
        endFireIf(t.identifier);
        endCarryIf(t.identifier);
      }
    };

    const touchOpts = { passive: false, capture: true };
    // Bind on wraps (larger hit area). Avoid double-binding child + parent.
    stickWrap?.addEventListener("touchstart", onTouchStart, touchOpts);
    actionsWrap?.addEventListener("touchstart", onTouchStart, touchOpts);
    // Document-level move/end so finger can leave the pad (Safari pointer-capture is flaky).
    document.addEventListener("touchmove", onTouchMove, touchOpts);
    document.addEventListener("touchend", onTouchEnd, touchOpts);
    document.addEventListener("touchcancel", onTouchEnd, touchOpts);

    // —— Pointer path (desktop / browsers where Pointer Events work) ——
    // Skip pointer handlers when the event is a touch — touch path already owns it.
    const isTouchPointer = (ev) => ev.pointerType === "touch";

    stick.addEventListener("pointerdown", (ev) => {
      if (isTouchPointer(ev)) return; // handled by touch listeners
      if (!beginStick(ev.clientX, ev.clientY, ev.pointerId)) return;
      ev.preventDefault();
      try { stick.setPointerCapture?.(ev.pointerId); } catch (_) { /* Safari may throw */ }
    });
    stick.addEventListener("pointermove", (ev) => {
      if (isTouchPointer(ev)) return;
      if (ev.pointerId !== this.stickPointerId) return;
      ev.preventDefault();
      moveStick(ev.clientX, ev.clientY, ev.pointerId);
    });
    const endStickPointer = (ev) => {
      if (isTouchPointer(ev)) return;
      endStickIf(ev.pointerId);
    };
    stick.addEventListener("pointerup", endStickPointer);
    stick.addEventListener("pointercancel", endStickPointer);
    // Do NOT clear on lostpointercapture alone — iOS Safari can fire this spuriously
    // while the finger is still down, which used to kill the stick instantly.

    fire.addEventListener("pointerdown", (ev) => {
      if (isTouchPointer(ev)) return;
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
      if (!beginFire(ev.pointerId)) return;
      ev.preventDefault();
      try { fire.setPointerCapture?.(ev.pointerId); } catch (_) { /* ignore */ }
    });
    const endFirePointer = (ev) => {
      if (isTouchPointer(ev)) return;
      endFireIf(ev.pointerId);
    };
    fire.addEventListener("pointerup", endFirePointer);
    fire.addEventListener("pointercancel", endFirePointer);

    carry?.addEventListener("pointerdown", (ev) => {
      if (isTouchPointer(ev)) return;
      if (!beginCarry(ev.pointerId)) return;
      ev.preventDefault();
      try { carry.setPointerCapture?.(ev.pointerId); } catch (_) { /* ignore */ }
    });
    const endCarryPointer = (ev) => {
      if (isTouchPointer(ev)) return;
      endCarryIf(ev.pointerId);
    };
    carry?.addEventListener("pointerup", endCarryPointer);
    carry?.addEventListener("pointercancel", endCarryPointer);

    const onPauseTap = (ev) => {
      ev.preventDefault();
      this.audio.Ensure();
      this.TogglePause();
    };
    pause?.addEventListener("click", onPauseTap);
    hudPause?.addEventListener("click", onPauseTap);
    document.getElementById("desktopPauseButton")?.addEventListener("click", onPauseTap);
  }

  BindDifficultyPick() {
    const root = document.getElementById("difficultyPick");
    const hint = document.getElementById("difficultyHint");
    if (!root) return;
    const buttons = [...root.querySelectorAll("[data-diff]")];
    const apply = (diff) => {
      this.difficulty = diff === DIFFICULTY.easy ? DIFFICULTY.easy : DIFFICULTY.normal;
      for (const btn of buttons) {
        const on = btn.dataset.diff === this.difficulty;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      }
      if (hint) {
        hint.textContent = this.IsEasy()
          ? "简易：双倍生命 · 负面更少 · ?掉率+50%"
          : "标准：原版生命与掉率";
      }
      this.SyncStageLabels();
    };
    for (const btn of buttons) {
      btn.addEventListener("click", () => apply(btn.dataset.diff));
    }
    apply(this.difficulty);
  }

  BindDebugPanel() {
    const banner = document.getElementById("titleBanner") || document.querySelector(".title-banner");
    const panel = document.getElementById("debugPanel");
    const status = document.getElementById("debugStatus");
    const closeBtn = document.getElementById("debugClose");
    const stagePick = document.getElementById("debugStagePick");
    if (!banner || !panel) return;

    const syncStatus = () => {
      if (status) {
        const stageTag = this.isTutorial
          ? "T"
          : (this.isBarricadeTeach ? "教" : (this.isBossStage ? `${this.stage}B` : String(this.stage)));
        status.textContent = `god ${this.debugGodMode ? "ON" : "OFF"} · stage ${stageTag}`;
      }
      const godBtn = panel.querySelector('[data-debug="god"]');
      godBtn?.classList.toggle("is-on", this.debugGodMode);
      if (stagePick) {
        const cur = this.isTutorial ? "0" : (this.isBarricadeTeach ? "barricadeTeach" : String(this.stage));
        stagePick.querySelectorAll("[data-debug-stage]").forEach((btn) => {
          btn.classList.toggle("is-on", btn.dataset.debugStage === cur);
        });
      }
    };

    if (stagePick && !stagePick.dataset.built) {
      stagePick.dataset.built = "1";
      const stages = [
        { id: 0, label: "T", title: "新手引导" },
        ...Array.from({ length: STAGE_COUNT }, (_, i) => {
          const n = i + 1;
          const stage = GetStage(n);
          return {
            id: n,
            label: stage.bossStage ? `${n}B` : String(n),
            title: stage.bossStage ? `第 ${n} 关 Boss` : `第 ${n} 关`,
          };
        }),
      ];
      // Insert barricade teach after stage 6 (before campaign 7).
      stages.splice(7, 0, { id: "barricadeTeach", label: "教", title: "路障教学" });
      for (const s of stages) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.debugStage = String(s.id);
        btn.textContent = s.label;
        btn.title = s.title;
        btn.setAttribute("aria-label", s.title);
        btn.addEventListener("click", () => {
          this.DebugGotoStage(s.id);
          syncStatus();
        });
        stagePick.appendChild(btn);
      }
    }

    const setOpen = (open) => {
      this.debugPanelOpen = open;
      panel.hidden = !open;
      if (open) syncStatus();
    };

    banner.addEventListener("click", (ev) => {
      ev.preventDefault();
      setOpen(panel.hidden);
    });
    closeBtn?.addEventListener("click", () => setOpen(false));

    panel.querySelectorAll("[data-debug]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.RunDebugAction(btn.dataset.debug);
        syncStatus();
      });
    });
    this.SyncDebugStatus = syncStatus;
  }

  DebugGotoStage(stageId) {
    this.audio.Ensure();
    if (this.state === "roulette") this.CloseRoulette();
    if (this.state === "paused") this.SetPaused(false);
    if (this.overlays.upgrade) this.overlays.upgrade.hidden = true;
    this.upgradePick = null;
    this.pendingStagePerk = null;
    this.stagePerk = null;
    const keepPlaying = !["ready", "boot"].includes(this.state);
    let stage;
    if (IsTutorialStage(stageId)) stage = 0;
    else if (IsBarricadeTeachStage(stageId)) stage = "barricadeTeach";
    else stage = Math.max(1, Math.min(STAGE_COUNT, stageId | 0));
    this.StartGame({
      stage,
      keepStats: false,
      keepScore: keepPlaying,
      keepLives: keepPlaying,
    });
    const label = stage === 0
      ? "新手"
      : (stage === "barricadeTeach"
        ? "路障教学"
        : (GetStage(stage).bossStage ? `${stage} Boss` : String(stage)));
    this.ShowBuffToast(`DEBUG 选关 → ${label}`);
    this.SyncDebugStatus?.();
  }

  RunDebugAction(action) {
    this.audio.Ensure();
    switch (action) {
      case "skip":
        if (this.state === "stageIntro") this.FinishStageIntro();
        if (this.state === "roulette") this.CloseRoulette();
        if (this.state === "ready" || this.state === "boot") {
          this.StartCampaign();
          return;
        }
        if (this.isTutorial || this.stage < STAGE_COUNT) {
          this.EndGame(true, "DEBUG 跳关", "next");
        } else {
          this.EndGame(true, "DEBUG 通关", "restart");
        }
        break;
      case "prev": {
        if (this.state === "ready" || this.state === "boot") {
          this.StartGame({ stage: STAGE_COUNT, keepStats: false });
          return;
        }
        if (this.isTutorial) {
          this.StartGame({ stage: STAGE_COUNT, keepStats: false, keepScore: true, keepLives: true });
        } else if (this.stage <= 1) {
          this.StartGame({ stage: 0, keepStats: false, keepScore: true, keepLives: true });
        } else {
          this.StartGame({ stage: this.stage - 1, keepStats: false, keepScore: true, keepLives: true });
        }
        break;
      }
      case "god":
        this.debugGodMode = !this.debugGodMode;
        if (this.debugGodMode && this.player?.alive) {
          this.player.protect = Math.max(this.player.protect, 999);
        }
        this.ShowBuffToast(this.debugGodMode ? "DEBUG 无敌 ON" : "DEBUG 无敌 OFF");
        break;
      case "life":
        this.lives += 1;
        this.UpdateHud();
        this.ShowBuffToast("DEBUG 生命 +1");
        break;
      case "power":
        if (this.player) {
          this.player.power = 3;
          this.player.maxBullets = 3;
          this.overdriveTimer = Math.max(this.overdriveTimer, 12);
        }
        this.UpdateHud();
        this.ShowBuffToast("DEBUG 火力满");
        break;
      case "clear":
        for (const e of this.enemies) {
          if (!e.alive) continue;
          e.alive = false;
          e.deathTimer = 0.01;
          this.score += e.score;
          this.SpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 1);
        }
        this.spawnQueue = [];
        this.RenderEnemyIcons();
        this.UpdateHud();
        this.ShowBuffToast("DEBUG 清场");
        this.CheckEnd();
        break;
      case "roulette":
        if (this.state === "playing" || this.state === "paused") {
          if (this.state === "paused") this.SetPaused(false);
          this.OpenRoulette();
        } else {
          this.ShowBuffToast("DEBUG 需在对局中开转轮");
        }
        break;
      default:
        break;
    }
  }

  IsEasy() {
    return this.difficulty === DIFFICULTY.easy;
  }

  GetStartLives() {
    return this.IsEasy() ? PLAYER_LIVES * 2 : PLAYER_LIVES;
  }

  GetPowerDropRate() {
    // Tutorial: player cannot cross the river to collect tokens.
    if (this.isTutorial) return 0;
    // Easy: ? tokens appear 50% more often.
    return this.IsEasy() ? POWER_DROP_RATE * 1.5 : POWER_DROP_RATE;
  }

  /** Boss attack cadence scale: normal 70% rate, easy 50% rate → longer cooldowns.
   *  Per-enemy fireIntervalMul further shortens/lengthens (stage-3 boss uses 0.5). */
  GetBossFireCdScale(enemy = null) {
    const rate = this.IsEasy() ? BOSS_FIRE_RATE_EASY : BOSS_FIRE_RATE_NORMAL;
    const base = 1 / Math.max(0.05, rate);
    const mul = enemy?.fireIntervalMul ?? 1;
    return base * mul;
  }

  ApplyStageMeta(stageIndex1Based) {
    if (IsTutorialStage(stageIndex1Based)) {
      this.stage = 0;
      this.isTutorial = true;
      this.isBarricadeTeach = false;
      this.stageData = TUTORIAL_STAGE;
    } else if (IsBarricadeTeachStage(stageIndex1Based)) {
      this.stage = "barricadeTeach";
      this.isTutorial = false;
      this.isBarricadeTeach = true;
      this.stageData = BARRICADE_TEACH_STAGE;
    } else {
      this.isTutorial = false;
      this.isBarricadeTeach = false;
      this.stage = Math.max(1, Math.min(STAGE_COUNT, stageIndex1Based | 0));
      this.stageData = GetStage(this.stage);
    }
    this.isBossStage = !!this.stageData.bossStage;
    const e = this.stageData.enemies;
    this.totalEnemies = e.basic + e.fast + e.power + e.armor + (e.boss || 0) + (e.tankKing || 0) + (e.tankMan || 0);
    this.spawnSlots = (this.stageData.enemySpawns || [[0, 0], [12, 0], [24, 0]]).map(([x, y]) => ({
      x: x * TILE,
      y: y * TILE,
    }));
    this.SyncStageLabels();
  }

  SyncStageLabels() {
    const label = this.isTutorial ? "T" : (this.isBarricadeTeach ? "教" : String(this.stage));
    if (this.hud.stage) this.hud.stage.textContent = label;
    if (this.hud.mobileStage) this.hud.mobileStage.textContent = label;
    if (this.overlays.startTitle) {
      this.overlays.startTitle.textContent = this.isTutorial
        ? "新手引导"
        : (this.isBarricadeTeach ? "路障教学" : "GRAVITY TANK");
    }
    if (this.overlays.startBlurb) {
      const diffTag = this.IsEasy() ? "简易：双倍生命 · 负面更少 · ?掉率+50%。" : "标准难度。";
      if (this.isTutorial) {
        this.overlays.startBlurb.textContent =
          `${diffTag} 你在河北岸。河对面过不来——用重力弹幕（朝下/斜射）清理南岸敌军，再选一张入门升级进入战役。`;
      } else if (this.isBarricadeTeach) {
        this.overlays.startBlurb.textContent =
          `${diffTag} 路障教学：靠近木/钢路障，按 K（触屏「扛」）扛起——挡在身前可当护盾；再按同一键放下封路。开场有准备时间，先封住上方出口！`;
      } else if (this.state === "ready" || this.state === "boot") {
        this.overlays.startBlurb.textContent =
          `${diffTag} 开局先进入新手引导，再打 ${STAGE_COUNT} 关战役（第 3 关坦克王 · 第 6 关重力巨炮 · 第 9 关腿甲坦克人）。第 6 关后有路障教学；第 7–8 关可提前装配陷阱。保卫老鹰；炮弹带重力会下坠。`;
      } else if (this.isBossStage) {
        if (this.stageData.bossKind === "tankMan") {
          this.overlays.startBlurb.textContent =
            `${diffTag} BOSS 关 · 腿甲坦克人。会拆你的炮管扔开、扔定时炸弹、发射无重力弹射狙击；用掩体躲弹，捡回炮管才能开火。`;
        } else if (this.stageData.bossKind === "tankKing") {
          this.overlays.startBlurb.textContent =
            `${diffTag} BOSS 关 · ${this.stageData.title || "坦克王"}。单炮追猎；残血终焉会把你变成老鹰（开场有护盾），被打倒直接失败。`;
        } else {
          this.overlays.startBlurb.textContent =
            `${diffTag} BOSS 关 · 重力巨炮。八向炮筒弹幕；残血终焉老鹰诅咒更久（开场有护盾），被打倒直接失败。`;
        }
      } else if (this.stageData.prepSeconds) {
        const e = this.stageData.enemies;
        this.overlays.startBlurb.textContent =
          `${diffTag} 第 ${this.stage}/${STAGE_COUNT} 关 · ${this.stageData.title || ""} · 敌军 ${this.totalEnemies}。开场准备 ${this.stageData.prepSeconds}s：用路障封死敌窝出口，让它们出不来！`;
      } else {
        const e = this.stageData.enemies;
        this.overlays.startBlurb.textContent =
          `${diffTag} 第 ${this.stage}/${STAGE_COUNT} 关 · 敌军 ${this.totalEnemies}（普${e.basic}/快${e.fast}/强${e.power}/甲${e.armor}）。保卫老鹰。炮弹带重力，水平射击会下坠。`;
      }
    }
    this.SyncDebugStatus?.();
  }

  StartCampaign() {
    this.score = 0;
    this.lives = this.GetStartLives();
    this.stagePerk = null;
    this.pendingStagePerk = null;
    this.runPerks = [];
    this.absorbHits = 0;
    this.meteorPulseTimer = 0;
    this.timeRiftCd = 0;
    this.StartGame({ stage: 0, keepStats: false });
  }

  AdvanceStage() {
    if (this.isTutorial) {
      this.StartGame({ stage: 1, keepStats: false, keepScore: true, keepLives: true });
      return;
    }
    if (this.isBarricadeTeach) {
      const keep = this.player
        ? { power: this.player.power, maxBullets: this.player.maxBullets, absorbHits: this.absorbHits }
        : { power: 1, maxBullets: 1, absorbHits: this.absorbHits };
      this.StartGame({ stage: 7, keepStats: keep, keepScore: true, keepLives: true });
      return;
    }
    if (this.stage >= STAGE_COUNT) {
      this.EndGame(true, `${STAGE_COUNT} 关全通！最终得分 ${this.score}`, "restart");
      return;
    }
    const keep = this.player
      ? { power: this.player.power, maxBullets: this.player.maxBullets, absorbHits: this.absorbHits }
      : { power: 1, maxBullets: 1, absorbHits: this.absorbHits };
    // After gravity-cannon boss: interstitial barricade teach before stages 7–8 trap maps.
    if (this.stage === 6) {
      this.StartGame({ stage: "barricadeTeach", keepStats: keep, keepScore: true, keepLives: true });
      return;
    }
    this.StartGame({ stage: this.stage + 1, keepStats: keep, keepScore: true, keepLives: true });
  }

  HandleEndPrimary() {
    if (this.endAction === "next") {
      if (this.ShouldOfferUpgrade()) {
        this.OpenUpgradePick({ special: this.isBossStage });
        return;
      }
      this.AdvanceStage();
    } else if (this.endAction === "retry") {
      const stage = this.isTutorial ? 0 : (this.isBarricadeTeach ? "barricadeTeach" : this.stage);
      this.StartGame({ stage, keepStats: false, keepScore: false, keepLives: false });
    } else {
      this.StartCampaign();
    }
  }

  ShouldOfferUpgrade() {
    if (this.endAction !== "next") return false;
    if (this.isTutorial) return true;
    if (this.isBarricadeTeach) return false;
    // Campaign clear uses restart — no pick. Mid-run next-stage clears offer cards.
    return this.stage < STAGE_COUNT || this.isBossStage;
  }

  OpenUpgradePick({ special = false } = {}) {
    const overlay = this.overlays.upgrade;
    const cardsRoot = this.overlays.upgradeCards;
    if (!overlay || !cardsRoot) {
      this.AdvanceStage();
      return;
    }
    this.state = "upgrade";
    this.overlays.end.hidden = true;
    const tutorial = this.isTutorial && !special;
    const pool = tutorial ? TUTORIAL_UPGRADES : (special ? BOSS_UPGRADES : STAGE_UPGRADES);
    // Avoid offering boss perks already owned.
    const filtered = special
      ? pool.filter((u) => !this.runPerks.includes(u.id))
      : pool.slice();
    const cards = PickUpgradeCards(filtered.length ? filtered : pool, 3);
    this.upgradePick = { special, tutorial, cards };
    if (this.overlays.upgradeTitle) {
      this.overlays.upgradeTitle.textContent = tutorial
        ? "入门升级"
        : (special ? "Boss 特殊能力" : "关卡升级");
    }
    if (this.overlays.upgradeBlurb) {
      this.overlays.upgradeBlurb.textContent = tutorial
        ? "三选一：基础强化，带进第一关（本关有效）。"
        : (special
          ? "三选一：永久能力，带到本局通关结束。"
          : "三选一：本关有效（仅下一关）。");
    }
    cardsRoot.innerHTML = "";
    for (const card of cards) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `upgrade-card${special ? " is-special" : ""}${tutorial ? " is-tutorial" : ""}`;
      const iconSrc = card.icon || `./assets/Icon_Upgrade${card.id[0].toUpperCase()}${card.id.slice(1)}.png`;
      btn.innerHTML =
        `<span class="upgrade-card-body">` +
        `<span class="upgrade-icon-well">` +
        `<img class="upgrade-icon" src="${iconSrc}" width="48" height="48" alt="" draggable="false">` +
        `</span>` +
        `<span class="upgrade-copy">` +
        `<span class="upgrade-tag">${card.tag}</span>` +
        `<span class="upgrade-name">${card.title}</span>` +
        `<span class="upgrade-desc">${card.desc}</span>` +
        `</span>` +
        `</span>`;
      btn.addEventListener("click", () => this.ConfirmUpgradePick(card.id));
      cardsRoot.appendChild(btn);
    }
    overlay.hidden = false;
    this.SyncTouchControlsVisibility();
  }

  ConfirmUpgradePick(id) {
    const pick = this.upgradePick;
    if (!pick) return;
    const card = pick.cards?.find((c) => c.id === id) || FindUpgrade(id);
    if (pick.special) {
      if (!this.runPerks.includes(id)) this.runPerks.push(id);
      this.stagePerk = null; // boss pick does not refresh 本关卡
      this.ShowBuffToast(`永久能力：${card?.title || id}`);
    } else {
      this.pendingStagePerk = id;
      this.ShowBuffToast(`${pick.tutorial ? "入门强化" : "本关强化"}：${card?.title || id}`);
    }
    this.upgradePick = null;
    if (this.overlays.upgrade) this.overlays.upgrade.hidden = true;
    this.AdvanceStage();
  }

  HasPerk(id) {
    return this.stagePerk === id || this.runPerks.includes(id);
  }

  ActivePerkIds() {
    const ids = this.runPerks.slice();
    if (this.stagePerk) ids.push(this.stagePerk);
    return ids;
  }

  StartGame({ stage = 1, keepStats = false, keepScore = false, keepLives = false } = {}) {
    const prevStageKey = this.isTutorial ? 0 : this.stage;
    this.ApplyStageMeta(stage);
    const newStageKey = this.isTutorial ? 0 : this.stage;
    this.map = BuildStageMap(this.isTutorial ? 0 : this.stage);
    this.brickMask = BuildBrickMask(this.map);
    this._baseCell = null;
    this.bullets = [];
    this.explosions = [];
    this.powerups = [];
    this.bombs = [];
    this.carryables = [];
    this.carriedBlock = null;
    this.prepTimer = 0;
    this.enemies = [];
    this.playerDisarmed = false;
    this.SpawnCarryBlocksFromStage();
    if (!keepScore) this.score = 0;
    if (!keepLives) this.lives = this.GetStartLives();
    if (!keepStats) this.absorbHits = 0;
    else if (keepStats.absorbHits != null) this.absorbHits = keepStats.absorbHits;
    // 普通升级：本关有效。过关时选卡 → pending → 进入下一关生效；
    // Boss 永久卡不写 pending，换关时清掉上一关的本关强化。重试同关则保留。
    if (this.pendingStagePerk != null) {
      this.stagePerk = this.pendingStagePerk;
      this.pendingStagePerk = null;
    } else if (newStageKey !== prevStageKey) {
      this.stagePerk = null;
    }
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
    this.ClearGiantForm(false);
    this.ClearEagleForm(false);
    this.playerEagleTimer = 0;
    this.eagleWarnT = 0;
    this.eagleMorph = null;
    this.eagleStroll = null;
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
    if (this.overlays.upgrade) this.overlays.upgrade.hidden = true;
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
      holdDur: this.isTutorial ? 2.4 : 1.65,
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
    const prep = this.stageData?.prepSeconds || 0;
    this.prepTimer = prep;
    if (prep > 0) {
      // Trap / teach stages: give the player time to seal exits before spawns.
      this.spawnTimer = prep;
      this.ShowBuffToast(`准备 ${Math.ceil(prep)}s：扛路障封死敌窝出口！（K / 扛）`);
    } else {
      const preSpawn = this.isTutorial || this.isBossStage || this.isBarricadeTeach ? 1 : 3;
      for (let i = 0; i < preSpawn; i++) {
        this.TrySpawnEnemy(10);
        const last = this.enemies[this.enemies.length - 1];
        if (last) last.spawnFlash = 0;
      }
      this.spawnTimer = this.isTutorial || this.isBarricadeTeach ? 2.4 : (this.isBossStage ? 99 : 1.2);
    }
    this.ApplyStageStartPerks();
    if (this.isBarricadeTeach) {
      this.ShowBuffToast("靠近路障按 K（或「扛」）：扛起=护盾，再按=放下封路");
    } else if (this.isTutorial) {
      this.ShowBuffToast("河北岸：朝下/斜射，用重力清理南岸敌军");
    } else if (this.isBossStage) {
      const perk = FindUpgrade(this.stagePerk);
      const bossTitle = this.stageData.title
        || (this.stageData.bossKind === "tankKing" ? "坦克王" : "重力巨炮");
      this.ShowBuffToast(
        perk ? `BOSS · 本关强化：${perk.title}` : `BOSS：${bossTitle} — 准备战斗！`
      );
    } else {
      const perk = FindUpgrade(this.stagePerk);
      if (perk) this.ShowBuffToast(`本关强化：${perk.title}`);
    }
    this.UpdateHud();
    this.RenderEnemyIcons();
    this.SyncTouchControlsVisibility();
    this.audio.StartBgm();
  }

  SpawnCarryBlocksFromStage() {
    this.carryables = [];
    this.carriedBlock = null;
    const list = this.stageData?.carryBlocks || [];
    for (const b of list) {
      const kind = b.kind === "metal" ? "metal" : "wood";
      this.carryables.push({
        x: b.x * TILE,
        y: b.y * TILE,
        w: TILE,
        h: TILE,
        kind,
        hp: kind === "metal" ? CARRY_METAL_HP : CARRY_WOOD_HP,
        maxHp: kind === "metal" ? CARRY_METAL_HP : CARRY_WOOD_HP,
        alive: true,
        carried: false,
      });
    }
  }

  ApplyStageStartPerks() {
    const p = this.player;
    if (!p?.alive) return;
    if (this.HasPerk("multiShot")) {
      p.maxBullets = Math.max(p.maxBullets, (p.power >= 2 ? 2 : 1) + 1);
    }
    if (this.HasPerk("longerShield")) {
      p.protect = Math.max(p.protect, SPAWN_PROTECT * 1.85);
    }
    if (this.HasPerk("doubleShield")) {
      p.protect = Math.max(p.protect, SPAWN_PROTECT * 2);
    }
    if (this.HasPerk("phaseGhost")) {
      this.ghostTimer = Math.max(this.ghostTimer, 10);
    }
    if (this.HasPerk("fortressWill")) {
      this.shovelTimer = Math.max(this.shovelTimer, 14);
      this.pendingFortRestore = false;
      this.FortifyBase(true);
    }
    if (this.HasPerk("baseArmor")) {
      this.shovelTimer = Math.max(this.shovelTimer, 24);
      this.pendingFortRestore = false;
      this.FortifyBase(true);
    }
    if (this.HasPerk("hitPlates")) {
      this.GrantAbsorbHits(2);
    }
    if (this.HasPerk("ironHide")) {
      this.GrantAbsorbHits(1);
    }
    this.meteorPulseTimer = this.HasPerk("meteorPulse") ? 9 : 0;
    this.timeRiftCd = 0;
  }

  GrantAbsorbHits(n) {
    const add = Math.max(0, n | 0);
    this.absorbHits = Math.min(MAX_ABSORB_HITS, (this.absorbHits || 0) + add);
    if (this.player) this.player.absorbHits = this.absorbHits;
  }

  SyncAbsorbHitsToPlayer() {
    if (this.player) this.player.absorbHits = this.absorbHits || 0;
  }

  /** Ultra「巨大」unlocks only after clearing stage 6 (teach + stages 7–9). */
  IsGiantPowerUnlocked() {
    if (this.isTutorial) return false;
    if (this.isBarricadeTeach) return true;
    return typeof this.stage === "number" && this.stage >= 7;
  }

  StartGiantForm(duration = GIANT_DURATION) {
    const p = this.player;
    if (!p?.alive || this.playerEagleTimer > 0 || this.eagleMorph || p.asEagle) {
      this.ShowBuffToast("老鹰形态下无法巨大化");
      return;
    }
    const cx = p.x + p.w * 0.5;
    const cy = p.y + p.h * 0.5;
    const size = TANK_SIZE * GIANT_SCALE;
    p.w = size;
    p.h = size;
    p.x = Clamp(cx - size * 0.5, 0, CANVAS_W - size);
    p.y = Clamp(cy - size * 0.5, 0, CANVAS_H - size);
    p.speed = PLAYER_SPEED * GIANT_SPEED_MUL;
    this.giantTimer = Math.max(this.giantTimer, duration);
    this.giantHits = Math.max(this.giantHits, GIANT_HITS);
    p.protect = Math.max(p.protect, 1.2);
    this.UnstickTank(p, { maxDist: 80 });
    this.CrushBricksTouchingPlayer();
    this.ShowBuffToast(`巨大化 ${Math.ceil(this.giantTimer)}s · 撞碎砖墙 · 扛伤×${this.giantHits}`);
  }

  ClearGiantForm(restoreTank = true) {
    this.giantTimer = 0;
    this.giantHits = 0;
    const p = this.player;
    if (!restoreTank || !p) return;
    if (!p.alive) {
      p.w = TANK_SIZE;
      p.h = TANK_SIZE;
      return;
    }
    if (p.asEagle || this.playerEagleTimer > 0) return;
    const cx = p.x + p.w * 0.5;
    const cy = p.y + p.h * 0.5;
    p.w = TANK_SIZE;
    p.h = TANK_SIZE;
    p.x = Clamp(cx - TANK_SIZE * 0.5, 0, CANVAS_W - TANK_SIZE);
    p.y = Clamp(cy - TANK_SIZE * 0.5, 0, CANVAS_H - TANK_SIZE);
    p.speed = PLAYER_SPEED;
    this.UnstickTank(p, { maxDist: 64 });
  }

  CrushBricksTouchingPlayer() {
    const p = this.player;
    if (!p?.alive || this.giantTimer <= 0) return;
    const box = { x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 };
    const x0 = Math.floor(box.x / TILE);
    const y0 = Math.floor(box.y / TILE);
    const x1 = Math.floor((box.x + box.w - 0.001) / TILE);
    const y1 = Math.floor((box.y + box.h - 0.001) / TILE);
    let crushed = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (this.map[ty][tx] !== TILE_BRICK) continue;
        if (!this.BrickRectHitsSolid(box, tx, ty)) continue;
        this.SetBrickCell(tx, ty, false);
        crushed++;
      }
    }
    if (crushed > 0 && Math.random() < 0.35) this.audio.Hit();
  }

  /** Spend a giant-form hit charge if available. */
  TryAbsorbWithGiant() {
    if (this.giantTimer <= 0 || this.giantHits <= 0 || !this.player?.alive) return false;
    this.giantHits -= 1;
    this.player.protect = Math.max(this.player.protect, 0.55);
    this.SpawnExplosion(this.player.x + this.player.w * 0.5, this.player.y + this.player.h * 0.5, 0.5);
    this.ShowBuffToast(
      this.giantHits > 0 ? `巨大化扛住！剩余 ${this.giantHits}` : "巨大化护甲耗尽"
    );
    this.audio.Bounce();
    return true;
  }

  /** Enemy shells never hurt bosses; from stage 6+ no enemy↔enemy damage at all. */
  BlocksEnemyFriendlyFire(bullet, target) {
    if (!bullet || bullet.isPlayer) return false;
    if (target?.isBoss || target?.tankKing) return true;
    if (!this.isTutorial && this.stage >= ENEMY_FRIENDLY_FIRE_OFF_STAGE) return true;
    return false;
  }

  GetMaxEnemiesOnField() {
    if (!this.isTutorial && this.stage >= 7) return MAX_ENEMIES_LATE;
    return MAX_ENEMIES_ON_FIELD;
  }

  BuildSpawnQueue() {
    const counts = this.stageData.enemies;
    const mix = [];
    for (let i = 0; i < counts.basic; i++) mix.push(ENEMY_TYPES[0]);
    for (let i = 0; i < counts.fast; i++) mix.push(ENEMY_TYPES[1]);
    for (let i = 0; i < counts.power; i++) mix.push(ENEMY_TYPES[2]);
    for (let i = 0; i < counts.armor; i++) mix.push(ENEMY_TYPES[3]);
    const bossKind = this.stageData.bossKind || "boss";
    const bossType = ENEMY_TYPES.find((t) => t.id === bossKind) || ENEMY_TYPES.find((t) => t.id === "boss");
    for (let i = 0; i < (counts.boss || 0); i++) mix.push(bossType);
    for (let i = 0; i < (counts.tankKing || 0); i++) {
      mix.push(ENEMY_TYPES.find((t) => t.id === "tankKing") || bossType);
    }
    for (let i = 0; i < (counts.tankMan || 0); i++) {
      mix.push(ENEMY_TYPES.find((t) => t.id === "tankMan") || bossType);
    }
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
    if (keepStats?.absorbHits != null) this.absorbHits = keepStats.absorbHits;
    this.playerDisarmed = false;
    this.player = {
      x: sx * TILE + 2,
      y: sy * TILE + 2,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: this.isTutorial ? "down" : "up",
      speed: PLAYER_SPEED,
      power,
      maxBullets,
      absorbHits: this.absorbHits || 0,
      disarmed: false,
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
    if (this.ghostTimer > 0) {
      const prevGhost = this.ghostTimer;
      this.ghostTimer -= dt;
      if (prevGhost > 0 && this.ghostTimer <= 0) {
        this.ghostTimer = 0;
        this.ResolveGhostExpire();
      }
    }
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
    if (this.giantTimer > 0) {
      this.giantTimer -= dt;
      if (this.giantTimer <= 0) {
        this.ClearGiantForm(true);
        this.ShowBuffToast("巨大化结束");
      } else {
        this.CrushBricksTouchingPlayer();
      }
    }
    if (this.timeRiftCd > 0) this.timeRiftCd -= dt;
    if (this.HasPerk("meteorPulse") && this.state === "playing") {
      this.meteorPulseTimer -= dt;
      if (this.meteorPulseTimer <= 0) {
        this.meteorPulseTimer = 11;
        this.SpawnMeteorRain(5);
        this.ShowBuffToast("陨石协议触发");
      }
    }
    if (this.eagleMorph) {
      this.UpdateEagleMorph(dt);
    }
    if (this.eagleStroll) {
      this.UpdateEagleStroll(dt);
    }
    if (this.playerEagleTimer > 0 && !this.eagleMorph) {
      this.playerEagleTimer -= dt;
      if (this.playerEagleTimer <= 0) {
        this.playerEagleTimer = 0;
        this.ClearEagleForm(true);
        this.ShowBuffToast("老鹰诅咒解除，变回坦克");
      }
    }
    if (this.eagleWarnT > 0) this.eagleWarnT -= dt;
    if (this.buffToast) {
      this.buffToast.ttl -= dt;
      if (this.buffToast.ttl <= 0) this.buffToast = null;
    }
    if (this.pendingFortRestore) {
      if (this.TryRestoreBaseFort()) this.pendingFortRestore = false;
    }

    if (this.prepTimer > 0) {
      this.prepTimer -= dt;
      if (this.prepTimer <= 0) {
        this.prepTimer = 0;
        this.ShowBuffToast("敌军出动！");
      }
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
    this.UpdateBombs(dt);
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

  WantsInteract() {
    return this.keys.has("k") || this.touchCarry || this.touchCarryPressed;
  }

  ConsumeInteractPress() {
    const pressed = this.WantsInteract();
    if (!pressed) {
      this.interactArmed = true;
      this.touchCarryPressed = false;
      return false;
    }
    if (!this.interactArmed) return false;
    this.interactArmed = false;
    this.touchCarryPressed = false;
    return true;
  }

  CarryShieldRect(tank) {
    if (!this.carriedBlock || !tank) return null;
    const len = TILE * 0.95;
    const thick = TILE * 0.42;
    const gap = TILE * 0.55;
    if (tank.dir === "up" || tank.dir === "down") {
      const ahead = tank.dir === "up" ? -gap : gap;
      return {
        x: tank.x + tank.w * 0.5 - len * 0.5,
        y: tank.y + tank.h * 0.5 + ahead - thick * 0.5,
        w: len,
        h: thick,
      };
    }
    const ahead = tank.dir === "left" ? -gap : gap;
    return {
      x: tank.x + tank.w * 0.5 + ahead - thick * 0.5,
      y: tank.y + tank.h * 0.5 - len * 0.5,
      w: thick,
      h: len,
    };
  }

  NearestCarryable(tank, maxDist = TILE * 1.45) {
    let best = null;
    let bestDist = maxDist;
    for (const block of this.carryables) {
      if (!block.alive || block.carried) continue;
      const dist = Math.hypot(block.x + block.w * 0.5 - (tank.x + tank.w * 0.5), block.y + block.h * 0.5 - (tank.y + tank.h * 0.5));
      if (dist < bestDist) {
        bestDist = dist;
        best = block;
      }
    }
    return best;
  }

  DropCarriedBlock(atPlayer = true) {
    if (!this.carriedBlock) return;
    const block = this.carriedBlock;
    const p = this.player;
    if (atPlayer && p) {
      block.x = Clamp(p.x + (p.w - block.w) * 0.5, 0, CANVAS_W - block.w);
      block.y = Clamp(p.y + (p.h - block.h) * 0.5, 0, CANVAS_H - block.h);
    }
    block.carried = false;
    this.carriedBlock = null;
  }

  RectHitsTerrain(rect) {
    const pads = [
      [rect.x + 1, rect.y + 1],
      [rect.x + rect.w - 2, rect.y + 1],
      [rect.x + 1, rect.y + rect.h - 2],
      [rect.x + rect.w - 2, rect.y + rect.h - 2],
      [rect.x + rect.w * 0.5, rect.y + rect.h * 0.5],
    ];
    for (const [px, py] of pads) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
      const t = this.map[ty][tx];
      if (t === TILE_BRICK) {
        if (this.BrickSolidAt(px, py)) return true;
        continue;
      }
      if (t === TILE_STEEL || t === TILE_WATER || t === TILE_BASE || t === TILE_BASE_DEAD) return true;
    }
    return false;
  }

  RectHitsTanks(rect, ignore = null) {
    const bodies = [];
    if (this.player?.alive && this.player !== ignore) bodies.push(this.player);
    for (const e of this.enemies) {
      if (e.alive && e !== ignore) bodies.push(e);
    }
    for (const o of bodies) {
      const ob = { x: o.x + 2, y: o.y + 2, w: o.w - 4, h: o.h - 4 };
      if (RectsOverlap(rect, ob)) return true;
    }
    return false;
  }

  TryInteractCarry() {
    if (!this.player?.alive || this.playerStunTimer > 0 || this.eagleMorph || this.playerEagleTimer > 0) return;
    if (this.carriedBlock) {
      const face = DIR[this.player.dir] || DIR.up;
      const placeX = this.player.x + this.player.w * 0.5 + face.x * TILE * 0.95 - TILE * 0.5;
      const placeY = this.player.y + this.player.h * 0.5 + face.y * TILE * 0.95 - TILE * 0.5;
      const rect = {
        x: Clamp(placeX, 0, CANVAS_W - TILE),
        y: Clamp(placeY, 0, CANVAS_H - TILE),
        w: TILE,
        h: TILE,
      };
      if (this.RectHitsTerrain(rect) || this.RectHitsTanks(rect, this.player)) {
        this.ShowBuffToast("前方放不下，换个位置再放下");
        return;
      }
      for (const other of this.carryables) {
        if (!other.alive || other.carried || other === this.carriedBlock) continue;
        if (RectsOverlap(rect, other)) {
          this.ShowBuffToast("这里已有路障");
          return;
        }
      }
      this.carriedBlock.x = rect.x;
      this.carriedBlock.y = rect.y;
      this.carriedBlock.carried = false;
      this.carriedBlock = null;
      this.ShowBuffToast("已放下挡板");
      this.audio.Hit();
      return;
    }
    const near = this.NearestCarryable(this.player);
    if (!near) {
      if (this.isBarricadeTeach || this.stageData?.carryBlocks?.length) {
        this.ShowBuffToast("靠近木板/铁板再按 K（或「扛」）");
      }
      return;
    }
    near.carried = true;
    this.carriedBlock = near;
    this.ShowBuffToast(near.kind === "metal" ? "扛起铁板 · 身前护盾，再按放下" : "扛起木板 · 身前护盾，再按放下");
    this.audio.Power();
  }

  UpdatePlayer(dt) {
    const p = this.player;
    if (!p || !p.alive) return;
    if (this.debugGodMode) p.protect = Math.max(p.protect, 2);
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

    // Transform telegraph: freeze control, glide toward HQ while morph plays.
    if (this.eagleMorph) {
      p.moving = false;
      this.audio.SetEngine(false);
      return;
    }

    // Eagle form: slow waddle near the HQ; no shooting (handled in TryFire).
    const eagleForm = this.playerEagleTimer > 0;
    if (eagleForm) {
      p.asEagle = true;
      p.speed = PLAYER_SPEED * 0.55;
    } else if (p.asEagle) {
      this.ClearEagleForm(true);
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
      const baseSpeed = eagleForm ? PLAYER_SPEED * 0.55 : p.speed;
      const speed = baseSpeed * (onIce ? 1.15 : 1) * (this.carriedBlock ? 0.88 : 1);
      this.MoveTank(p, d.x * speed * dt, d.y * speed * dt);
      if (eagleForm) {
        // Keep the cursed eagle near the HQ band (top or bottom).
        if (this.IsBaseAtTop()) {
          p.y = Clamp(p.y, 2, Math.min(CANVAS_H * 0.45, CANVAS_H - p.h - 2));
        } else {
          p.y = Clamp(p.y, CANVAS_H * 0.55, CANVAS_H - p.h - 2);
        }
      }
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

    this.audio.SetEngine(p.moving && !eagleForm);
    if (p.moving) p.animTick += dt * 10;
    if (this.giantTimer > 0) this.CrushBricksTouchingPlayer();

    if (this.ConsumeInteractPress()) this.TryInteractCarry();
    if (this.WantsFire()) this.TryFire(p, true);

    // pickup → gun barrel restore, or physics roulette
    for (const pu of this.powerups) {
      if (!pu.alive) continue;
      if (RectsOverlap(p, { x: pu.x, y: pu.y, w: 28, h: 28 })) {
        pu.alive = false;
        if (pu.kind === POWER.gunBarrel) {
          this.RestorePlayerBarrel();
        } else {
          this.OpenRoulette();
        }
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

      if (e.typeId === "boss") {
        this.UpdateBoss(e, dt);
        continue;
      }
      if (e.typeId === "tankKing") {
        this.UpdateTankKing(e, dt);
        continue;
      }
      if (e.typeId === "tankMan") {
        this.UpdateTankMan(e, dt);
        continue;
      }

      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        e.aiTimer = 0.4 + Math.random() * 1.2;
        if (this.isTutorial) {
          // South-bank tutorial: staring north and firing drops shells on yourself.
          // Prefer strafing; only rarely aim straight up at the player.
          const roll = Math.random();
          if (roll < 0.55 && this.player?.alive) {
            const dx = this.player.x - e.x;
            if (Math.abs(dx) > 10 || Math.random() < 0.7) {
              e.dir = dx < 0 ? "left" : "right";
            } else {
              e.dir = DirFromVector(dx, this.player.y - e.y);
            }
          } else if (roll < 0.82) {
            e.dir = Math.random() < 0.5 ? "left" : "right";
          } else {
            const dirs = ["left", "right", "down", "down", "up"];
            e.dir = dirs[Math.floor(Math.random() * dirs.length)];
          }
        } else {
          // prefer moving toward player / base
          const roll = Math.random();
          if (roll < 0.45 && this.player?.alive) {
            const dx = this.player.x - e.x;
            const dy = this.player.y - e.y;
            e.dir = DirFromVector(dx, dy);
          } else if (roll < 0.7) {
            // toward base
            const hq = this.GetBaseTarget();
            e.dir = DirFromVector(hq.x - e.x, hq.y - e.y);
          } else {
            e.dir = DIR_KEYS[Math.floor(Math.random() * 4)];
          }
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
        let should = Math.random() < 0.025 || this.AlignedForShot(e, this.player) || this.AlignedForShot(e, this.GetBaseTarget());
        if (should && this.isTutorial && e.dir === "up") {
          // Keep a few upward shots so gravity is visible, but cut most self-kills.
          should = Math.random() < 0.3;
        }
        if (should) this.TryFire(e, false);
      }
    }

    this.enemies = this.enemies.filter((e) => e.alive || e.deathTimer > 0);
    for (const e of this.enemies) {
      if (!e.alive && e.deathTimer > 0) e.deathTimer -= dt;
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.deathTimer > 0);
  }

  /** Tank King: 1 barrel (stage 3) or multi-barrel volleys. */
  UpdateTankKing(e, dt) {
    if (e.barrelFlash) {
      for (const k of Object.keys(e.barrelFlash)) {
        if (e.barrelFlash[k] > 0) e.barrelFlash[k] -= dt;
      }
    }
    e.aiTimer -= dt;
    if (e.aiTimer <= 0) {
      e.aiTimer = 0.45 + Math.random() * 0.55;
      if (this.player?.alive && Math.random() < 0.55) {
        e.dir = DirFromVector(this.player.x - e.x, this.player.y - e.y);
      } else {
        e.dir = DIR_KEYS[Math.floor(Math.random() * 4)];
      }
      // Keep somewhat central — not stuck on the rim.
      if (e.x < 40) e.dir = "right";
      if (e.x > CANVAS_W - e.w - 40) e.dir = "left";
      if (e.y < 40) e.dir = "down";
      if (e.y > CANVAS_H * 0.55) e.dir = "up";
    }

    const d = DIR[e.dir];
    const beforeX = e.x;
    const beforeY = e.y;
    this.MoveTank(e, d.x * e.speed * dt, d.y * e.speed * dt);
    e.x = Clamp(e.x, 8, CANVAS_W - e.w - 8);
    e.y = Clamp(e.y, 8, CANVAS_H * 0.62);
    if (Math.abs(e.x - beforeX) > 0.01 || Math.abs(e.y - beforeY) > 0.01) {
      e.moving = true;
      e.animTick += dt * 10;
    } else {
      e.moving = false;
      e.aiTimer = Math.min(e.aiTimer, 0.12);
    }

    if (this.player?.alive) {
      e.castFace = DirFromVector(this.player.x - e.x, this.player.y - e.y);
    } else {
      e.castFace = "down";
    }

    if (e.attackQueue?.length) {
      this.UpdateBossAttackQueue(e, dt);
      return;
    }
    if (e.fireCd <= 0) {
      const ratio = e.hp / Math.max(1, e.maxHp);
      e.finalPhase = ratio <= BOSS_FINAL_HP_RATIO;
      const barrels = e.barrelCount || 1;
      let pattern;
      if (e.finalPhase && this.playerEagleTimer <= 0 && !this.eagleMorph) {
        const firstUltimate = !e.eagleCurseUsed;
        if (firstUltimate || Math.random() < 0.3) {
          pattern = "eagleCurse";
          e.eagleCurseUsed = true;
        }
      }
      if (!pattern) {
        if (barrels <= 1) {
          pattern = e.finalPhase && Math.random() < 0.4 ? "chaseVolley" : (Math.random() < 0.5 ? "chaseVolley" : "axisBurst");
        } else {
          pattern = TANK_KING_ATTACKS[Math.floor(Math.random() * TANK_KING_ATTACKS.length)];
          if (e.finalPhase && Math.random() < 0.45) pattern = "ringShot";
        }
      }
      this.BeginTankKingAttack(e, pattern);
    }
  }

  BeginTankKingAttack(e, pattern) {
    e.attackPattern = pattern;
    e.attackQueue = [];
    e.attackAge = 0;
    const cdScale = this.GetBossFireCdScale(e);
    const barrels = e.barrelCount || 1;
    const dirs = barrels >= 8 ? DIR_OCTO : barrels <= 1 ? null : DIR_CARDINAL;
    const face = e.castFace || "down";

    if (pattern === "eagleCurse") {
      e.attackQueue.push({ t: 0.35 * cdScale, kind: "eagleCurse" });
      // Wait for morph + opening shield before pressure.
      for (let i = 0; i < 3; i++) {
        e.attackQueue.push({
          t: (EAGLE_MORPH_DUR + 1.1 + i * 0.2) * cdScale,
          kind: "kingShell",
          dir: face,
          angleOffset: (i - 1) * 0.12,
        });
      }
      e.fireCd = (EAGLE_MORPH_DUR + 5.2) * cdScale;
      this.ShowBuffToast("终极诅咒蓄力…");
      return;
    }

    if (barrels <= 1) {
      // Stage-3 single turret: focused chase / short bursts.
      const n = pattern === "chaseVolley" ? 5 : 3;
      for (let i = 0; i < n; i++) {
        e.attackQueue.push({
          t: i * 0.12 * cdScale,
          kind: "kingShell",
          dir: face,
          angleOffset: (i - (n - 1) / 2) * 0.08,
        });
      }
      e.fireCd = 1.85 * cdScale;
      this.ShowBuffToast(pattern === "chaseVolley" ? "坦克王 · 单炮连射" : "坦克王 · 点射");
      return;
    }

    if (pattern === "quadCross") {
      for (let i = 0; i < dirs.length; i++) {
        e.attackQueue.push({ t: i * 0.04 * cdScale, kind: "kingShell", dir: dirs[i] });
      }
      e.fireCd = 2.0 * cdScale;
      this.ShowBuffToast(barrels >= 8 ? "坦克王 · 八向齐射" : "坦克王 · 十字齐射");
    } else if (pattern === "spinFire") {
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < dirs.length; i++) {
          e.attackQueue.push({
            t: (r * dirs.length + i) * 0.1 * cdScale,
            kind: "kingShell",
            dir: dirs[i],
          });
        }
      }
      e.fireCd = 2.6 * cdScale;
      this.ShowBuffToast("坦克王 · 轮射");
    } else if (pattern === "axisBurst") {
      for (const dir of ["left", "right"]) {
        e.attackQueue.push({ t: 0.02 * cdScale, kind: "kingShell", dir });
        e.attackQueue.push({ t: 0.14 * cdScale, kind: "kingShell", dir });
      }
      for (const dir of ["up", "down"]) {
        e.attackQueue.push({ t: 0.32 * cdScale, kind: "kingShell", dir });
        e.attackQueue.push({ t: 0.44 * cdScale, kind: "kingShell", dir });
      }
      e.fireCd = 2.2 * cdScale;
      this.ShowBuffToast("坦克王 · 轴对称连射");
    } else if (pattern === "chaseVolley") {
      for (let i = 0; i < 4; i++) {
        e.attackQueue.push({ t: i * 0.1 * cdScale, kind: "kingShell", dir: face });
      }
      const sideA = face === "up" || face === "down" ? "left" : "up";
      const sideB = face === "up" || face === "down" ? "right" : "down";
      e.attackQueue.push({ t: 0.08 * cdScale, kind: "kingShell", dir: sideA, angleOffset: -0.18 });
      e.attackQueue.push({ t: 0.08 * cdScale, kind: "kingShell", dir: sideB, angleOffset: 0.18 });
      e.fireCd = 2.1 * cdScale;
      this.ShowBuffToast("坦克王 · 追猎齐射");
    } else {
      for (let wave = 0; wave < 3; wave++) {
        for (let i = 0; i < dirs.length; i++) {
          e.attackQueue.push({
            t: (wave * 0.22 + i * 0.03) * cdScale,
            kind: "kingShell",
            dir: dirs[i],
            angleOffset: (wave - 1) * 0.2,
          });
        }
      }
      e.fireCd = 3.0 * cdScale;
      this.ShowBuffToast("坦克王 · 环形弹幕");
    }
  }

  /** Stage-9 bipedal tank man — walks the field, mixes disarm / bombs / sniper. */
  UpdateTankMan(e, dt) {
    if (e.barrelFlash) {
      for (const k of Object.keys(e.barrelFlash)) {
        if (e.barrelFlash[k] > 0) e.barrelFlash[k] -= dt;
      }
    }
    e.aiTimer -= dt;
    if (e.aiTimer <= 0) {
      e.aiTimer = 0.35 + Math.random() * 0.45;
      if (this.player?.alive && Math.random() < 0.62) {
        e.dir = DirFromVector(this.player.x - e.x, this.player.y - e.y);
      } else {
        e.dir = DIR_KEYS[Math.floor(Math.random() * 4)];
      }
      if (e.x < 24) e.dir = "right";
      if (e.x > CANVAS_W - e.w - 24) e.dir = "left";
      if (e.y < 24) e.dir = "down";
      if (e.y > CANVAS_H * 0.72) e.dir = "up";
    }

    const d = DIR[e.dir];
    const beforeX = e.x;
    const beforeY = e.y;
    this.MoveTank(e, d.x * e.speed * dt, d.y * e.speed * dt);
    e.x = Clamp(e.x, 6, CANVAS_W - e.w - 6);
    e.y = Clamp(e.y, 6, CANVAS_H * 0.78);
    if (Math.abs(e.x - beforeX) > 0.01 || Math.abs(e.y - beforeY) > 0.01) {
      e.moving = true;
      e.animTick += dt * 12;
    } else {
      e.moving = false;
      e.aiTimer = Math.min(e.aiTimer, 0.1);
    }

    if (this.player?.alive) {
      e.castFace = DirFromVector(this.player.x - e.x, this.player.y - e.y);
    } else {
      e.castFace = "down";
    }

    if (e.attackQueue?.length) {
      this.UpdateBossAttackQueue(e, dt);
      return;
    }
    if (e.fireCd <= 0) {
      const ratio = e.hp / Math.max(1, e.maxHp);
      const finalPhase = ratio <= BOSS_FINAL_HP_RATIO;
      e.finalPhase = finalPhase;
      let pattern;
      if (finalPhase && this.playerEagleTimer <= 0 && !this.eagleMorph) {
        if (!e.eagleCurseUsed || Math.random() < 0.28) {
          pattern = "eagleCurse";
          e.eagleCurseUsed = true;
        }
      }
      if (!pattern) {
        // Bias toward signature moves; more bombs/sniper when player is armed.
        const pool = TANK_MAN_ATTACKS.slice();
        if (!this.playerDisarmed && Math.random() < 0.42) pattern = "disarmThrow";
        else if (Math.random() < 0.28) pattern = "layBomb";
        else if (Math.random() < 0.32) pattern = "sniperVolley";
        else pattern = pool[Math.floor(Math.random() * pool.length)];
      }
      this.BeginTankManAttack(e, pattern);
    }
  }

  BeginTankManAttack(e, pattern) {
    e.attackPattern = pattern;
    e.attackQueue = [];
    e.attackAge = 0;
    const cdScale = this.GetBossFireCdScale(e);
    const face = e.castFace || "down";

    if (pattern === "eagleCurse") {
      e.attackQueue.push({ t: 0.3 * cdScale, kind: "eagleCurse" });
      for (let i = 0; i < 2; i++) {
        e.attackQueue.push({
          t: (EAGLE_MORPH_DUR + 0.9 + i * 0.18) * cdScale,
          kind: "sniper",
          dir: face,
          angleOffset: (i - 0.5) * 0.06,
        });
      }
      e.fireCd = (EAGLE_MORPH_DUR + 4.8) * cdScale;
      this.ShowBuffToast("腿甲坦克人 · 终极诅咒");
      return;
    }

    if (pattern === "disarmThrow") {
      e.attackQueue.push({ t: 0.25 * cdScale, kind: "disarmThrow" });
      e.attackQueue.push({ t: 0.55 * cdScale, kind: "layBomb" });
      e.fireCd = 3.2 * cdScale;
      this.ShowBuffToast("拆炮！炮管被扔走了");
      return;
    }

    if (pattern === "layBomb") {
      const n = e.finalPhase ? 3 : 2;
      for (let i = 0; i < n; i++) {
        e.attackQueue.push({ t: i * 0.22 * cdScale, kind: "layBomb" });
      }
      e.fireCd = 2.4 * cdScale;
      this.ShowBuffToast("定时炸弹！找掩体");
      return;
    }

    if (pattern === "sniperVolley") {
      const n = e.finalPhase ? 5 : 3;
      for (let i = 0; i < n; i++) {
        e.attackQueue.push({
          t: i * 0.16 * cdScale,
          kind: "sniper",
          dir: face,
          angleOffset: (i - (n - 1) / 2) * 0.05,
        });
      }
      e.fireCd = 2.6 * cdScale;
      this.ShowBuffToast("狙击直线弹 · 会反弹");
      return;
    }

    if (pattern === "bounceFan") {
      for (let i = -2; i <= 2; i++) {
        e.attackQueue.push({
          t: Math.abs(i) * 0.06 * cdScale,
          kind: "sniper",
          dir: face,
          angleOffset: i * 0.22,
        });
      }
      e.fireCd = 2.8 * cdScale;
      this.ShowBuffToast("弹射扇形狙击");
      return;
    }

    if (pattern === "mortarLob") {
      const aimX = this.player?.alive ? this.player.x + this.player.w / 2 : CANVAS_W / 2;
      for (let i = 0; i < 3; i++) {
        e.attackQueue.push({
          t: i * 0.18 * cdScale,
          kind: "mortar",
          aimX: aimX + (i - 1) * 48,
        });
      }
      e.fireCd = 2.5 * cdScale;
      this.ShowBuffToast("榴弹抛射");
      return;
    }

    if (pattern === "chaseBurst") {
      for (let i = 0; i < 4; i++) {
        e.attackQueue.push({
          t: i * 0.1 * cdScale,
          kind: "kingShell",
          dir: face,
          angleOffset: (i - 1.5) * 0.07,
        });
      }
      e.fireCd = 2.1 * cdScale;
      this.ShowBuffToast("近身连射");
      return;
    }

    // stompRain — mix rain + bombs
    for (let i = 0; i < 5; i++) {
      e.attackQueue.push({ t: i * 0.1 * cdScale, kind: "rain" });
    }
    e.attackQueue.push({ t: 0.35 * cdScale, kind: "layBomb" });
    e.attackQueue.push({ t: 0.55 * cdScale, kind: "layBomb" });
    e.fireCd = 3.1 * cdScale;
    this.ShowBuffToast("踩踏弹雨 + 炸弹");
  }

  /** Boss patrols the upper band and cycles gravity-shell attack patterns. */
  UpdateBoss(e, dt) {
    if (e.barrelFlash) {
      for (const k of Object.keys(e.barrelFlash)) {
        if (e.barrelFlash[k] > 0) e.barrelFlash[k] -= dt;
      }
    }
    e.aiTimer -= dt;
    if (e.aiTimer <= 0) {
      e.aiTimer = 0.55 + Math.random() * 0.7;
      const preferLeft = e.x > CANVAS_W * 0.55;
      const preferRight = e.x < CANVAS_W * 0.35;
      if (preferLeft) e.dir = "left";
      else if (preferRight) e.dir = "right";
      else e.dir = Math.random() < 0.7 ? (Math.random() < 0.5 ? "left" : "right") : "down";
      // Keep boss in the upper third.
      if (e.y > CANVAS_H * 0.32) e.dir = "up";
      if (e.y < 24) e.dir = Math.random() < 0.5 ? "left" : "right";
    }

    const d = DIR[e.dir];
    const beforeX = e.x;
    const beforeY = e.y;
    this.MoveTank(e, d.x * e.speed * dt, d.y * e.speed * dt);
    e.x = Clamp(e.x, 8, CANVAS_W - e.w - 8);
    e.y = Clamp(e.y, 8, CANVAS_H * 0.38);
    if (Math.abs(e.x - beforeX) > 0.01 || Math.abs(e.y - beforeY) > 0.01) {
      e.moving = true;
      e.animTick += dt * 10;
    } else {
      e.moving = false;
      e.aiTimer = Math.min(e.aiTimer, 0.12);
    }

    // Face the player when casting.
    if (this.player?.alive) {
      const face = DirFromVector(this.player.x - e.x, this.player.y - e.y);
      if (face === "down" || face === "left" || face === "right") e.castFace = face;
      else e.castFace = "down";
    } else {
      e.castFace = "down";
    }

    if (e.attackQueue?.length) {
      this.UpdateBossAttackQueue(e, dt);
      return;
    }

    if (e.fireCd <= 0) {
      const ratio = e.hp / Math.max(1, e.maxHp);
      const finalPhase = ratio <= BOSS_FINAL_HP_RATIO;
      e.finalPhase = finalPhase;
      let pattern;
      if (finalPhase && this.playerEagleTimer <= 0 && !this.eagleMorph) {
        // Final phase: guarantee first ultimate, then periodically recast.
        const firstUltimate = !e.eagleCurseUsed;
        if (firstUltimate || Math.random() < 0.38) {
          pattern = "eagleCurse";
          e.eagleCurseUsed = true;
        }
      }
      if (!pattern) {
        if ((e.barrelCount || 0) >= 8 && Math.random() < 0.34) {
          pattern = BOSS_OCTO_ATTACKS[Math.floor(Math.random() * BOSS_OCTO_ATTACKS.length)];
        } else {
          pattern = BOSS_ATTACKS[Math.floor(Math.random() * BOSS_ATTACKS.length)];
        }
      }
      this.BeginBossAttack(e, pattern);
    }
  }

  BeginBossAttack(e, pattern) {
    e.attackPattern = pattern;
    e.attackQueue = [];
    const face = e.castFace || "down";
    e.dir = face === "up" ? "down" : face;
    const cdScale = this.GetBossFireCdScale(e);

    if (pattern === "octoCross") {
      for (let i = 0; i < DIR_OCTO.length; i++) {
        e.attackQueue.push({ t: i * 0.03 * cdScale, kind: "kingShell", dir: DIR_OCTO[i] });
      }
      e.fireCd = 2.4 * cdScale;
      this.ShowBuffToast("八管齐射！");
    } else if (pattern === "octoSpin") {
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < DIR_OCTO.length; i++) {
          e.attackQueue.push({
            t: (r * DIR_OCTO.length + i) * 0.08 * cdScale,
            kind: "kingShell",
            dir: DIR_OCTO[i],
          });
        }
      }
      e.fireCd = 3.0 * cdScale;
      this.ShowBuffToast("八管轮射");
    } else if (pattern === "octoRing") {
      for (let wave = 0; wave < 2; wave++) {
        for (let i = 0; i < DIR_OCTO.length; i++) {
          e.attackQueue.push({
            t: (wave * 0.28 + i * 0.025) * cdScale,
            kind: "kingShell",
            dir: DIR_OCTO[i],
            angleOffset: (wave - 0.5) * 0.12,
          });
        }
      }
      e.fireCd = 3.2 * cdScale;
      this.ShowBuffToast("八管环射");
    } else if (pattern === "barrage") {
      // 万炮齐发：宽扇形下压弹幕
      const n = 11;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = -1.05 + t * 2.1;
        e.attackQueue.push({ t: i * 0.04 * cdScale, kind: "shell", dir: "down", angleOffset: ang, label: i === 0 });
      }
      e.fireCd = 3.2 * cdScale;
      this.ShowBuffToast("万炮齐发！");
    } else if (pattern === "fan") {
      // 扇形追击：朝玩家扇形 5 发
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = -0.55 + t * 1.1;
        e.attackQueue.push({ t: 0.02 * i * cdScale, kind: "shell", dir: face, angleOffset: ang });
      }
      e.fireCd = 2.4 * cdScale;
      this.ShowBuffToast("扇形追击");
    } else if (pattern === "mortar") {
      // 曲射迫击：高抛弧线砸向玩家附近
      const px = this.player?.alive ? this.player.x + this.player.w / 2 : CANVAS_W / 2;
      for (let i = 0; i < 5; i++) {
        const aimX = px + (i - 2) * 36;
        e.attackQueue.push({ t: i * 0.12 * cdScale, kind: "mortar", aimX });
      }
      e.fireCd = 2.8 * cdScale;
      this.ShowBuffToast("曲射迫击");
    } else if (pattern === "sweep") {
      // 横向扫射：从左到右（或反向）依次发射
      const leftToRight = Math.random() < 0.5;
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = leftToRight ? (-0.95 + t * 1.9) : (0.95 - t * 1.9);
        e.attackQueue.push({ t: i * 0.08 * cdScale, kind: "shell", dir: "down", angleOffset: ang });
      }
      e.fireCd = 3.0 * cdScale;
      this.ShowBuffToast("横向扫射");
    } else if (pattern === "rain") {
      // 天降弹雨：上方落下慢速重力弹
      for (let i = 0; i < 8; i++) {
        e.attackQueue.push({ t: i * 0.1 * cdScale, kind: "rain" });
      }
      e.fireCd = 3.1 * cdScale;
      this.ShowBuffToast("天降弹雨");
    } else if (pattern === "burst") {
      // 三点连射：对准玩家连发
      for (let i = 0; i < 3; i++) {
        e.attackQueue.push({ t: i * 0.22 * cdScale, kind: "shell", dir: face, angleOffset: 0 });
      }
      e.fireCd = 2.1 * cdScale;
      this.ShowBuffToast("三点连射");
    } else if (pattern === "eagleCurse") {
      e.attackQueue.push({ t: 0.4 * cdScale, kind: "eagleCurse" });
      // Follow-up after morph telegraph + opening shield.
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const ang = -0.85 + t * 1.7;
        e.attackQueue.push({
          t: (EAGLE_MORPH_DUR + 1.25 + i * 0.12) * cdScale,
          kind: "shell",
          dir: "down",
          angleOffset: ang,
        });
      }
      e.fireCd = (EAGLE_MORPH_DUR + 6.5) * cdScale;
      this.ShowBuffToast("终极诅咒蓄力…");
    } else {
      e.fireCd = 1.5 * cdScale;
    }
    e.attackAge = 0;
  }

  UpdateBossAttackQueue(e, dt) {
    e.attackAge = (e.attackAge || 0) + dt;
    const due = [];
    const rest = [];
    for (const shot of e.attackQueue) {
      if (e.attackAge >= shot.t) due.push(shot);
      else rest.push(shot);
    }
    e.attackQueue = rest;
    for (const shot of due) this.FireBossShot(e, shot);
    if (!e.attackQueue.length) {
      e.attackPattern = null;
      e.attackAge = 0;
    }
  }

  FireBossShot(e, shot) {
    if (shot.kind === "eagleCurse") {
      this.ApplyEagleCurse();
      this.audio.Explode();
      return;
    }
    if (shot.kind === "disarmThrow") {
      this.DisarmPlayerThrowBarrel(e);
      return;
    }
    if (shot.kind === "layBomb") {
      this.LayTimedBomb(e);
      return;
    }
    if (shot.kind === "sniper") {
      this.SpawnSniperShellFromDir(e, shot.dir || "down", shot.angleOffset || 0);
      if (e.barrelFlash && shot.dir) e.barrelFlash[shot.dir] = 0.16;
      this.audio.Shoot();
      return;
    }
    if (shot.kind === "kingShell") {
      this.SpawnKingShellFromDir(e, shot.dir || "down", shot.angleOffset || 0);
      if (e.barrelFlash && shot.dir) e.barrelFlash[shot.dir] = 0.14;
      this.audio.Shoot();
      return;
    }
    if (shot.kind === "rain") {
      const x = 24 + Math.random() * (CANVAS_W - 48);
      this.SpawnBossShell(e, {
        x,
        y: -12,
        vx: (Math.random() - 0.5) * 40,
        vy: 40 + Math.random() * 30,
        face: "down",
      });
      this.audio.Shoot();
      return;
    }
    if (shot.kind === "mortar") {
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const aimX = shot.aimX ?? CANVAS_W / 2;
      const dx = aimX - cx;
      const speed = BULLET_SPEED * BOSS_SHELL_SPEED;
      // High lob: strong upward kick then gravity brings it down near aimX.
      const vx = Clamp(dx * 0.55, -speed * 0.85, speed * 0.85);
      const vy = -220 - Math.random() * 40;
      this.SpawnBossShell(e, { x: cx - 4, y: cy - 4, vx, vy, face: "up" });
      this.audio.Shoot();
      return;
    }
    // Default gravity shell with optional angle offset.
    this.SpawnBossShellFromDir(e, shot.dir || "down", shot.angleOffset || 0);
    if (e.barrelFlash && shot.dir) e.barrelFlash[shot.dir] = 0.14;
    this.audio.Shoot();
  }

  DisarmPlayerThrowBarrel(boss) {
    const p = this.player;
    if (!p?.alive) return;
    if (this.playerDisarmed || p.disarmed) {
      // Already disarmed — toss another bomb near the existing barrel instead.
      this.LayTimedBomb(boss);
      return;
    }
    this.playerDisarmed = true;
    p.disarmed = true;
    // Clear old barrel pickups so only one exists.
    for (const pu of this.powerups) {
      if (pu.kind === POWER.gunBarrel) pu.alive = false;
    }
    const drop = this.FindFarEmptyDrop(p.x + p.w / 2, p.y + p.h / 2);
    this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 0.7);
    this.DropPowerup(drop.x, drop.y, POWER.gunBarrel);
    this.ShowBuffToast("炮管被拆走！去地图捡回才能开火");
    this.audio.Explode();
  }

  RestorePlayerBarrel() {
    this.playerDisarmed = false;
    if (this.player) {
      this.player.disarmed = false;
      this.player.protect = Math.max(this.player.protect, 1.2);
    }
    this.SpawnExplosion(
      (this.player?.x || 0) + (this.player?.w || 0) / 2,
      (this.player?.y || 0) + (this.player?.h || 0) / 2,
      0.45
    );
    this.ShowBuffToast("炮管装回！可以开火了");
    this.audio.Power();
  }

  FindFarEmptyDrop(fromX, fromY) {
    const candidates = [];
    for (let y = 1; y < MAP_H - 2; y++) {
      for (let x = 1; x < MAP_W - 2; x++) {
        const t = this.map[y][x];
        if (t !== TILE_EMPTY && t !== TILE_ICE && t !== TILE_GRASS) continue;
        if (this.TileOccupiedByTank(x, y)) continue;
        const px = x * TILE + 2;
        const py = y * TILE + 2;
        const dist = Math.hypot(px - fromX, py - fromY);
        if (dist < 110) continue;
        candidates.push({ x: px, y: py, dist });
      }
    }
    if (!candidates.length) {
      return {
        x: Clamp(CANVAS_W - fromX, 24, CANVAS_W - 40),
        y: Clamp(CANVAS_H - fromY, 24, CANVAS_H - 40),
      };
    }
    candidates.sort((a, b) => b.dist - a.dist);
    const pick = candidates[Math.floor(Math.random() * Math.min(8, candidates.length))];
    return { x: pick.x, y: pick.y };
  }

  LayTimedBomb(boss) {
    const p = this.player;
    let x;
    let y;
    if (p?.alive && Math.random() < 0.7) {
      x = Clamp(p.x + (Math.random() - 0.5) * 80, 16, CANVAS_W - 32);
      y = Clamp(p.y + (Math.random() - 0.5) * 80, 16, CANVAS_H - 32);
    } else {
      x = Clamp(boss.x + boss.w / 2 + (Math.random() - 0.5) * 120, 16, CANVAS_W - 32);
      y = Clamp(boss.y + boss.h / 2 + (Math.random() - 0.5) * 120, 16, CANVAS_H - 32);
    }
    this.bombs.push({
      x,
      y,
      fuse: 2.2 + Math.random() * 0.8,
      radius: 46,
      alive: true,
      blink: 0,
    });
    this.audio.PowerSpawn();
  }

  UpdateBombs(dt) {
    if (!this.bombs) this.bombs = [];
    for (const bomb of this.bombs) {
      if (!bomb.alive) continue;
      bomb.fuse -= dt;
      bomb.blink += dt;
      if (bomb.fuse <= 0) {
        bomb.alive = false;
        this.DetonateTimedBomb(bomb);
      }
    }
    this.bombs = this.bombs.filter((b) => b.alive);
  }

  DetonateTimedBomb(bomb) {
    this.SpawnExplosion(bomb.x + 8, bomb.y + 8, 1.35);
    this.audio.Explode();
    // Dig nearby bricks.
    const r = bomb.radius;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        if (Math.hypot(cx - (bomb.x + 8), cy - (bomb.y + 8)) > r) continue;
        if (this.map[y][x] === TILE_BRICK) this.SetBrickCell(x, y, false);
      }
    }
    const p = this.player;
    if (!p?.alive) return;
    const dx = p.x + p.w / 2 - (bomb.x + 8);
    const dy = p.y + p.h / 2 - (bomb.y + 8);
    if (Math.hypot(dx, dy) > r) return;
    if (p.protect > 0) {
      this.audio.Bounce();
      return;
    }
    if (this.TryAbsorbWithGiant()) return;
    if ((this.absorbHits || 0) > 0) {
      this.absorbHits -= 1;
      p.absorbHits = this.absorbHits;
      p.protect = Math.max(p.protect, 1.0);
      this.ShowBuffToast(this.absorbHits > 0 ? `装甲抵挡炸弹！剩余 ${this.absorbHits}` : "装甲耗尽！");
      this.audio.Bounce();
      return;
    }
    this.KillPlayer();
  }

  SpawnSniperShellFromDir(e, dirName, angleOffset = 0) {
    const d = DIR[dirName] || DIR.down;
    const spd = BULLET_SPEED * 1.15;
    let vx = d.x * spd;
    let vy = d.y * spd;
    // True straight shot — no gravity kick on spawn.
    if (angleOffset) {
      const c = Math.cos(angleOffset);
      const s = Math.sin(angleOffset);
      const rx = vx * c - vy * s;
      const ry = vx * s + vy * c;
      vx = rx;
      vy = ry;
    }
    const muzzle = Math.max(20, e.w * 0.45);
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    this.SpawnBossShell(e, {
      x: cx - 3 + d.x * muzzle,
      y: cy - 3 + d.y * muzzle,
      vx,
      vy,
      face: dirName,
      gravityMul: 0,
      bounceLeft: 5,
      sniper: true,
      w: 6,
      h: 6,
      power: 1,
      arm: 0.08,
    });
  }

  SpawnKingShellFromDir(e, dirName, angleOffset = 0) {
    const d = DIR[dirName] || DIR.down;
    const spd = BULLET_SPEED * 0.92;
    let vx = d.x * spd;
    let vy = d.y * spd;
    if (dirName === "left" || dirName === "right") vy -= 55;
    else if (dirName === "up") vy -= 25;
    else vy += 8;

    if (angleOffset) {
      const c = Math.cos(angleOffset);
      const s = Math.sin(angleOffset);
      const rx = vx * c - vy * s;
      const ry = vx * s + vy * c;
      vx = rx;
      vy = ry;
    }

    const muzzle = Math.max(18, e.w * 0.42);
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    this.bullets.push({
      x: cx - 4 + d.x * muzzle,
      y: cy - 4 + d.y * muzzle,
      w: 8,
      h: 8,
      vx,
      vy,
      alive: true,
      owner: e,
      isPlayer: false,
      face: dirName,
      power: 1,
      trail: [],
      arm: 0.12,
      traveled: 0,
      gravityMul: 1,
      bounceLeft: 0,
      pierceLeft: 0,
      homing: false,
      meteor: false,
      bossShell: true,
      kingShell: true,
    });
  }

  SpawnBossShellFromDir(e, dirName, angleOffset = 0) {
    const d = DIR[dirName] || DIR.down;
    const spd = BULLET_SPEED * BOSS_SHELL_SPEED;
    let vx = d.x * spd;
    let vy = d.y * spd;
    if (dirName === "left" || dirName === "right") vy -= 70;
    else if (dirName === "up") vy -= 30;
    else vy += 10; // slight push when firing down

    if (angleOffset) {
      const c = Math.cos(angleOffset);
      const s = Math.sin(angleOffset);
      const rx = vx * c - vy * s;
      const ry = vx * s + vy * c;
      vx = rx;
      vy = ry;
    }

    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    this.SpawnBossShell(e, {
      x: cx - 4 + d.x * 16,
      y: cy - 4 + d.y * 16,
      vx,
      vy,
      face: dirName,
    });
  }

  SpawnBossShell(e, { x, y, vx, vy, face, gravityMul = 1, bounceLeft = 0, sniper = false, w = 6, h = 14, power = 1, arm = 0.18 }) {
    this.bullets.push({
      x,
      y,
      w,
      h,
      vx,
      vy,
      alive: true,
      owner: e,
      isPlayer: false,
      face: face || "down",
      power,
      trail: [],
      arm,
      traveled: 0,
      gravityMul,
      bounceLeft,
      pierceLeft: 0,
      homing: false,
      meteor: false,
      bossShell: true,
      sniper: !!sniper,
    });
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
    return this.CollidesTerrain(tank) || this.CollidesTanks(tank) || this.CollidesCarryables(tank);
  }

  /** Push a tank out of embeds. Larger radius used when ghost ends inside walls. */
  UnstickTank(tank, opts = {}) {
    if (!tank || !tank.alive) return false;
    if (!this.TankBlocked(tank)) return false;

    const originX = tank.x;
    const originY = tank.y;
    const maxDist = opts.maxDist ?? 32;
    const steps = [];
    for (let d = 4; d <= maxDist; d += 4) steps.push(d);
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

  /** After ghost fades: eject from brick/steel so the tank is not soft-locked. */
  ResolveGhostExpire() {
    const p = this.player;
    if (!p?.alive) return;
    if (!this.TankBlocked(p)) return;
    if (this.UnstickTank(p, { maxDist: 96 })) {
      p.protect = Math.max(p.protect, 1.2);
      return;
    }
    if (this.EjectTankToOpenTile(p)) {
      p.protect = Math.max(p.protect, 1.5);
      this.ShowBuffToast("幽灵消散 · 已弹出墙体");
    }
  }

  EjectTankToOpenTile(tank) {
    const cx = Math.floor((tank.x + tank.w / 2) / TILE);
    const cy = Math.floor((tank.y + tank.h / 2) / TILE);
    const originX = tank.x;
    const originY = tank.y;
    for (let radius = 0; radius <= 14; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const tx = cx + dx;
          const ty = cy + dy;
          if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
          const t = this.map[ty][tx];
          if (t === TILE_STEEL || t === TILE_WATER || t === TILE_BASE || t === TILE_BASE_DEAD) continue;
          if (t === TILE_BRICK && (this.brickMask?.[ty]?.[tx] ?? BRICK_FULL) !== 0) continue;
          tank.x = Clamp(tx * TILE + (TILE - tank.w) / 2, 0, CANVAS_W - tank.w);
          tank.y = Clamp(ty * TILE + (TILE - tank.h) / 2, 0, CANVAS_H - tank.h);
          if (!this.TankBlocked(tank)) return true;
        }
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
    // AABB vs tiles (and brick quarters) — point pads miss remaining half-bricks and soft-lock.
    const box = { x: tank.x + 2, y: tank.y + 2, w: tank.w - 4, h: tank.h - 4 };
    const x0 = Math.floor(box.x / TILE);
    const y0 = Math.floor(box.y / TILE);
    const x1 = Math.floor((box.x + box.w - 0.001) / TILE);
    const y1 = Math.floor((box.y + box.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
        const t = this.map[ty][tx];
        if (ghost) {
          if (t === TILE_BASE || t === TILE_BASE_DEAD) return true;
          continue;
        }
        if (t === TILE_BRICK) {
          // Giant form smashes ordinary bricks instead of being blocked.
          if (tank === this.player && this.giantTimer > 0) continue;
          if (this.BrickRectHitsSolid(box, tx, ty)) return true;
          continue;
        }
        if (t === TILE_STEEL || t === TILE_WATER || t === TILE_BASE || t === TILE_BASE_DEAD) return true;
      }
    }
    return false;
  }

  /** True if rect overlaps any remaining solid 8×8 quarter of brick cell (tx,ty). */
  BrickRectHitsSolid(rect, tx, ty) {
    if (this.map[ty]?.[tx] !== TILE_BRICK) return false;
    const mask = this.brickMask?.[ty]?.[tx] ?? BRICK_FULL;
    if (!mask) return false;
    for (const bit of BRICK_QUARTER_BITS) {
      if (!(mask & bit)) continue;
      if (RectsOverlap(rect, BrickQuarterRect(tx, ty, bit))) return true;
    }
    return false;
  }

  /** First brick cell whose solid quarter overlaps the bullet body (prefer facing tip). */
  FindBrickCellHitByBullet(b) {
    const face = b.face || DirFromVector(b.vx, b.vy);
    const fd = DIR[face] || { x: Math.sign(b.vx) || 0, y: Math.sign(b.vy) || 0 };
    const cx = b.x + b.w * 0.5;
    const cy = b.y + b.h * 0.5;
    // Prefer tip samples so the entry-side cell wins when straddling two tiles.
    const probes = [
      [cx + fd.x * 5, cy + fd.y * 5],
      [cx + fd.x * 2, cy + fd.y * 2],
      [cx, cy],
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x, b.y + b.h],
      [b.x + b.w, b.y + b.h],
    ];
    for (const [px, py] of probes) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (this.map[ty][tx] !== TILE_BRICK) continue;
      if (this.BrickSolidAt(px, py) || this.BrickRectHitsSolid(b, tx, ty)) {
        return { tx, ty };
      }
    }
    // Full AABB sweep over covered cells (nestled flush / gravity curve).
    const x0 = Math.floor(b.x / TILE);
    const y0 = Math.floor(b.y / TILE);
    const x1 = Math.floor((b.x + b.w - 0.001) / TILE);
    const y1 = Math.floor((b.y + b.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        if (this.map[ty][tx] !== TILE_BRICK) continue;
        if (this.BrickRectHitsSolid(b, tx, ty)) return { tx, ty };
      }
    }
    return null;
  }

  BulletHitTerrain(b) {
    const face = b.face || DirFromVector(b.vx, b.vy);
    const fd = DIR[face] || { x: Math.sign(b.vx) || 0, y: Math.sign(b.vy) || 0 };
    const cx = b.x + b.w * 0.5;
    const cy = b.y + b.h * 0.5;

    const brickHit = this.FindBrickCellHitByBullet(b);
    if (brickHit) {
      const { tx, ty } = brickHit;
      if (b.sniper && b.bounceLeft > 0) {
        if (Math.abs(b.vx) >= Math.abs(b.vy)) b.vx *= -1;
        else b.vy *= -1;
        b.x += Math.sign(b.vx || 1) * 4;
        b.y += Math.sign(b.vy || 1) * 4;
        b.bounceLeft -= 1;
        this.audio.Bounce();
        return false;
      }
      this.DestroyBrickHalf(tx, ty, b, b.power);
      b.alive = false;
      this.SpawnExplosion(b.x, b.y, 0.45);
      this.audio.Hit();
      return true;
    }

    // Steel / base: tip + body samples (full cells).
    const samples = [
      [cx + fd.x * 5, cy + fd.y * 5],
      [cx + fd.x * 2, cy + fd.y * 2],
      [cx, cy],
      [b.x + b.w * 0.5, b.y + b.h * 0.5],
    ];
    for (const [px, py] of samples) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      const t = this.map[ty][tx];
      if (t === TILE_EMPTY || t === TILE_GRASS || t === TILE_ICE || t === TILE_WATER || t === TILE_BRICK) continue;

      if (t === TILE_STEEL) {
        if (b.bounceLeft > 0 && b.power < 3) {
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

  CollidesCarryables(self) {
    const box = { x: self.x + 2, y: self.y + 2, w: self.w - 4, h: self.h - 4 };
    for (const block of this.carryables) {
      if (!block.alive || block.carried) continue;
      if (RectsOverlap(box, block)) return true;
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
    if (isPlayer && this.eagleMorph) return;
    if (isPlayer && this.playerEagleTimer > 0) return;
    if (isPlayer && (this.playerDisarmed || tank.disarmed)) {
      if (Math.random() < 0.02) this.ShowBuffToast("炮管被拆！去地图上捡回来");
      return;
    }
    if (tank.fireCd > 0) return;
    const owned = this.bullets.filter((b) => b.alive && b.owner === tank).length;
    let maxB = isPlayer ? tank.maxBullets : 1;
    if (isPlayer && this.overdriveTimer > 0) maxB = Math.max(maxB, 4);
    if (isPlayer && this.rapidTimer > 0) maxB = Math.max(maxB, 3);
    if (isPlayer && (this.forkTimer > 0 || this.spreadTimer > 0)) maxB = Math.max(maxB, 5);
    if (isPlayer && this.HasPerk("multiShot")) maxB = Math.max(maxB, tank.maxBullets);
    if (owned >= maxB) return;

    this.SpawnShell(tank, tank.dir, isPlayer);
    if (isPlayer && this.forkTimer > 0) {
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: -0.38 });
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: 0.38 });
    } else if (isPlayer && this.spreadTimer > 0) {
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: -0.55 });
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: 0.55 });
    } else if (isPlayer && this.HasPerk("overloadFan") && Math.random() < 0.28) {
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: -0.42 });
      this.SpawnShell(tank, tank.dir, true, { bonusShot: true, angleOffset: 0.42 });
    }
    if (isPlayer && this.mirrorTimer > 0) {
      const opp = { up: "down", down: "up", left: "right", right: "left" }[tank.dir];
      this.SpawnShell(tank, opp, true, { bonusShot: true });
    } else if (isPlayer && this.HasPerk("mirrorShot")) {
      const opp = { up: "down", down: "up", left: "right", right: "left" }[tank.dir];
      this.SpawnShell(tank, opp, true, { bonusShot: true });
    }
    if (isPlayer && this.rapidTimer > 0) tank.fireCd = 0.045;
    else if (isPlayer && this.overdriveTimer > 0) tank.fireCd = 0.07;
    else if (isPlayer && this.sniperTimer > 0) tank.fireCd = 0.42;
    else if (isPlayer && this.HasPerk("rapidFire")) tank.fireCd = tank.power >= 2 ? 0.12 : 0.18;
    else tank.fireCd = isPlayer ? (tank.power >= 2 ? 0.286 : 0.416) : tank.shootCd * (this.enemyRageTimer > 0 ? 0.55 : 1);
    this.audio.Shoot();
  }

  SpawnShell(tank, dirName, isPlayer, opts = {}) {
    const d = DIR[dirName];
    let speedMul = 1;
    if (isPlayer && tank.power >= 2) speedMul *= 1.12;
    if (isPlayer && this.sniperTimer > 0) speedMul *= 1.55;
    if (isPlayer && this.rapidTimer > 0) speedMul *= 1.1;
    if (isPlayer && this.HasPerk("bulletSpeed")) speedMul *= 1.22;
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
    const muzzle = Math.max(14, (tank.w || TANK_SIZE) * 0.42);
    let gravityMul = 1;
    if (isPlayer && this.antigravTimer > 0) gravityMul = -0.35;
    if (isPlayer && this.heavyCurseTimer > 0) gravityMul *= 2.6;
    if (isPlayer && this.sniperTimer > 0) gravityMul *= 0.45;
    if (isPlayer && this.HasPerk("lightGravity")) gravityMul *= 0.55;
    if (!isPlayer && this.HasPerk("enemyAnchor")) gravityMul *= 1.5;
    let bounceLeft = isPlayer && this.bounceTimer > 0 ? 5 : 0;
    if (isPlayer && this.HasPerk("bounceShell")) bounceLeft = Math.max(bounceLeft, 2);
    const homing = (isPlayer && this.magnetTimer > 0) || (isPlayer && this.HasPerk("huntMark"));
    let pierceLeft = isPlayer && this.pierceTimer > 0 ? 3 : 0;
    if (isPlayer && this.HasPerk("pierceShell")) pierceLeft = Math.max(pierceLeft, 1);

    this.bullets.push({
      x: cx - 4 + d.x * muzzle,
      y: cy - 4 + d.y * muzzle,
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

      // Flush against a remaining half-brick: resolve before the first step can tunnel.
      if (this.BulletHitTerrain(b)) continue;
      if (this.BulletHitCarryables(b)) continue;
      if (this.BulletHitEagleStroll(b)) continue;

      const stepX = b.vx * dt;
      const stepY = b.vy * dt;
      const dist = Math.hypot(stepX, stepY);
      // Half-bricks are only 8px thick — substep so shells cannot skip through them.
      const subCount = Math.max(1, Math.ceil(dist / 3));
      const prevX = b.x;
      const prevY = b.y;
      let hitSolid = false;
      for (let i = 1; i <= subCount; i++) {
        b.x = prevX + stepX * (i / subCount);
        b.y = prevY + stepY * (i / subCount);
        if (this.BulletHitTerrain(b) || this.BulletHitCarryables(b) || this.BulletHitEagleStroll(b)) {
          hitSolid = true;
          break;
        }
      }
      b.traveled += dist;
      if (b.arm > 0) b.arm -= dt;

      b.trail.push({ x: b.x + 4, y: b.y + 4 });
      if (b.trail.length > 10) b.trail.shift();
      if (hitSolid) continue;

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

      // Armed bullets can hit any tank, including the shooter (gravity self-kill).
      const canSelfHit = b.arm <= 0 || b.traveled >= 36;

      // hit enemies
      for (const e of this.enemies) {
        if (!e.alive || e.spawnFlash > 0) continue;
        if (!canSelfHit && e === b.owner) continue;
        if (this.BlocksEnemyFriendlyFire(b, e)) continue;
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
          if (isOwnShell && this.HasPerk("noSelfHit")) {
            this.SpawnExplosion(b.x, b.y, 0.35);
            this.audio.Bounce();
          } else if (this.player.protect > 0) {
            this.SpawnExplosion(b.x, b.y, 0.5);
            this.audio.Bounce();
          } else if (this.TryAbsorbWithGiant()) {
            // giant form absorbed
          } else if ((this.absorbHits || 0) > 0 || (this.player.absorbHits || 0) > 0) {
            this.absorbHits = Math.max(0, (this.absorbHits || 0) - 1);
            this.player.absorbHits = this.absorbHits;
            this.player.protect = Math.max(this.player.protect, 1.0);
            this.SpawnExplosion(b.x, b.y, 0.55);
            this.ShowBuffToast(this.absorbHits > 0 ? `装甲抵挡！剩余 ${this.absorbHits}` : "装甲耗尽！");
            this.audio.Bounce();
          } else if (
            this.HasPerk("timeRift") &&
            this.timeRiftCd <= 0 &&
            this.playerEagleTimer <= 0 &&
            !this.player.asEagle
          ) {
            this.timeRiftCd = 12;
            this.freezeTimer = Math.max(this.freezeTimer, 2.5);
            this.player.protect = Math.max(this.player.protect, 1.4);
            this.SpawnExplosion(b.x, b.y, 0.6);
            this.ShowBuffToast("时间裂缝！敌军冻结");
            this.audio.Power();
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

  DamageCarryable(block, power = 1) {
    if (!block?.alive) return;
    const dmg = Math.max(1, power | 0);
    block.hp -= dmg;
    if (block.hp <= 0) {
      block.alive = false;
      block.carried = false;
      if (this.carriedBlock === block) this.carriedBlock = null;
      this.SpawnExplosion(block.x + block.w * 0.5, block.y + block.h * 0.5, 0.5);
      this.audio.Explode();
    } else {
      this.audio.Hit();
    }
  }

  BulletHitCarryables(b) {
    // Held shield: blocks enemy (and stray) shells in front of the player.
    if (this.carriedBlock?.alive && this.player?.alive) {
      const shield = this.CarryShieldRect(this.player);
      if (shield && RectsOverlap(b, shield)) {
        // Own outgoing shells ignore the shield briefly.
        if (b.isPlayer && b.owner === this.player && (b.arm > 0 || b.traveled < 28)) {
          return false;
        }
        this.DamageCarryable(this.carriedBlock, b.power || 1);
        b.alive = false;
        this.SpawnExplosion(b.x, b.y, 0.4);
        return true;
      }
    }

    for (const block of this.carryables) {
      if (!block.alive || block.carried) continue;
      if (!RectsOverlap(b, block)) continue;
      this.DamageCarryable(block, b.power || 1);
      b.alive = false;
      this.SpawnExplosion(b.x, b.y, 0.4);
      return true;
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

  /**
   * Classic Battle City: shot direction removes the near half of the 16×16 cell.
   * Second shot (or nestled against the remaining half) clears the rest.
   * Power ≥ 3 (gun / 3★) clears the whole cell in one hit.
   */
  DestroyBrickHalf(tx, ty, bullet, power = 1) {
    if (!this.brickMask?.[ty]) return;
    if (this.map[ty][tx] !== TILE_BRICK) return;
    let mask = this.brickMask[ty][tx] || BRICK_FULL;
    if ((power | 0) >= 3) {
      mask = 0;
    } else {
      const face = bullet.face || DirFromVector(bullet.vx, bullet.vy);
      let clear = BrickHalfMaskFromDir(face);
      // Diagonal / curved shells: fall back to dominant velocity axis.
      if (face !== "up" && face !== "down" && face !== "left" && face !== "right") {
        clear = BrickHalfMaskFromVelocity(bullet.vx, bullet.vy);
      }
      // Entry half already gone (sitting in the hollow) → shave whatever solid remains.
      if ((mask & clear) === 0) clear = mask;
      mask &= ~clear;
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
    // Classic: flashing (dropsPower) tanks drop on the hit that strips the flash,
    // including multi-hit armor tanks that stay alive after the drop.
    if (e.dropsPower) {
      this.DropPowerup(e.x, e.y);
      e.dropsPower = false;
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
      this.RenderEnemyIcons();
    }
  }

  KillPlayer() {
    const p = this.player;
    if (!p?.alive) return;
    if (this.debugGodMode) {
      p.protect = Math.max(p.protect, 2);
      this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 0.45);
      this.audio.Bounce();
      return;
    }
    this.ClearGiantForm(false);
    this.DropCarriedBlock(true);
    // Ultimate eagle curse: dying as the eagle fails the stage regardless of lives.
    if (this.playerEagleTimer > 0 || p.asEagle || this.eagleMorph || p.eagleMorphing) {
      p.alive = false;
      this.audio.StopEngine();
      this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 1.6);
      this.audio.Explode();
      this.playerEagleTimer = 0;
      this.ClearEagleForm(false);
      this.respawnTimer = 0;
      this.EndGame(false, "老鹰形态被击破！不论剩余生命，本关失败。");
      return;
    }
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

  /** Stage-6 lasts longer than stage-3; easy mode slightly shorter. */
  GetEagleCurseDuration() {
    const stage6 = this.stage === 6 || this.stageData?.bossKind === "boss";
    const base = stage6 ? EAGLE_CURSE_DURATION_STAGE6 : EAGLE_CURSE_DURATION_STAGE3;
    return this.IsEasy() ? base * 0.85 : base;
  }

  GetEagleCurseShield() {
    const stage6 = this.stage === 6 || this.stageData?.bossKind === "boss";
    const base = stage6 ? EAGLE_CURSE_SHIELD_STAGE6 : EAGLE_CURSE_SHIELD_STAGE3;
    return this.IsEasy() ? base * 1.15 : base;
  }

  ApplyEagleCurse() {
    const p = this.player;
    if (!p?.alive) return;
    if (this.eagleMorph || p.asEagle) return;
    this.ClearGiantForm(true);
    const duration = this.GetEagleCurseDuration();
    const shield = this.GetEagleCurseShield();
    const { toX, toY } = this.GetEagleMorphTarget(p);
    // Morph telegraph first — eagle timer starts when the animation finishes.
    this.eagleMorph = {
      t: 0,
      dur: EAGLE_MORPH_DUR,
      fromX: p.x,
      fromY: p.y,
      toX,
      toY,
      duration,
      shield,
    };
    p.asEagle = false;
    p.eagleMorphing = true;
    // Protect through the whole transform + opening shield after.
    p.protect = Math.max(p.protect, EAGLE_MORPH_DUR + shield);
    this.eagleWarnT = Math.max(this.eagleWarnT, EAGLE_MORPH_DUR + 1.4);
    this.ShowBuffToast("终极诅咒变身中… 看清提示再躲！");
    this.audio.Hit();
  }

  UpdateEagleMorph(dt) {
    const morph = this.eagleMorph;
    const p = this.player;
    if (!morph || !p?.alive) {
      this.eagleMorph = null;
      if (p) p.eagleMorphing = false;
      return;
    }
    morph.t += dt;
    const u = Clamp(morph.t / morph.dur, 0, 1);
    // Ease-in-out glide to HQ while transforming.
    const ease = u * u * (3 - 2 * u);
    p.x = morph.fromX + (morph.toX - morph.fromX) * ease;
    p.y = morph.fromY + (morph.toY - morph.fromY) * ease;
    p.protect = Math.max(p.protect, 0.2);

    if (u >= 1) {
      p.x = morph.toX;
      p.y = morph.toY;
      this.UnstickTank(p);
      p.eagleMorphing = false;
      p.asEagle = true;
      p.speed = PLAYER_SPEED * 0.55;
      this.playerEagleTimer = Math.max(this.playerEagleTimer, morph.duration);
      p.protect = Math.max(p.protect, morph.shield);
      this.eagleMorph = null;
      this.eagleWarnT = Math.max(this.eagleWarnT, 2.8);
      this.ShowBuffToast(`老鹰形态 ${Math.ceil(morph.duration)}s · 护盾 ${Math.ceil(morph.shield)}s · 护盾后被打倒即失败`);
      this.audio.Explode();
    }
  }

  ClearEagleForm(restoreTank = true) {
    const p = this.player;
    if (!p) {
      this.playerEagleTimer = 0;
      this.eagleMorph = null;
      return;
    }
    p.asEagle = false;
    p.eagleMorphing = false;
    p.speed = PLAYER_SPEED;
    this.eagleMorph = null;
    if (restoreTank && p.alive) {
      p.protect = Math.max(p.protect, 1.2);
    }
  }

  DestroyBase() {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    this.eagleStroll = null;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === TILE_BASE) this.map[y][x] = TILE_BASE_DEAD;
      }
    }
    const hq = this.GetBaseTarget();
    this.SpawnExplosion(hq.x + hq.w / 2, hq.y + hq.h / 2, 1.4);
    this.audio.Lose();
    this.EndGame(false, "总部被毁。战役失败。");
  }

  /** Top-left tile of the 2×2 eagle base (live or ruined). */
  FindBaseCell() {
    if (this.eagleStroll?.home) {
      return { x: this.eagleStroll.home.x, y: this.eagleStroll.home.y };
    }
    if (this._baseCell) {
      const { x, y } = this._baseCell;
      const t = this.map?.[y]?.[x];
      if (t === TILE_BASE || t === TILE_BASE_DEAD) return this._baseCell;
    }
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.map[y][x];
        if (t === TILE_BASE || t === TILE_BASE_DEAD) {
          this._baseCell = { x, y };
          return this._baseCell;
        }
      }
    }
    this._baseCell = { x: 12, y: 24 };
    return this._baseCell;
  }

  IsBaseAtTop() {
    return this.FindBaseCell().y < MAP_H / 2;
  }

  GetBaseTarget() {
    if (this.eagleStroll && this.baseAlive) {
      const e = this.eagleStroll;
      return { x: e.x, y: e.y, w: e.w, h: e.h };
    }
    const c = this.FindBaseCell();
    return { x: c.x * TILE, y: c.y * TILE, w: TILE * 2, h: TILE * 2 };
  }

  /** Fort ring open toward the battlefield (below top HQ / above bottom HQ). */
  GetBaseFortCells() {
    const { x: bx, y: by } = this.FindBaseCell();
    if (by < MAP_H / 2) {
      return [
        [bx - 1, by], [bx + 2, by],
        [bx - 1, by + 1], [bx + 2, by + 1],
        [bx - 1, by + 2], [bx, by + 2], [bx + 1, by + 2], [bx + 2, by + 2],
      ];
    }
    return [
      [bx - 1, by - 1], [bx, by - 1], [bx + 1, by - 1], [bx + 2, by - 1],
      [bx - 1, by], [bx + 2, by],
      [bx - 1, by + 1], [bx + 2, by + 1],
    ];
  }

  GetEagleMorphTarget(p) {
    const c = this.FindBaseCell();
    const toX = Clamp(c.x * TILE, 0, CANVAS_W - p.w);
    if (c.y < MAP_H / 2) {
      return {
        toX,
        toY: Clamp((c.y + 2) * TILE, 2, Math.min(CANVAS_H * 0.45, CANVAS_H - p.h - 2)),
      };
    }
    return {
      toX,
      toY: Clamp((c.y - 1) * TILE, CANVAS_H * 0.55, CANVAS_H - p.h - 2),
    };
  }

  /** Negative: eagle kicks the fort open and waddles around the field. */
  StartEagleStroll(duration = 18) {
    if (!this.baseAlive) return;
    if (this.eagleStroll) {
      this.eagleStroll.ttl = Math.max(this.eagleStroll.ttl, duration);
      this.BreakBaseFort();
      this.ShowBuffToast("⚠ 老鹰还在遛弯…门又开了");
      return;
    }
    const cell = this.FindBaseCell();
    const nest = [];
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
        if (this.map[y][x] === TILE_BASE) {
          this.map[y][x] = TILE_EMPTY;
          nest.push([x, y]);
        }
      }
    }
    this._baseCell = { x: cell.x, y: cell.y };
    this.BreakBaseFort();
    const top = cell.y < MAP_H / 2;
    this.eagleStroll = {
      x: cell.x * TILE,
      y: cell.y * TILE,
      w: TILE * 2,
      h: TILE * 2,
      dir: top ? "down" : "up",
      speed: 42,
      aiTimer: 0.15,
      ttl: duration,
      home: { x: cell.x, y: cell.y },
      nest,
      bob: 0,
    };
    // Nudge out of the nest so the stroll is obvious.
    const face = DIR[this.eagleStroll.dir];
    this.eagleStroll.x = Clamp(this.eagleStroll.x + face.x * TILE * 1.2, 0, CANVAS_W - this.eagleStroll.w);
    this.eagleStroll.y = Clamp(this.eagleStroll.y + face.y * TILE * 1.2, 0, CANVAS_H - this.eagleStroll.h);
    this.ShowBuffToast("⚠ 老鹰自己开门遛去了！护住它！");
    this.eagleWarnT = Math.max(this.eagleWarnT, 2.4);
  }

  UpdateEagleStroll(dt) {
    const e = this.eagleStroll;
    if (!e) return;
    if (!this.baseAlive) {
      this.eagleStroll = null;
      return;
    }
    e.ttl -= dt;
    e.bob += dt * 8;
    if (e.ttl <= 0) {
      this.ReturnEagleHome();
      return;
    }
    e.aiTimer -= dt;
    if (e.aiTimer <= 0) {
      e.aiTimer = 0.55 + Math.random() * 1.1;
      // Mostly wander; sometimes head farther from the empty nest.
      if (Math.random() < 0.35) {
        const hx = e.home.x * TILE + TILE;
        const hy = e.home.y * TILE + TILE;
        e.dir = DirFromVector(e.x + e.w * 0.5 - hx, e.y + e.h * 0.5 - hy);
      } else {
        e.dir = DIR_KEYS[Math.floor(Math.random() * 4)];
      }
    }
    const d = DIR[e.dir] || DIR.down;
    const beforeX = e.x;
    const beforeY = e.y;
    e.x += d.x * e.speed * dt;
    e.y += d.y * e.speed * dt;
    e.x = Clamp(e.x, 0, CANVAS_W - e.w);
    e.y = Clamp(e.y, 0, CANVAS_H - e.h);
    if (this.EagleStrollBlocked(e)) {
      e.x = beforeX;
      e.y = beforeY;
      e.aiTimer = 0;
    }
  }

  EagleStrollBlocked(e) {
    const box = { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 4 };
    const x0 = Math.floor(box.x / TILE);
    const y0 = Math.floor(box.y / TILE);
    const x1 = Math.floor((box.x + box.w - 0.001) / TILE);
    const y1 = Math.floor((box.y + box.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
        const t = this.map[ty][tx];
        if (t === TILE_STEEL || t === TILE_WATER || t === TILE_BASE || t === TILE_BASE_DEAD) return true;
        if (t === TILE_BRICK && this.BrickRectHitsSolid(box, tx, ty)) return true;
      }
    }
    return false;
  }

  ReturnEagleHome() {
    const e = this.eagleStroll;
    if (!e) return;
    if (this.baseAlive) {
      for (const [x, y] of e.nest || []) {
        if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
        this.map[y][x] = TILE_BASE;
      }
      this._baseCell = { x: e.home.x, y: e.home.y };
      this.pendingFortRestore = true;
      this.ShowBuffToast("老鹰遛完回家了");
    }
    this.eagleStroll = null;
  }

  BulletHitEagleStroll(b) {
    if (!this.eagleStroll || !this.baseAlive) return false;
    if (!RectsOverlap(b, this.eagleStroll)) return false;
    b.alive = false;
    this.SpawnExplosion(b.x, b.y, 0.55);
    this.DestroyBase();
    return true;
  }

  DropPowerup(x, y, kind = POWER.token) {
    this.powerups.push({
      x: Clamp(x, 8, CANVAS_W - 32),
      y: Clamp(y, 8, CANVAS_H - 32),
      kind,
      alive: true,
      ttl: kind === POWER.gunBarrel ? 28 : 14,
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
    const segments = PickRouletteSegments(ROULETTE_SIZE, this.difficulty, {
      allowGiant: this.IsGiantPowerUnlocked(),
    });
    const touch = this.isTouchDevice;
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
      cy: CANVAS_H / 2 + (touch ? 40 : 28),
      radius: touch ? 158 : 128,
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
      case POWER.plates:
        this.GrantAbsorbHits(2);
        this.ShowBuffToast(`装甲 +2（现有 ${this.absorbHits} 层）`);
        break;
      case POWER.bastion:
        this.GrantAbsorbHits(4);
        if (p) p.protect = Math.max(p.protect, 6);
        this.ShowBuffToast(`壁垒装甲 +4（现有 ${this.absorbHits} 层）`);
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
          this.UnstickTank(p, { maxDist: 48 });
          p.protect = Math.max(p.protect, 4);
        }
        this.ShowBuffToast("幽灵穿墙（砖/钢）16 秒");
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
        this.GrantAbsorbHits(2);
        this.ghostTimer = 22;
        this.bounceTimer = 22;
        this.magnetTimer = 22;
        this.antigravTimer = 12;
        this.overdriveTimer = Math.max(this.overdriveTimer, 12);
        this.ShowBuffToast("霸体：几乎无敌的 22 秒 + 装甲！");
        break;
      case POWER.giant:
        this.StartGiantForm(GIANT_DURATION);
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
      case POWER.eagleStroll:
        this.StartEagleStroll(18);
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
    const cells = this.GetBaseFortCells();
    for (const [x, y] of cells) {
      if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
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
    const enemy = this.MakeEnemyFromType(type, slot.x + 2, slot.y + 2);
    enemy.fireCd = 0.4;
    enemy.aiTimer = 0.2;
    enemy.spawnFlash = 0.35;
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
    const cells = this.GetBaseFortCells();
    for (const [x, y] of cells) {
      if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
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
    const cells = this.GetBaseFortCells();
    let blocked = false;
    for (const [x, y] of cells) {
      if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
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
    if (aliveCount >= this.GetMaxEnemiesOnField()) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 2.2;

    const slot = this.spawnSlots[this.nextSpawnSlot % this.spawnSlots.length];
    this.nextSpawnSlot++;
    const type = this.spawnQueue.shift();
    const size = type.size || TANK_SIZE;

    // ensure slot free
    const probe = { x: slot.x + 2, y: slot.y + 2, w: size, h: size };
    if (this.CollidesTanks(probe) || (this.player?.alive && RectsOverlap(probe, this.player))) {
      this.spawnQueue.unshift(type);
      this.spawnTimer = 0.6;
      return;
    }

    this.enemies.push(this.MakeEnemyFromType(type, slot.x + 2, slot.y + 2));
    this.RenderEnemyIcons();
  }

  MakeEnemyFromType(type, x, y) {
    const size = type.size || TANK_SIZE;
    const hpMul = type.boss ? (this.stageData?.bossHpMul || 1) : 1;
    const hp = Math.max(1, Math.round(type.hp * hpMul));
    return {
      x,
      y,
      w: size,
      h: size,
      dir: this.IsBaseAtTop() ? "up" : "down",
      speed: type.speed,
      hp,
      maxHp: hp,
      score: type.score,
      shootCd: type.shootCd,
      bulletBoost: type.bulletBoost || 1,
      typeId: type.id,
      texture: type.texture,
      alive: true,
      fireCd: type.boss ? 1.6 * this.GetBossFireCdScale({ fireIntervalMul: type.fireIntervalMul ?? 1 }) : 0.8,
      aiTimer: 0.3,
      spawnFlash: type.boss ? 0.6 : 1.0,
      protect: type.boss ? 1.2 : 0,
      dropsPower: type.boss ? false : (type.id === "armor" || Math.random() < this.GetPowerDropRate()),
      deathTimer: 0,
      animTick: 0,
      moving: false,
      attackQueue: null,
      attackPattern: null,
      attackAge: 0,
      castFace: "down",
      isBoss: !!type.boss,
      tankKing: !!type.tankKing,
      tankMan: !!type.tankMan,
      fireIntervalMul: type.fireIntervalMul ?? 1,
      eagleCurseUsed: false,
      finalPhase: false,
      barrelCount: type.barrelCount ?? this.stageData?.barrelCount ?? (type.tankKing ? 4 : 0),
      barrelFlash: Object.fromEntries(DIR_OCTO.map((d) => [d, 0])),
    };
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
      if (this.isTutorial) {
        this.EndGame(true, "河对岸肃清！选一张入门升级，带进第一关。", "next");
      } else if (this.isBarricadeTeach) {
        this.EndGame(true, "路障学会了！接下来用它封死敌窝出口。", "next");
      } else if (this.isBossStage) {
        const title = this.stageData.title || "Boss";
        this.EndGame(true, `${title}击破！得分 ${this.score}`, "next");
      } else if (this.stage < STAGE_COUNT) {
        this.EndGame(true, `第 ${this.stage} 关肃清！得分 ${this.score}`, "next");
      } else {
        this.EndGame(true, `${STAGE_COUNT} 关全通！最终得分 ${this.score}`, "restart");
      }
    }
  }

  EndGame(won, message, action = "restart") {
    this.state = won ? "won" : "lost";
    this.endAction = won ? action : "retry";
    if (this.overlays.upgrade) this.overlays.upgrade.hidden = true;
    this.upgradePick = null;
    this.overlays.end.hidden = false;
    this.overlays.endTitle.textContent = won
      ? (this.isTutorial
        ? "引导通过"
        : this.isBarricadeTeach
          ? "教学完成"
          : this.isBossStage
            ? "Boss 击破"
            : (this.stage >= STAGE_COUNT && action === "restart" ? "战役胜利" : "关卡通过"))
      : "游戏结束";
    this.overlays.endMessage.textContent = message;
    if (this.overlays.endPrimary) {
      this.overlays.endPrimary.textContent = won
        ? (action === "next"
          ? (this.isTutorial ? "选择升级" : (this.isBossStage ? "选择永久能力" : "选择升级"))
          : "再来一局")
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
    const stage = this.isTutorial ? "T" : (this.isBarricadeTeach ? "教" : String(this.stage));
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
    this._baseCell = null;
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
    for (const block of this.carryables) {
      if (block.alive && !block.carried) this.DrawCarryable(ctx, block);
    }

    for (const pu of this.powerups) this.DrawPowerup(ctx, pu);
    for (const bomb of this.bombs || []) if (bomb.alive) this.DrawTimedBomb(ctx, bomb);
    for (const e of this.enemies) if (e.alive) this.DrawTank(ctx, e, false);
    if (this.player?.alive) {
      this.DrawTank(ctx, this.player, true);
      if (this.carriedBlock?.alive) this.DrawCarriedShield(ctx, this.player, this.carriedBlock);
    }
    for (const b of this.bullets) this.DrawBullet(ctx, b);
    this.DrawTiles(ctx, true); // grass on top
    for (const ex of this.explosions) this.DrawExplosion(ctx, ex);

    // gravity hint arc when aiming sideways/up (playing only)
    if (this.state === "playing" && this.player?.alive) this.DrawAimGhost(ctx);
    this.DrawBuffHud(ctx);
    if (this.state === "playing" && this.isTutorial) this.DrawTutorialHint(ctx);
    if (this.state === "playing" && this.isBarricadeTeach) this.DrawBarricadeTeachHint(ctx);
    if (this.state === "roulette") this.DrawRoulette(ctx);
  }

  DrawTutorialHint(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(28, CANVAS_H - 36, CANVAS_W - 56, 28);
    ctx.strokeStyle = "#f0d060";
    ctx.lineWidth = 2;
    ctx.strokeRect(28, CANVAS_H - 36, CANVAS_W - 56, 28);
    ctx.fillStyle = "#ffe08a";
    ctx.font = `11px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("↓ 朝下/斜射 · 重力越过河清理敌军", CANVAS_W / 2, CANVAS_H - 22);
    ctx.restore();
  }

  DrawBarricadeTeachHint(ctx) {
    const holding = !!this.carriedBlock;
    const line = holding
      ? "护盾已举起 · 再按 K /「扛」放下封路"
      : "靠近木/铁板 · 按 K /「扛」举起（同键=护盾/放下）";
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(18, CANVAS_H - 36, CANVAS_W - 36, 28);
    ctx.strokeStyle = "#80e0ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(18, CANVAS_H - 36, CANVAS_W - 36, 28);
    ctx.fillStyle = "#b8f0ff";
    ctx.font = `10px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(line, CANVAS_W / 2, CANVAS_H - 22);
    ctx.restore();
  }

  DrawCarryable(ctx, block) {
    const img = block.kind === "metal" ? this.images.barricadeMetal : this.images.barricadeWood;
    if (img) {
      ctx.drawImage(img, 0, 0, img.width, img.height, block.x, block.y, block.w, block.h);
    } else {
      ctx.fillStyle = block.kind === "metal" ? "#8a9aa8" : "#8a5a28";
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.strokeStyle = "#201008";
      ctx.strokeRect(block.x + 0.5, block.y + 0.5, block.w - 1, block.h - 1);
    }
    if (block.hp < block.maxHp) {
      const ratio = Clamp(block.hp / block.maxHp, 0, 1);
      ctx.fillStyle = "#000";
      ctx.fillRect(block.x + 2, block.y - 4, block.w - 4, 3);
      ctx.fillStyle = block.kind === "metal" ? "#c0d0e0" : "#d0a060";
      ctx.fillRect(block.x + 2, block.y - 4, (block.w - 4) * ratio, 3);
    }
  }

  DrawCarriedShield(ctx, tank, block) {
    const rect = this.CarryShieldRect(tank);
    if (!rect) return;
    const img = block.kind === "metal" ? this.images.barricadeMetal : this.images.barricadeWood;
    ctx.save();
    ctx.globalAlpha = 0.95;
    if (img) {
      ctx.drawImage(img, 0, 0, img.width, img.height, rect.x, rect.y, rect.w, rect.h);
    } else {
      ctx.fillStyle = block.kind === "metal" ? "#9ab0c0" : "#a06830";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.strokeStyle = "rgba(255,224,120,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.restore();
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
      if (this.isTutorial) {
        ctx.font = `28px ${PIXEL_FONT}`;
        ctx.fillText("TUTORIAL", CANVAS_W / 2, CANVAS_H / 2 - 36);
        const blink = intro.phase === "hold" && Math.floor(intro.t * 6) % 8 === 0 ? 0.55 : 1;
        ctx.globalAlpha = fade * blink;
        ctx.font = `42px ${PIXEL_FONT}`;
        ctx.fillText("新手", CANVAS_W / 2, CANVAS_H / 2 + 18);
        ctx.globalAlpha = fade * 0.95;
        ctx.font = `13px ${PIXEL_FONT}`;
        ctx.fillText("向上射击的炮弹会落回打自己", CANVAS_W / 2, CANVAS_H / 2 + 62);
      } else if (this.isBarricadeTeach) {
        ctx.font = `28px ${PIXEL_FONT}`;
        ctx.fillText("TEACH", CANVAS_W / 2, CANVAS_H / 2 - 36);
        const blink = intro.phase === "hold" && Math.floor(intro.t * 6) % 8 === 0 ? 0.55 : 1;
        ctx.globalAlpha = fade * blink;
        ctx.font = `36px ${PIXEL_FONT}`;
        ctx.fillText("路障教学", CANVAS_W / 2, CANVAS_H / 2 + 18);
        ctx.globalAlpha = fade * 0.95;
        ctx.font = `12px ${PIXEL_FONT}`;
        ctx.fillText("K /「扛」：举起护盾 · 再按放下封路", CANVAS_W / 2, CANVAS_H / 2 + 58);
      } else if (this.isBossStage) {
        const kind = this.stageData.bossKind;
        const bossTitle =
          kind === "tankKing" ? "坦克王" :
          kind === "tankMan" ? "腿甲坦克人" :
          "重力巨炮";
        const bossHint =
          kind === "tankKing" ? "单炮追猎 · 开阔战场" :
          kind === "tankMan" ? "拆炮 · 炸弹 · 弹射狙击" :
          "八管弹幕 · 炮弹带重力";
        ctx.font = `28px ${PIXEL_FONT}`;
        ctx.fillText("BOSS", CANVAS_W / 2, CANVAS_H / 2 - 36);
        const blink = intro.phase === "hold" && Math.floor(intro.t * 6) % 8 === 0 ? 0.55 : 1;
        ctx.globalAlpha = fade * blink;
        ctx.font = `36px ${PIXEL_FONT}`;
        ctx.fillText(bossTitle, CANVAS_W / 2, CANVAS_H / 2 + 18);
        ctx.globalAlpha = fade * 0.95;
        ctx.font = `12px ${PIXEL_FONT}`;
        ctx.fillText(bossHint, CANVAS_W / 2, CANVAS_H / 2 + 58);
      } else {
        ctx.font = `36px ${PIXEL_FONT}`;
        ctx.fillText("STAGE", CANVAS_W / 2, CANVAS_H / 2 - 28);

        // Big stage number with a slight blink on hold
        const blink = intro.phase === "hold" && Math.floor(intro.t * 6) % 8 === 0 ? 0.55 : 1;
        ctx.globalAlpha = fade * blink;
        ctx.font = `64px ${PIXEL_FONT}`;
        ctx.fillText(String(this.stage), CANVAS_W / 2, CANVAS_H / 2 + 28);

        ctx.globalAlpha = fade * 0.9;
        ctx.font = `16px ${PIXEL_FONT}`;
        const title = this.stageData?.title ? ` · ${this.stageData.title}` : "";
        ctx.fillText(`第 ${this.stage} 关 / 共 ${STAGE_COUNT} 关${title}`, CANVAS_W / 2, CANVAS_H / 2 + 72);
      }

      if (intro.phase === "hold") {
        ctx.globalAlpha = fade * (0.35 + 0.35 * Math.sin(intro.t * 4));
        ctx.font = `12px ${PIXEL_FONT}`;
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
    // Always the same 16×16 brick art — clip away destroyed halves.
    const blitFull = () => this.BlitGrid(ctx, gx, gy, px, py, TILE, TILE, 1, 1);
    if (mask === BRICK_FULL) {
      blitFull();
      return;
    }
    const parts = [
      [BRICK_TL, px, py, 8, 8],
      [BRICK_TR, px + 8, py, 8, 8],
      [BRICK_BL, px, py + 8, 8, 8],
      [BRICK_BR, px + 8, py + 8, 8, 8],
    ];
    for (const [bit, x, y, w, h] of parts) {
      if (!(mask & bit)) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      blitFull();
      ctx.restore();
    }
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
    const cell = this.FindBaseCell();
    const nestX = cell.x * TILE;
    const nestY = cell.y * TILE;

    if (this.eagleStroll && this.baseAlive) {
      // Empty nest pad — eagle walked out.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#402010";
      ctx.fillRect(nestX + 4, nestY + 4, TILE * 2 - 8, TILE * 2 - 8);
      ctx.strokeStyle = "#806040";
      ctx.strokeRect(nestX + 4.5, nestY + 4.5, TILE * 2 - 9, TILE * 2 - 9);
      ctx.restore();

      const e = this.eagleStroll;
      const bob = Math.sin(e.bob) * 1.5;
      const [gx, gy] = TILE_SHEET.baseAlive;
      this.BlitGrid(ctx, gx, gy, e.x, e.y + bob, e.w, e.h, 2, 2);
      // Danger ring so it's obvious the HQ is mobile.
      const pulse = 0.4 + 0.35 * Math.abs(Math.sin(this.frame * 0.2));
      ctx.strokeStyle = `rgba(255,80,80,${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x + 1, e.y + bob + 1, e.w - 2, e.h - 2);
      return;
    }

    const bx = nestX;
    const by = nestY;
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
    // Power-up carriers flash red (classic).
    if (tank.dropsPower && Math.floor(this.frame / 8) % 2 === 0) row = spec.redRow;
    return { gx: spec.col + dirCol + colOff, gy: row, redFlash: row === spec.redRow };
  }

  /** Remap gray enemy armor sprite into classic HP color stages. */
  BlitArmorTinted(ctx, gx, gy, dx, dy, dw, dh, hp) {
    const sheet = this.images.sheet;
    if (!sheet) return;
    const sw = 2 * SHEET_CELL;
    const sh = 2 * SHEET_CELL;
    if (!this._tintCanvas) {
      this._tintCanvas = document.createElement("canvas");
      this._tintCtx = this._tintCanvas.getContext("2d", { willReadFrequently: true });
    }
    const tc = this._tintCanvas;
    const tctx = this._tintCtx;
    if (tc.width !== sw || tc.height !== sh) {
      tc.width = sw;
      tc.height = sh;
    }
    tctx.clearRect(0, 0, sw, sh);
    tctx.drawImage(sheet, gx * SHEET_CELL, gy * SHEET_CELL, sw, sh, 0, 0, sw, sh);
    const img = tctx.getImageData(0, 0, sw, sh);
    const data = img.data;
    const stage = Clamp(hp | 0, 1, 4);
    const pal = ARMOR_HP_PALETTE[stage] || ARMOR_HP_PALETTE[1];
    const flashOn = Math.floor(this.frame / 7) % 2 === 0;
    const mid = flashOn && stage > 1 ? (stage === 1 ? pal.mid : (stage === 4 || stage === 3 ? pal.flash : pal.flash)) : pal.mid;
    // HP4: green↔white; HP3: yellow↔white; HP2: green↔yellow; HP1: solid white/gray
    let useMid = pal.mid;
    let useDark = pal.dark;
    let useLight = pal.light;
    if (stage === 4) {
      useMid = flashOn ? pal.mid : pal.flash;
      useDark = flashOn ? pal.dark : [90, 90, 100];
      useLight = flashOn ? pal.light : [255, 255, 255];
    } else if (stage === 3) {
      useMid = flashOn ? pal.mid : pal.flash;
      useDark = flashOn ? pal.dark : [100, 100, 110];
    } else if (stage === 2) {
      useMid = flashOn ? pal.mid : pal.flash;
      useDark = flashOn ? pal.dark : [120, 90, 10];
      useLight = flashOn ? pal.light : [255, 240, 170];
    }
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 20) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Sheet mid gray ~173, dark teal ~0,66,74, white ~255
      if (r > 200 && g > 200 && b > 200) {
        data[i] = useLight[0];
        data[i + 1] = useLight[1];
        data[i + 2] = useLight[2];
      } else if (r > 140 && g > 140 && b > 140) {
        data[i] = useMid[0];
        data[i + 1] = useMid[1];
        data[i + 2] = useMid[2];
      } else if (r < 40 && g < 100) {
        data[i] = useDark[0];
        data[i + 1] = useDark[1];
        data[i + 2] = useDark[2];
      }
    }
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tc, 0, 0, sw, sh, dx, dy, dw, dh);
  }

  /** Tank ↔ eagle cross-fade + expanding rings while gliding to HQ. */
  DrawEagleMorph(ctx, tank) {
    const morph = this.eagleMorph;
    if (!morph) return;
    const u = Clamp(morph.t / Math.max(0.001, morph.dur), 0, 1);
    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    // Flash rate speeds up as transform completes.
    const flashHz = 4 + u * 10;
    const showEagle = Math.floor(morph.t * flashHz) % 2 === 1 || u > 0.72;

    // Expanding warning rings
    for (let i = 0; i < 3; i++) {
      const wave = (u * 2.2 + i * 0.28) % 1;
      const rad = 10 + wave * (28 + u * 36);
      ctx.strokeStyle = `rgba(255,${90 - i * 20},${60 - i * 15},${(1 - wave) * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    // White flash pulses
    if (Math.floor(morph.t * 12) % 3 === 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 + u * 0.18})`;
      ctx.fillRect(tank.x - 4, tank.y - 4, tank.w + 8, tank.h + 8);
    }

    if (showEagle) {
      const [gx, gy] = this.baseAlive ? TILE_SHEET.baseAlive : TILE_SHEET.baseDead;
      const scale = 0.85 + u * 0.2;
      const dw = tank.w * scale;
      const dh = tank.h * scale;
      ctx.globalAlpha = 0.55 + u * 0.45;
      this.BlitGrid(ctx, gx, gy, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.globalAlpha = 1;
    } else {
      const { gx, gy } = this.TankSheetOrigin(tank, true);
      ctx.globalAlpha = 1 - u * 0.35;
      this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);
      ctx.globalAlpha = 1;
    }

    // Shield during morph
    const [sx, sy] = FX_SHEET.shield[Math.floor(this.frame / 3) % 2];
    this.BlitGrid(ctx, sx, sy, tank.x - 5, tank.y - 5, tank.w + 10, tank.h + 10);
    ctx.strokeStyle = `rgba(180,240,255,${0.55 + 0.4 * Math.abs(Math.sin(this.frame * 0.4))})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(tank.x - 3, tank.y - 3, tank.w + 6, tank.h + 6);

    // Progress label above unit
    ctx.fillStyle = "#ffe060";
    ctx.font = `11px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("变身中", cx, tank.y - 14);
    ctx.fillStyle = "#80e0ff";
    ctx.font = `10px ${PIXEL_FONT}`;
    ctx.fillText(`${Math.ceil((1 - u) * morph.dur)}`, cx, tank.y - 2);
    ctx.textAlign = "left";
  }

  DrawTank(ctx, tank, isPlayer) {
    if (tank.spawnFlash > 0) {
      const frames = FX_SHEET.spawn;
      const idx = Math.min(frames.length - 1, Math.floor((1 - tank.spawnFlash) * frames.length));
      const [gx, gy] = frames[idx];
      this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);
      return;
    }

    // Eagle transform telegraph — flash tank ↔ eagle while gliding to HQ.
    if (isPlayer && this.eagleMorph) {
      this.DrawEagleMorph(ctx, tank);
      return;
    }

    // Boss ultimate: player is visually the HQ eagle.
    if (isPlayer && (this.playerEagleTimer > 0 || tank.asEagle)) {
      const [gx, gy] = this.baseAlive ? TILE_SHEET.baseAlive : TILE_SHEET.baseDead;
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.frame * 0.25));
      ctx.globalAlpha = pulse;
      this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,80,80,${0.5 + 0.5 * pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(tank.x - 1, tank.y - 1, tank.w + 2, tank.h + 2);
      // Opening curse shield — keep it loud so players notice the grace window.
      if (tank.protect > 0) {
        const [sx, sy] = FX_SHEET.shield[Math.floor(this.frame / 3) % 2];
        const pad = 5;
        this.BlitGrid(ctx, sx, sy, tank.x - pad, tank.y - pad, tank.w + pad * 2, tank.h + pad * 2);
        const ring = 0.55 + 0.45 * Math.abs(Math.sin(this.frame * 0.35));
        ctx.strokeStyle = `rgba(180,240,255,${ring})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(tank.x - 3, tank.y - 3, tank.w + 6, tank.h + 6);
        ctx.fillStyle = "rgba(180,240,255,0.85)";
        ctx.font = `10px ${PIXEL_FONT}`;
        ctx.textAlign = "center";
        ctx.fillText(`护盾 ${Math.ceil(tank.protect)}`, tank.x + tank.w / 2, tank.y - 8);
        ctx.textAlign = "left";
      }
      return;
    }

    if (!isPlayer && (tank.tankMan || tank.typeId === "tankMan")) {
      this.DrawTankMan(ctx, tank);
      if (tank.isBoss && tank.alive && tank.spawnFlash <= 0) this.DrawBossHud(ctx, tank);
      return;
    }

    const ghosting = isPlayer && this.ghostTimer > 0;
    if (ghosting) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(this.frame * 0.35);
    const { gx, gy, redFlash } = this.TankSheetOrigin(tank, isPlayer);
    const isArmor = !isPlayer && tank.typeId === "armor" && tank.maxHp > 1;
    if (isArmor && !redFlash) {
      this.BlitArmorTinted(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h, tank.hp);
    } else {
      this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);
    }
    if (isPlayer && this.giantTimer > 0) {
      const pulse = 0.45 + 0.35 * Math.abs(Math.sin(this.frame * 0.22));
      ctx.strokeStyle = `rgba(255,220,80,${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(tank.x - 2, tank.y - 2, tank.w + 4, tank.h + 4);
      ctx.fillStyle = "rgba(255,224,96,0.9)";
      ctx.font = `10px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(`巨${Math.ceil(this.giantTimer)}·甲${this.giantHits}`, tank.x + tank.w / 2, tank.y - 6);
      ctx.textAlign = "left";
    }
    if ((tank.isBoss || tank.tankKing) && (tank.barrelCount || 0) > 0) {
      this.DrawBossBarrels(ctx, tank);
    }
    if (ghosting) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(200,160,255,0.7)";
      ctx.strokeRect(tank.x + 1, tank.y + 1, tank.w - 2, tank.h - 2);
    }

    // Disarmed player: no turret silhouette + warning label.
    if (isPlayer && (this.playerDisarmed || tank.disarmed)) {
      ctx.fillStyle = "rgba(20,10,10,0.55)";
      ctx.fillRect(tank.x + 8, tank.y + 2, tank.w - 16, 10);
      ctx.strokeStyle = "#ff6060";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tank.x + 6, tank.y + 4);
      ctx.lineTo(tank.x + tank.w - 6, tank.y + 12);
      ctx.moveTo(tank.x + tank.w - 6, tank.y + 4);
      ctx.lineTo(tank.x + 6, tank.y + 12);
      ctx.stroke();
      ctx.fillStyle = "#ff8080";
      ctx.font = `9px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("无炮", tank.x + tank.w / 2, tank.y - 4);
      ctx.textAlign = "left";
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
    } else if (isPlayer && (this.absorbHits || 0) > 0) {
      const pulse = 0.4 + 0.3 * Math.abs(Math.sin(this.frame * 0.22));
      ctx.strokeStyle = `rgba(180,210,255,${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(tank.x - 2, tank.y - 2, tank.w + 4, tank.h + 4);
      ctx.fillStyle = `rgba(200,220,255,${0.55 + pulse * 0.3})`;
      ctx.font = `9px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(`甲${this.absorbHits}`, tank.x + tank.w / 2, tank.y - 3);
      ctx.textAlign = "left";
    }

    if (tank.isBoss && tank.alive && tank.spawnFlash <= 0) {
      this.DrawBossHud(ctx, tank);
    }
  }

  /** Bipedal stage-9 boss: torso + swinging legs + shoulder sniper. */
  DrawTankMan(ctx, tank) {
    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    const stride = tank.moving ? Math.sin(tank.animTick * 0.9) : 0;
    const legSpread = 7 + Math.abs(stride) * 4;
    const legKick = stride * 5;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(tank.x + 8, tank.y + tank.h - 6, tank.w - 16, 5);

    // Legs
    ctx.fillStyle = "#3a3020";
    ctx.fillRect(cx - legSpread - 5, cy + 8, 10, 22 + legKick);
    ctx.fillRect(cx + legSpread - 5, cy + 8, 10, 22 - legKick);
    ctx.fillStyle = "#c0a040";
    ctx.fillRect(cx - legSpread - 6, cy + 26 + legKick, 12, 6);
    ctx.fillRect(cx + legSpread - 6, cy + 26 - legKick, 12, 6);

    // Torso (armor sheet blit scaled)
    const { gx, gy } = this.TankSheetOrigin(tank, false);
    this.BlitGrid(ctx, gx, gy, tank.x + 6, tank.y + 2, tank.w - 12, tank.h - 18);

    // Head dome
    ctx.fillStyle = "#d0b050";
    ctx.beginPath();
    ctx.arc(cx, tank.y + 12, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#201808";
    ctx.fillRect(cx - 6, tank.y + 8, 5, 4);
    ctx.fillRect(cx + 2, tank.y + 8, 5, 4);

    // Shoulder sniper / arm cannon
    this.DrawBossBarrels(ctx, tank);

    // Hip pistons
    ctx.strokeStyle = "#806020";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 6);
    ctx.lineTo(cx - legSpread, cy + 14);
    ctx.moveTo(cx + 10, cy + 6);
    ctx.lineTo(cx + legSpread, cy + 14);
    ctx.stroke();

    if (tank.protect > 0) {
      const pulse = 0.45 + 0.35 * Math.abs(Math.sin(this.frame * 0.28));
      ctx.strokeStyle = `rgba(200,240,255,${pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(tank.x - 1, tank.y - 1, tank.w + 2, tank.h + 2);
    }
  }

  DrawTimedBomb(ctx, bomb) {
    const urgent = bomb.fuse < 0.85;
    const flash = urgent && Math.floor(bomb.blink * 10) % 2 === 0;
    const s = 18;
    ctx.fillStyle = flash ? "#ffe060" : "#281010";
    ctx.fillRect(bomb.x, bomb.y, s, s);
    ctx.strokeStyle = flash ? "#fff" : "#ff4040";
    ctx.lineWidth = 2;
    ctx.strokeRect(bomb.x, bomb.y, s, s);
    ctx.fillStyle = flash ? "#201000" : "#ff6060";
    ctx.font = `10px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.max(1, Math.ceil(bomb.fuse))), bomb.x + s / 2, bomb.y + s / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // Fuse spark
    ctx.fillStyle = "#ffe080";
    ctx.fillRect(bomb.x + s / 2 - 1, bomb.y - 4, 2, 5);
  }

  /** Distinct boss barrels (not classic sheet turrets): tapered tubes + muzzle ring. */
  DrawBossBarrels(ctx, tank) {
    const count = tank.barrelCount || 0;
    if (count <= 0) return;
    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    const flash = tank.barrelFlash || {};
    const king = !!tank.tankKing;
    const man = !!tank.tankMan || tank.typeId === "tankMan";
    const face = tank.castFace || tank.dir || "down";
    const dirs = count <= 1 ? [face] : count >= 8 ? DIR_OCTO : DIR_CARDINAL;
    const reach = Math.max(12, tank.w * (count <= 1 ? 0.42 : 0.34));
    const thick = Math.max(4, tank.w * (count <= 1 ? 0.18 : 0.11));

    for (const dir of dirs) {
      const d = DIR[dir] || DIR.down;
      const lit = (flash[dir] || 0) > 0;
      const ang = d.angle;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      // Base socket
      ctx.fillStyle = king || man ? "#5a4010" : "#2a3038";
      ctx.fillRect(tank.w * 0.18, -thick * 0.55, 5, thick * 1.1);
      // Tapered tube
      const x0 = tank.w * 0.2;
      const len = reach;
      ctx.beginPath();
      ctx.moveTo(x0, -thick * 0.45);
      ctx.lineTo(x0 + len * 0.72, -thick * 0.32);
      ctx.lineTo(x0 + len, -thick * 0.22);
      ctx.lineTo(x0 + len, thick * 0.22);
      ctx.lineTo(x0 + len * 0.72, thick * 0.32);
      ctx.lineTo(x0, thick * 0.45);
      ctx.closePath();
      ctx.fillStyle = lit ? "#ffe070" : man ? "#70d0ff" : king ? "#d0a030" : "#8a93a0";
      ctx.fill();
      ctx.strokeStyle = lit ? "#fff8c8" : man ? "#206080" : king ? "#705010" : "#3a4048";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Highlight stripe
      ctx.strokeStyle = lit ? "rgba(255,255,220,0.9)" : "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(x0 + 2, -thick * 0.12);
      ctx.lineTo(x0 + len - 2, -thick * 0.08);
      ctx.stroke();
      // Muzzle ring (distinct from classic stub barrel)
      ctx.fillStyle = lit ? "#fff0a0" : man ? "#a0e8ff" : king ? "#f0c050" : "#c8d0d8";
      ctx.fillRect(x0 + len - 3, -thick * 0.38, 4, thick * 0.76);
      ctx.fillStyle = "#101418";
      ctx.fillRect(x0 + len + 1, -thick * 0.16, 2, thick * 0.32);
      ctx.restore();
    }

    if (king) {
      // Small crown plate — reads as Tank King, not stock armor tank.
      ctx.fillStyle = "#f0d060";
      ctx.fillRect(cx - 7, tank.y + 3, 14, 4);
      ctx.fillRect(cx - 8, tank.y + 1, 4, 4);
      ctx.fillRect(cx - 2, tank.y, 4, 5);
      ctx.fillRect(cx + 4, tank.y + 1, 4, 4);
    } else if (man) {
      // Visor stripe — bipedal tank man.
      ctx.fillStyle = "#70d0ff";
      ctx.fillRect(cx - 10, tank.y + 8, 20, 3);
    } else if (count >= 8) {
      // Gravity cannon hub ring
      ctx.strokeStyle = "#c07040";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, tank.w * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#402010";
      ctx.beginPath();
      ctx.arc(cx, cy, tank.w * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  DrawBossHud(ctx, boss) {
    const barW = 120;
    const barH = 8;
    const x = (CANVAS_W - barW) / 2;
    const y = 22;
    const ratio = Clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(x - 2, y - 12, barW + 4, barH + 18);
    ctx.fillStyle = "#f0d060";
    ctx.font = `9px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const finalPhase = (boss.hp / Math.max(1, boss.maxHp)) <= BOSS_FINAL_HP_RATIO;
    const bossName = (boss.tankMan || boss.typeId === "tankMan")
      ? (finalPhase ? "腿甲坦克人 · 狂暴" : "BOSS 腿甲坦克人")
      : (boss.typeId === "tankKing" || boss.tankKing)
        ? (finalPhase ? "坦克王 · 狂暴" : "BOSS 坦克王")
        : (finalPhase ? "BOSS 终焉阶段" : "BOSS 重力巨炮");
    ctx.fillText(bossName, CANVAS_W / 2, y - 1);
    ctx.fillStyle = "#302010";
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = ratio > BOSS_FINAL_HP_RATIO ? "#ff6060" : "#ff3030";
    ctx.fillRect(x, y, barW * ratio, barH);
    ctx.strokeStyle = "#f0d060";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barW, barH);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  DrawBullet(ctx, b) {
    if (b.trail.length > 1) {
      ctx.strokeStyle = b.meteor
        ? "rgba(255,120,40,0.55)"
        : b.sniper
          ? "rgba(120,220,255,0.7)"
          : b.isPlayer
            ? (b.homing ? "rgba(255,120,160,0.45)" : "rgba(255,220,120,0.35)")
            : b.bossShell
              ? "rgba(255,180,80,0.45)"
              : "rgba(255,120,100,0.3)";
      ctx.lineWidth = b.meteor || b.sniper || b.bossShell ? 3 : 2;
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

    // Boss shells: elongated glowing rods oriented along velocity (distinct from player/normal).
    if (b.bossShell) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      if (b.sniper) {
        ctx.fillStyle = "#70e0ff";
        ctx.fillRect(-10, -2, 20, 4);
        ctx.fillStyle = "#e8ffff";
        ctx.fillRect(4, -1, 8, 2);
      } else {
        ctx.fillStyle = "#ff9030";
        ctx.fillRect(-8, -3, 16, 6);
        ctx.fillStyle = "#ffe0a0";
        ctx.fillRect(-4, -2, 10, 4);
      }
      ctx.restore();
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

    if (pu.kind === POWER.gunBarrel) {
      ctx.imageSmoothingEnabled = false;
      // Distinct thrown barrel pickup — not a roulette token.
      ctx.fillStyle = "#101418";
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
      ctx.strokeStyle = "#f0d060";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - s / 2 + 1, cy - s / 2 + 1, s - 2, s - 2);
      ctx.fillStyle = "#8a93a0";
      ctx.fillRect(cx - s * 0.35, cy - 3, s * 0.7, 6);
      ctx.fillStyle = "#c8d0d8";
      ctx.fillRect(cx + s * 0.22, cy - 5, 5, 10);
      ctx.fillStyle = "#ffe060";
      ctx.font = `9px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("炮", cx, cy - s * 0.28);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      // Beacon ring so it's findable in clutter.
      const ring = 0.35 + 0.35 * Math.abs(Math.sin(this.frame * 0.25));
      ctx.strokeStyle = `rgba(255,220,80,${ring})`;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

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
    ctx.font = `16px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  DrawRoulette(ctx) {
    const r = this.roulette;
    if (!r) return;
    const touch = this.isTouchDevice;
    const segs = this.RouletteSegments();
    const n = Math.max(1, segs.length);
    const slice = (Math.PI * 2) / n;
    const needleIdx = this.RouletteIndexAtNeedle();
    const under = segs[needleIdx] || segs[0];
    const focus = r.phase === "result" && r.result ? r.result : under;
    const wheelImg = this.images.rouletteWheel;
    const needle = this.images.rouletteNeedle;
    const rad = r.radius;
    const bannerH = touch ? 44 : 28;
    const bannerY = touch ? 8 : 10;
    const labelPx = touch ? 16 : 11;
    const bannerPx = touch ? 18 : 12;
    const hintPx = touch ? 14 : 10;
    const legendPx = touch ? 13 : 9;
    const hubR = touch ? 22 : 16;
    const hubPx = touch ? 15 : 11;

    const muted = (tier, focusSeg) => {
      if (tier === "good") return focusSeg ? "rgba(56,120,78,0.95)" : "rgba(42,92,62,0.92)";
      if (tier === "ultra") return focusSeg ? "rgba(176,140,56,0.95)" : "rgba(148,116,44,0.92)";
      return focusSeg ? "rgba(148,64,64,0.95)" : "rgba(118,52,52,0.92)";
    };

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Result strip — taller + larger type on touch so CJK stays readable.
    ctx.fillStyle = focus.bg;
    ctx.fillRect(20, bannerY, CANVAS_W - 40, bannerH);
    ctx.strokeStyle = focus.rim || focus.color;
    ctx.lineWidth = touch ? 3 : 2;
    ctx.strokeRect(20, bannerY, CANVAS_W - 40, bannerH);
    const iconSize = touch ? 22 : 16;
    const iconCx = touch ? 48 : 44;
    const iconCy = bannerY + bannerH / 2;
    this.DrawPowerIcon(ctx, focus.kind, iconCx, iconCy, iconSize);
    ctx.fillStyle = focus.color;
    ctx.font = `${bannerPx}px ${PIXEL_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tag = focus.tier === "ultra" ? "超 " : focus.tier === "bad" ? "负 " : "好 ";
    ctx.fillText(`${tag}${focus.label}`, iconCx + iconSize / 2 + 10, iconCy);
    ctx.textBaseline = "alphabetic";

    ctx.save();
    ctx.translate(r.cx, r.cy);

    // Soft shadow only
    ctx.beginPath();
    ctx.arc(2, 3, rad + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    ctx.rotate(r.angle);

    // Rim texture underlay (aligned 10-slice bake); segment fills overwrite colors to match prizes.
    if (wheelImg) {
      const diam = rad * 2 + 10;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(wheelImg, -diam / 2, -diam / 2, diam, diam);
      ctx.globalAlpha = 1;
    }

    // Source-of-truth wedges from live segments — always match needle + labels.
    for (let i = 0; i < n; i++) {
      const seg = segs[i];
      const a0 = i * slice;
      const a1 = a0 + slice;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rad, a0, a1);
      ctx.closePath();
      ctx.fillStyle = muted(seg.tier, i === needleIdx);
      ctx.fill();
      ctx.strokeStyle = "rgba(12,12,16,0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Quiet focus outline
    {
      const a0 = needleIdx * slice;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rad - 1, a0, a0 + slice);
      ctx.closePath();
      ctx.strokeStyle = focus.color;
      ctx.lineWidth = touch ? 3 : 2;
      ctx.stroke();
    }

    // Labels sit in wedge midpoints (same math as RouletteIndexAtNeedle).
    for (let i = 0; i < n; i++) {
      const seg = segs[i];
      const mid = i * slice + slice * 0.5;
      const isFocus = i === needleIdx;
      ctx.save();
      ctx.rotate(mid);
      const tx = rad * (touch ? 0.58 : 0.62);
      ctx.font = `${labelPx}px ${PIXEL_FONT}`;
      const textW = ctx.measureText(seg.label).width;
      const tw = Math.max(touch ? 40 : 28, textW + (touch ? 14 : 8));
      const th = touch ? 22 : 14;
      ctx.fillStyle = isFocus ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0.62)";
      ctx.fillRect(tx - tw / 2, -th / 2, tw, th);
      ctx.fillStyle = isFocus ? "#fff4d0" : "#f0f0f0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(seg.label, tx, 0.5);
      ctx.restore();
    }

    // Hub
    ctx.beginPath();
    ctx.arc(0, 0, hubR, 0, Math.PI * 2);
    ctx.fillStyle = "#141820";
    ctx.fill();
    ctx.strokeStyle = focus.rim || "#a09050";
    ctx.lineWidth = touch ? 3 : 2;
    ctx.stroke();
    ctx.fillStyle = focus.color;
    ctx.font = `${hubPx}px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(focus.tier === "bad" ? "负" : focus.tier === "ultra" ? "超" : "好", 0, 1);
    ctx.restore();

    // Slim needle — tip lands on rim at top
    const ny = r.cy - rad;
    const needleW = touch ? 28 : 20;
    const needleH = touch ? 40 : 32;
    if (needle) {
      ctx.drawImage(needle, r.cx - needleW / 2, ny - needleH + 4, needleW, needleH);
    } else {
      ctx.fillStyle = "#e0c060";
      ctx.beginPath();
      ctx.moveTo(r.cx, ny + 2);
      ctx.lineTo(r.cx - 7, ny - 16);
      ctx.lineTo(r.cx + 7, ny - 16);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(160,168,176,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.cx, r.cy, rad + 3, 0, Math.PI * 2);
    ctx.stroke();

    const footY = CANVAS_H - (touch ? 28 : 18);
    const legendY = CANVAS_H - (touch ? 10 : 6);
    ctx.fillStyle = "#a8b0b8";
    ctx.font = `${hintPx}px ${PIXEL_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(
      r.phase === "spin"
        ? (Math.abs(r.omega) > 0.2 || r.dragging ? "减速中…" : "拖动甩转 / 空格")
        : "获得！",
      r.cx,
      footY
    );
    ctx.textAlign = "left";
    ctx.font = `${legendPx}px ${PIXEL_FONT}`;
    ctx.fillStyle = TIER_PALETTE.good.color;
    ctx.fillText("绿=好", 16, legendY);
    ctx.fillStyle = TIER_PALETTE.ultra.color;
    ctx.fillText("金=超", touch ? 90 : 70, legendY);
    ctx.fillStyle = TIER_PALETTE.bad.color;
    ctx.fillText("红=负", touch ? 170 : 120, legendY);
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
    if (this.giantTimer > 0) {
      chips.push({ t: `巨大 ${Math.ceil(this.giantTimer)}·甲${this.giantHits}`, c: "#ffe060" });
    }
    if (this.heavyCurseTimer > 0) chips.push({ t: `超重 ${Math.ceil(this.heavyCurseTimer)}`, c: "#ff6060" });
    if (this.enemyRageTimer > 0) chips.push({ t: `狂暴 ${Math.ceil(this.enemyRageTimer)}`, c: "#ff6060" });
    if (this.playerStunTimer > 0) chips.push({ t: `眩晕 ${Math.ceil(this.playerStunTimer)}`, c: "#ff6060" });
    if (this.eagleMorph) {
      const left = Math.max(0, Math.ceil(this.eagleMorph.dur - this.eagleMorph.t));
      chips.push({ t: `变身中 ${left}`, c: "#ffe060" });
    } else if (this.playerEagleTimer > 0) {
      const p = this.player;
      const shieldLeft = p?.protect > 0 ? Math.ceil(p.protect) : 0;
      chips.push({
        t: shieldLeft > 0
          ? `老鹰 ${Math.ceil(this.playerEagleTimer)} · 盾${shieldLeft}`
          : `老鹰 ${Math.ceil(this.playerEagleTimer)} · 无盾危险`,
        c: shieldLeft > 0 ? "#80e0ff" : "#ff3030",
      });
    }
    if (this.freezeTimer > 0) chips.push({ t: `冻 ${Math.ceil(this.freezeTimer)}`, c: "#70ff98" });
    if ((this.absorbHits || 0) > 0) chips.push({ t: `装甲×${this.absorbHits}`, c: "#c8e0ff" });
    if (this.playerDisarmed) chips.push({ t: "无炮管·去捡", c: "#ff6060" });
    if (this.eagleStroll && this.baseAlive) {
      chips.push({ t: `遛鹰 ${Math.ceil(this.eagleStroll.ttl)}`, c: "#ff6060" });
    }
    if (this.prepTimer > 0) chips.push({ t: `准备 ${Math.ceil(this.prepTimer)}`, c: "#80e0ff" });
    if (this.carriedBlock) {
      const kind = this.carriedBlock.kind === "metal" ? "铁盾" : "木盾";
      chips.push({ t: `${kind} ${this.carriedBlock.hp}/${this.carriedBlock.maxHp}`, c: "#ffe08a" });
    }
    if (this.stagePerk) {
      const u = FindUpgrade(this.stagePerk);
      if (u) chips.push({ t: `本关·${u.title}`, c: "#70ff98" });
    }
    for (const id of this.runPerks) {
      const u = FindUpgrade(id);
      if (u) chips.push({ t: `永久·${u.title}`, c: "#ffe060" });
    }

    let x = 6;
    ctx.font = `10px ${PIXEL_FONT}`;
    for (const chip of chips) {
      const w = ctx.measureText(chip.t).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x, 4, w, 14);
      ctx.fillStyle = chip.c;
      ctx.fillText(chip.t, x + 5, 14);
      x += w + 4;
    }

    // Big eagle-curse / stroll banner so HQ events are impossible to miss.
    if (this.eagleWarnT > 0 && this.state === "playing") {
      const morphing = !!this.eagleMorph;
      const strolling = !!this.eagleStroll && !morphing;
      const alpha = Clamp(this.eagleWarnT / 0.55, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(40,0,0,0.78)";
      ctx.fillRect(16, CANVAS_H * 0.28, CANVAS_W - 32, 58);
      ctx.strokeStyle = morphing ? "#ffe060" : "#ff6060";
      ctx.lineWidth = 2;
      ctx.strokeRect(16, CANVAS_H * 0.28, CANVAS_W - 32, 58);
      ctx.fillStyle = "#ffe060";
      ctx.font = `14px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      if (morphing) {
        const left = Math.max(0, Math.ceil(this.eagleMorph.dur - this.eagleMorph.t));
        ctx.fillText(`终极诅咒变身中… ${left}`, CANVAS_W / 2, CANVAS_H * 0.28 + 22);
        ctx.fillStyle = "#80e0ff";
        ctx.font = `11px ${PIXEL_FONT}`;
        ctx.fillText("变身期间无敌 · 结束后护盾继续 · 无盾被打倒即失败", CANVAS_W / 2, CANVAS_H * 0.28 + 44);
      } else if (strolling) {
        ctx.fillText("⚠ 老鹰出门遛弯了！", CANVAS_W / 2, CANVAS_H * 0.28 + 22);
        ctx.fillStyle = "#ff9090";
        ctx.font = `11px ${PIXEL_FONT}`;
        ctx.fillText("堡垒已开 · 敌军会追它 · 被打中即失败", CANVAS_W / 2, CANVAS_H * 0.28 + 44);
      } else {
        ctx.fillText("终极诅咒 · 你变成了老鹰", CANVAS_W / 2, CANVAS_H * 0.28 + 22);
        ctx.fillStyle = "#80e0ff";
        ctx.font = `11px ${PIXEL_FONT}`;
        const shieldHint = this.player?.protect > 0
          ? `开场护盾 ${Math.ceil(this.player.protect)} 秒 · 护盾结束后被打倒即失败`
          : "护盾已结束 · 被打倒即失败";
        ctx.fillText(shieldHint, CANVAS_W / 2, CANVAS_H * 0.28 + 44);
      }
      ctx.textAlign = "left";
      ctx.restore();
    }

    if (this.buffToast && this.state !== "roulette") {
      const alpha = Clamp(this.buffToast.ttl / 0.4, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      const msg = this.buffToast.text;
      ctx.font = `13px ${PIXEL_FONT}`;
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
