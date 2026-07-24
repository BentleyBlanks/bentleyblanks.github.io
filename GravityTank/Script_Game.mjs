/**
 * GravityTank — classic Battle City stages with gravity bullets.
 * Visuals: classic NES Battle City–style sprites (StefanBS/battle-city-clone, MIT).
 */

import { STAGE_COUNT, GetStage, IsTutorialStage, IsBarricadeTeachStage, TUTORIAL_STAGE, BARRICADE_TEACH_STAGE } from "./Data_Stages.mjs";
import { STAGE_UPGRADES, BOSS_UPGRADES, TUTORIAL_UPGRADES, PickUpgradeCards, FindUpgrade, IsUpgradeRecommended, PeekNextStageId } from "./Data_Upgrades.mjs";

/** Player-facing build id — keep in sync with index.html `#gameVersion`. */
export const GAME_VERSION = "0.3";
export const GAME_VERSION_LABEL = `v${GAME_VERSION}`;

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
/** Classic ~1/5 tanks flash (~0.20); dialed down so ? tokens are rarer. */
const POWER_DROP_RATE = 0.15;
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
  // Bullet variants (positive) — kept for ApplyPowerup / upgrades; not all sit on the wheel.
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
  steelRain: "steelRain",
  fortress: "fortress",
  phoenix: "phoenix",
  arsenal: "arsenal",
  eagleAlly: "eagleAlly",
  bastion: "bastion",
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
  // Stage-9 boss throws your gun barrel as a field pickup (not on roulette pool).
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

/** Full prize pool — each spin picks ROULETTE_SIZE at random from here.
 *  Labels must read as plain Chinese (what it does), short enough for wheel wedges. */
const ROULETTE_POOL = [
  // Good
  MakeSeg(POWER.star, "火力", "good"),
  MakeSeg(POWER.bomb, "炸弹", "good"),
  MakeSeg(POWER.helmet, "护盾", "good"),
  MakeSeg(POWER.life, "加命", "good"),
  MakeSeg(POWER.clock, "冻结", "good"),
  MakeSeg(POWER.shovel, "护老家", "good"),
  MakeSeg(POWER.antigrav, "反坠", "good"),
  MakeSeg(POWER.bounce, "弹跳", "good"),
  MakeSeg(POWER.meteor, "陨石", "good"),
  MakeSeg(POWER.ghost, "幽灵", "good"),
  // Ultra
  MakeSeg(POWER.nuke, "大爆炸", "ultra"),
  MakeSeg(POWER.overdrive, "狂射", "ultra"),
  MakeSeg(POWER.apocalypse, "天罚", "ultra"),
  MakeSeg(POWER.juggernaut, "无敌", "ultra"),
  MakeSeg(POWER.steelRain, "钢雨", "ultra"),
  MakeSeg(POWER.fortress, "加钢墙", "ultra"),
  MakeSeg(POWER.phoenix, "续命", "ultra"),
  MakeSeg(POWER.arsenal, "弹海", "ultra"),
  MakeSeg(POWER.eagleAlly, "鹰援", "ultra"),
  MakeSeg(POWER.bastion, "装甲", "ultra"),
  MakeSeg(POWER.giant, "巨大", "ultra"),
  // Bad
  MakeSeg(POWER.spawnExtra, "增敌", "bad"),
  MakeSeg(POWER.enemyShield, "敌有盾", "bad"),
  MakeSeg(POWER.heavyCurse, "弹更坠", "bad"),
  MakeSeg(POWER.enemyRage, "敌加速", "bad"),
  MakeSeg(POWER.softStun, "动不了", "bad"),
  MakeSeg(POWER.fortBreak, "拆老家", "bad"),
  MakeSeg(POWER.eagleStroll, "老鹰跑", "bad"),
];

/** Always exactly 7 wedges on the wheel. */
const ROULETTE_SIZE = 7;

const POWER_STYLE = Object.fromEntries(ROULETTE_POOL.map((s) => [s.kind, s]));
Object.assign(POWER_STYLE, {
  token: MakeSeg(POWER.token, "?", "good"),
});

/** NES-style pickup FX presets. Some styles are fullscreen CRT wipes / tints. */
const POWER_FX = {
  [POWER.star]: { style: "buff", label: "火力", tint: "#ffe060", dur: 1.05, shake: 3, fullscreen: false },
  [POWER.gun]: { style: "buff", label: "破钢弹", tint: "#d0d0d0", dur: 1.1, shake: 4, fullscreen: false },
  [POWER.life]: { style: "life", label: "加命", tint: "#70ff98", dur: 1.2, shake: 2, fullscreen: true },
  [POWER.helmet]: { style: "shield", label: "护盾", tint: "#80c8ff", dur: 1.25, shake: 2, fullscreen: false },
  [POWER.plates]: { style: "armor", label: "装甲", tint: "#c8c8c8", dur: 1.05, shake: 3, fullscreen: false },
  [POWER.bastion]: { style: "armor", label: "装甲", tint: "#f0d060", dur: 1.4, shake: 5, fullscreen: true },
  [POWER.clock]: { style: "freeze", label: "冻结", tint: "#a0e8ff", dur: 1.45, shake: 2, fullscreen: true },
  [POWER.bomb]: { style: "blast", label: "炸弹", tint: "#ffe08a", dur: 1.05, shake: 8, fullscreen: true, rings: 2, blastN: 10, flashFrames: 10 },
  [POWER.shovel]: { style: "fort", label: "护老家", tint: "#c0c0c0", dur: 1.25, shake: 4, fullscreen: false },
  [POWER.antigrav]: { style: "antigrav", label: "反坠", tint: "#70ffe0", dur: 1.4, shake: 3, fullscreen: true },
  [POWER.bounce]: { style: "bounce", label: "弹跳", tint: "#ffc060", dur: 1.15, shake: 3, fullscreen: false },
  [POWER.meteor]: { style: "meteor", label: "陨石", tint: "#ff8040", dur: 1.5, shake: 7, fullscreen: true },
  [POWER.ghost]: { style: "ghost", label: "幽灵", tint: "#c0e0ff", dur: 1.35, shake: 1, fullscreen: true },
  [POWER.mirror]: { style: "mirror", label: "双炮", tint: "#e8e8ff", dur: 1.2, shake: 3, fullscreen: true },
  [POWER.magnet]: { style: "magnet", label: "追踪", tint: "#80ffc0", dur: 1.25, shake: 2, fullscreen: false },
  [POWER.warp]: { style: "warp", label: "闪现", tint: "#ffffff", dur: 0.95, shake: 6, fullscreen: false },
  [POWER.fork]: { style: "weapon", label: "三发", tint: "#ffe080", dur: 1.05, shake: 3, fullscreen: false },
  [POWER.rapid]: { style: "weapon", label: "速射", tint: "#ff9060", dur: 1.05, shake: 4, fullscreen: false },
  [POWER.pierce]: { style: "weapon", label: "穿透", tint: "#d0d8ff", dur: 1.05, shake: 3, fullscreen: false },
  [POWER.spread]: { style: "weapon", label: "散射", tint: "#ffd060", dur: 1.05, shake: 3, fullscreen: false },
  [POWER.sniper]: { style: "weapon", label: "狙击", tint: "#ff7060", dur: 1.1, shake: 2, fullscreen: false },
  [POWER.nuke]: { style: "blast", label: "大爆炸", tint: "#ff6040", dur: 1.65, shake: 14, fullscreen: true, rings: 4, blastN: 18, flashFrames: 16 },
  [POWER.overdrive]: { style: "ultra", label: "狂射", tint: "#ffe060", dur: 1.55, shake: 8, fullscreen: true },
  [POWER.apocalypse]: { style: "blast", label: "天罚", tint: "#fff2a0", dur: 2.35, shake: 18, fullscreen: true, rings: 6, blastN: 28, flashFrames: 22 },
  [POWER.juggernaut]: { style: "ultra", label: "无敌", tint: "#f0d060", dur: 1.5, shake: 7, fullscreen: true },
  [POWER.steelRain]: { style: "meteor", label: "钢雨", tint: "#ff9040", dur: 1.5, shake: 8, fullscreen: true },
  [POWER.fortress]: { style: "fort", label: "加钢墙", tint: "#e0e0e0", dur: 1.35, shake: 4, fullscreen: true },
  [POWER.phoenix]: { style: "life", label: "续命", tint: "#ffb070", dur: 1.4, shake: 4, fullscreen: true },
  [POWER.arsenal]: { style: "ultra", label: "弹海", tint: "#ffe080", dur: 1.45, shake: 7, fullscreen: true },
  [POWER.eagleAlly]: { style: "eagle", label: "鹰援", tint: "#ffe060", dur: 1.4, shake: 4, fullscreen: true },
  [POWER.giant]: { style: "giant", label: "巨大", tint: "#f0d060", dur: 1.45, shake: 6, fullscreen: true },
  [POWER.spawnExtra]: { style: "curse", label: "增敌", tint: "#ff5050", dur: 1.3, shake: 5, fullscreen: true },
  [POWER.enemyShield]: { style: "curse", label: "敌有盾", tint: "#ff7070", dur: 1.25, shake: 3, fullscreen: false },
  [POWER.heavyCurse]: { style: "curse", label: "弹更坠", tint: "#c06030", dur: 1.35, shake: 4, fullscreen: true },
  [POWER.enemyRage]: { style: "curse", label: "敌加速", tint: "#ff3030", dur: 1.3, shake: 6, fullscreen: true },
  [POWER.softStun]: { style: "stun", label: "动不了", tint: "#ffe060", dur: 1.15, shake: 9, fullscreen: true },
  [POWER.fortBreak]: { style: "fortBreak", label: "拆老家", tint: "#ff8060", dur: 1.35, shake: 7, fullscreen: false },
  [POWER.eagleStroll]: { style: "eagle", label: "老鹰跑", tint: "#ff9090", dur: 1.45, shake: 4, fullscreen: true },
};

function ShuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Powers that wipe the field — banned on boss stages (would skip the fight). */
const BOSS_BANNED_POWERS = new Set([POWER.nuke, POWER.apocalypse, POWER.bomb]);

/** Pick exactly `count` prizes: rare red, more gold, rest green.
 *  opts.allowGiant — late-game only (after stage 6).
 *  opts.bossSafe — strip field-wipe ultras/goods that would skip a boss. */
function PickRouletteSegments(count = ROULETTE_SIZE, difficulty = DIFFICULTY.normal, opts = {}) {
  const allow = (s) => !(opts.bossSafe && BOSS_BANNED_POWERS.has(s.kind));
  const goods = ShuffleInPlace(ROULETTE_POOL.filter((s) => s.tier === "good" && allow(s)).slice());
  let ultras = ROULETTE_POOL.filter((s) => s.tier === "ultra" && allow(s));
  if (!opts.allowGiant) ultras = ultras.filter((s) => s.kind !== POWER.giant);
  ultras = ShuffleInPlace(ultras.slice());
  const bads = ShuffleInPlace(ROULETTE_POOL.filter((s) => s.tier === "bad" && allow(s)).slice());
  // Easy: never red. Normal: ~25% chance of a single red wedge.
  const badN = difficulty === DIFFICULTY.easy
    ? 0
    : Math.min(bads.length, Math.random() < 0.25 ? 1 : 0);
  // Gold: 2-3 wedges normally; boss-safe wheels keep at least one non-wipe ultra when available.
  const ultraN = opts.bossSafe
    ? Math.min(ultras.length, 1 + Math.floor(Math.random() * 2))
    : Math.min(ultras.length, 2 + Math.floor(Math.random() * 2));
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
  // Fill if pool short — prefer non-bad on easy.
  while (picked.length < count) {
    const rest = ROULETTE_POOL.filter((s) => !picked.includes(s) && allow(s) && (opts.allowGiant || s.kind !== POWER.giant));
    if (!rest.length) break;
    const prefer = difficulty === DIFFICULTY.easy
      ? rest.filter((s) => s.tier !== "bad")
      : rest;
    const pool = prefer.length ? prefer : rest;
    picked.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return ShuffleInPlace(picked.slice(0, count));
}

const ROULETTE_FRICTION = 1.75; // viscous 1/s — soft natural coast
const ROULETTE_COULOMB = 0.72; // rad/s^2 opposing
const ROULETTE_DRAG_Q = 0.022; // quadratic drag at high speed
const ROULETTE_STOP = 0.11; // rad/s
const ROULETTE_MAX_OMEGA = 36;
const ROULETTE_ENTER_DUR = 0.4;
const ROULETTE_EXIT_DUR = 0.34;
const ROULETTE_PULL_MIN = 0.14; // below this, spring back without spinning
const ROULETTE_PULL_OMEGA_MIN = 9;
const ROULETTE_PULL_OMEGA_SPAN = 26;

function EaseOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Clamp(t, 0, 1);
  return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2;
}

function EaseInCubic(t) {
  const u = Clamp(t, 0, 1);
  return u * u * u;
}

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
/** Readable windup before every special skill resolves. */
const BOSS_SKILL_WINDUP = 0.95;
/** Boss field caps: boss + concurrent minions (escalate by stage). */
const MAX_ENEMIES_BOSS_S3 = 5;
const MAX_ENEMIES_BOSS_S6 = 6;
const MAX_ENEMIES_BOSS_S9 = 7;
/** Plain directed shells between specials. */
const BOSS_NORMAL_FIRE_MIN = 1.25;
const BOSS_NORMAL_FIRE_SPAN = 0.55;
/** Player-facing telegraph labels for every special pattern. */
const BOSS_SKILL_WARN = {
  chaseVolley: "⚠ 单炮连射蓄力",
  axisBurst: "⚠ 轴对称连射蓄力",
  quadCross: "⚠ 十字齐射蓄力",
  spinFire: "⚠ 轮射蓄力",
  ringShot: "⚠ 环形弹幕蓄力",
  octoCross: "⚠ 八管齐射蓄力",
  octoSpin: "⚠ 八管轮射蓄力",
  octoRing: "⚠ 八管环射蓄力",
  barrage: "⚠ 万炮齐发蓄力",
  fan: "⚠ 扇形追击蓄力",
  mortar: "⚠ 曲射迫击蓄力",
  sweep: "⚠ 横向扫射蓄力",
  rain: "⚠ 天降弹雨蓄力",
  burst: "⚠ 三点连射蓄力",
  disarmThrow: "⚠ 拆炮蓄力",
  layBomb: "⚠ 定时炸弹蓄力",
  sniperVolley: "⚠ 狙击连射蓄力",
  bounceFan: "⚠ 弹射扇形蓄力",
  mortarLob: "⚠ 榴弹抛射蓄力",
  chaseBurst: "⚠ 近身连射蓄力",
  stompRain: "⚠ 踩踏弹雨蓄力",
};

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
    this.fxDebris = [];
    this.fxBlastQueue = [];
    this.fxMarks = [];
    this.screenFx = null;
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
    this.eagleAlly = null;
    this.giantTimer = 0;
    this.giantHits = 0;
    this.eagleStroll = null;
    this.eagleWarnT = 0;
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
    this.SyncVersionUi();
    this.BindUi();
    this.RenderEnemyIcons();
    this.DrawBootFrame();
    if (new URLSearchParams(location.search).has("autostart")) {
      this.StartCampaign();
    }
    requestAnimationFrame((t) => this.Loop(t));
  }

  /** Keep logo / credit / document title aligned with GAME_VERSION. */
  SyncVersionUi() {
    const label = GAME_VERSION_LABEL;
    const verEl = document.getElementById("gameVersion");
    if (verEl) verEl.textContent = label;
    const creditEl = document.getElementById("creditVersion");
    if (creditEl) creditEl.textContent = label;
    const baseTitle = "GRAVITY TANK BATTLE";
    if (!document.title.includes(label)) {
      document.title = `${baseTitle} ${label}`;
    }
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
    // Eagle specials use the classic HQ eagle sprite on the wheel.
    if (kind === POWER.eagleAlly || kind === POWER.eagleStroll) {
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
      ctx.fillText(kind === POWER.softStun ? "定" : "拆", cx, cy + 1);
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
    // Easy: slightly more tokens, still rarer than classic.
    // Boss fights: more ? drops from minions so the wheel stays in play.
    if (this.isBossStage) return this.IsEasy() ? 0.72 : 0.55;
    return this.IsEasy() ? POWER_DROP_RATE * 1.35 : POWER_DROP_RATE;
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
      // Keep 2-tile tanks (+2px inset) fully on-canvas even if a stage table is stale.
      y: Math.max(0, Math.min(y, MAP_H - 3)) * TILE,
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
      const diffLine = this.IsEasy()
        ? "简易：双倍生命 · 负面更少 · ?掉率+50%"
        : "标准难度";
      const lines = [diffLine, ""];
      if (this.isTutorial) {
        lines.push("炮弹带重力会下坠。", "朝下 / 斜着打对岸。", "别把自己轰死。");
      } else if (this.isBarricadeTeach) {
        lines.push(
          "靠近路障按 K（触屏「扛」）举起。",
          "挡在身前可当护盾；同键放下封路。",
          "开场有准备时间，先封出口。",
        );
      } else if (this.state === "ready" || this.state === "boot") {
        lines.push("炮弹带重力，打出去会往下掉。", "自己也要当心，别被自己的弹幕炸到。");
      } else if (this.isBossStage) {
        lines.push("BOSS 关。", "炮弹带重力——自己也要当心落弹。");
      } else if (this.stageData.prepSeconds) {
        lines.push(
          `开场准备 ${Math.ceil(this.stageData.prepSeconds)} 秒。`,
          "用路障封死敌窝出口。",
          "炮弹带重力，别炸到自己。",
        );
      } else {
        lines.push("炮弹带重力会下坠。", "自己也要当心落弹。");
      }
      this.overlays.startBlurb.textContent = lines.join("\n");
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
    const nextStage = tutorial
      ? 1
      : (special ? PeekNextStageId(this.stage) : PeekNextStageId(this.isBarricadeTeach ? "barricadeTeach" : this.stage));
    // Soft-sort: recommended cards float to the top of the three picks.
    cards.sort((a, b) => {
      const ar = IsUpgradeRecommended(a, { special, tutorial, nextStage }) ? 1 : 0;
      const br = IsUpgradeRecommended(b, { special, tutorial, nextStage }) ? 1 : 0;
      return br - ar;
    });
    this.upgradePick = { special, tutorial, cards, nextStage };
    if (this.overlays.upgradeTitle) {
      this.overlays.upgradeTitle.textContent = tutorial
        ? "入门升级"
        : (special ? "Boss 特殊能力" : "关卡升级");
    }
    if (this.overlays.upgradeBlurb) {
      this.overlays.upgradeBlurb.textContent = tutorial
        ? "三选一：基础强化，带进第一关（本关有效）。黄边=推荐。"
        : (special
          ? "三选一：永久能力，带到本局通关结束。黄边=推荐。"
          : "三选一：本关有效（仅下一关）。黄边=对下一关更划算。");
    }
    cardsRoot.innerHTML = "";
    for (const card of cards) {
      const recommended = IsUpgradeRecommended(card, { special, tutorial, nextStage });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = [
        "upgrade-card",
        special ? "is-special" : "",
        tutorial ? "is-tutorial" : "",
        recommended ? "is-recommend" : "",
      ].filter(Boolean).join(" ");
      const iconSrc = card.icon || `./assets/Icon_Upgrade${card.id[0].toUpperCase()}${card.id.slice(1)}.png`;
      btn.innerHTML =
        `<span class="upgrade-card-body">` +
        (recommended ? `<span class="upgrade-rec" aria-hidden="true">推荐</span>` : "") +
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
    this.fxDebris = [];
    this.fxBlastQueue = [];
    this.fxMarks = [];
    this.screenFx = null;
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
    this.eagleAlly = null;
    this.ClearGiantForm(false);
    this.eagleStroll = null;
    this.eagleWarnT = 0;
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
      // Boss stages keep spawning minions after the boss is pre-spawned.
      this.spawnTimer = this.isTutorial || this.isBarricadeTeach ? 2.4 : (this.isBossStage ? 2.5 : 1.2);
    }
    this.ApplyStageStartPerks();
    if (this.isBarricadeTeach) {
      this.ShowBuffToast("靠近路障按 K（或「扛」）：扛起=护盾，再按=放下封路");
    } else if (this.isTutorial) {
      this.ShowBuffToast("河北岸：朝下/斜射，用重力清理南岸敌军");
    } else if (this.isBossStage) {
      const perk = FindUpgrade(this.stagePerk);
      const bossTitle = this.stageData.title || (this.stageData.bossKind === "tankMan"
        ? "腿甲坦克人"
        : (this.stageData.bossKind === "tankKing" ? "坦克王" : "重力巨炮"));
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
    // Mobility cards — applied after spawn so giant can re-scale on top.
    if (!(this.giantTimer > 0)) {
      p.speed = this.GetPlayerBaseSpeed();
    }
    this.meteorPulseTimer = this.HasPerk("meteorPulse") ? 9 : 0;
    this.timeRiftCd = 0;
  }

  /** Move speed from base + stage/run mobility cards (stackable). */
  GetPlayerBaseSpeed() {
    let mul = 1;
    if (this.HasPerk("turboTreads")) mul *= 1.38;
    else if (this.HasPerk("moveSpeed")) mul *= 1.28;
    if (this.HasPerk("swiftChassis")) mul *= 1.22;
    return PLAYER_SPEED * mul;
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
    if (!p?.alive) return;
    const cx = p.x + p.w * 0.5;
    const cy = p.y + p.h * 0.5;
    const size = TANK_SIZE * GIANT_SCALE;
    p.w = size;
    p.h = size;
    p.x = Clamp(cx - size * 0.5, 0, CANVAS_W - size);
    p.y = Clamp(cy - size * 0.5, 0, CANVAS_H - size);
    p.speed = this.GetPlayerBaseSpeed() * GIANT_SPEED_MUL;
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
    const cx = p.x + p.w * 0.5;
    const cy = p.y + p.h * 0.5;
    p.w = TANK_SIZE;
    p.h = TANK_SIZE;
    p.x = Clamp(cx - TANK_SIZE * 0.5, 0, CANVAS_W - TANK_SIZE);
    p.y = Clamp(cy - TANK_SIZE * 0.5, 0, CANVAS_H - TANK_SIZE);
    p.speed = this.GetPlayerBaseSpeed();
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
    if (target?.isBoss || target?.tankKing || target?.tankMan) return true;
    if (!this.isTutorial && this.stage >= ENEMY_FRIENDLY_FIRE_OFF_STAGE) return true;
    return false;
  }

  GetMaxEnemiesOnField() {
    if (this.isBossStage) {
      if (this.stage === 3) return MAX_ENEMIES_BOSS_S3;
      if (this.stage === 6) return MAX_ENEMIES_BOSS_S6;
      return MAX_ENEMIES_BOSS_S9;
    }
    if (!this.isTutorial && this.stage >= 7) return MAX_ENEMIES_LATE;
    return MAX_ENEMIES_ON_FIELD;
  }

  BuildSpawnQueue() {
    const counts = this.stageData.enemies;
    const minions = [];
    for (let i = 0; i < counts.basic; i++) minions.push(ENEMY_TYPES[0]);
    for (let i = 0; i < counts.fast; i++) minions.push(ENEMY_TYPES[1]);
    for (let i = 0; i < counts.power; i++) minions.push(ENEMY_TYPES[2]);
    for (let i = 0; i < counts.armor; i++) minions.push(ENEMY_TYPES[3]);
    for (let i = minions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [minions[i], minions[j]] = [minions[j], minions[i]];
    }
    // Bosses always lead the queue so intro pre-spawn places the boss first.
    const bosses = [];
    const bossKind = this.stageData.bossKind || "boss";
    const bossType = ENEMY_TYPES.find((t) => t.id === bossKind) || ENEMY_TYPES.find((t) => t.id === "boss");
    for (let i = 0; i < (counts.boss || 0); i++) bosses.push(bossType);
    for (let i = 0; i < (counts.tankKing || 0); i++) {
      bosses.push(ENEMY_TYPES.find((t) => t.id === "tankKing") || bossType);
    }
    for (let i = 0; i < (counts.tankMan || 0); i++) {
      bosses.push(ENEMY_TYPES.find((t) => t.id === "tankMan") || bossType);
    }
    this.spawnQueue = bosses.concat(minions);
  }

  SpawnPlayer(fullProtect, keepStats = null) {
    const [sx, rawSy] = this.stageData.playerSpawns?.[0] || [8, 24];
    const sy = Math.max(0, Math.min(rawSy, MAP_H - 3));
    const power = keepStats?.power ?? 1;
    const maxBullets = keepStats?.maxBullets ?? (power >= 2 ? 2 : 1);
    if (keepStats?.absorbHits != null) this.absorbHits = keepStats.absorbHits;
    this.playerDisarmed = false;
    // Top HQ / tutorial: face the battlefield. Classic bottom HQ: face up toward enemies.
    const faceDown = this.isTutorial || sy < MAP_H / 2 || this.IsBaseAtTop();
    this.player = {
      x: sx * TILE + 2,
      y: sy * TILE + 2,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: faceDown ? "down" : "up",
      speed: this.GetPlayerBaseSpeed(),
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
    if (this.eagleAlly) this.UpdateEagleAlly(dt);
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
    if (this.eagleStroll) {
      this.UpdateEagleStroll(dt);
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
    this.UpdateScreenFx(dt);
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
    if (!this.player?.alive || this.playerStunTimer > 0) return;
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
      const speed = p.speed * (onIce ? 1.15 : 1) * (this.carriedBlock ? 0.88 : 1);
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
    if (this.giantTimer > 0) this.CrushBricksTouchingPlayer();

    if (this.ConsumeInteractPress()) this.TryInteractCarry();
    if (this.WantsFire()) this.TryFire(p, true);

    // pickup → gunBarrel restores armament; other tokens open physics roulette
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
      if (e.normalFireCd > 0) e.normalFireCd -= dt;

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
    if (this.TickBossSkillWindup(e, dt, this.BeginTankKingAttack)) return;
    this.TryBossNormalShot(e);
    if (e.fireCd <= 0) {
      const ratio = e.hp / Math.max(1, e.maxHp);
      e.finalPhase = ratio <= BOSS_FINAL_HP_RATIO;
      const barrels = e.barrelCount || 1;
      let pattern;
      if (e.finalPhase) {
        const firstUltimate = !e.finalBurstUsed;
        if (firstUltimate || Math.random() < 0.3) {
          pattern = barrels <= 1 ? "chaseVolley" : "ringShot";
          e.finalBurstUsed = true;
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
      this.ArmBossSkill(e, pattern);
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
      return;
    }

    if (pattern === "quadCross") {
      for (let i = 0; i < dirs.length; i++) {
        e.attackQueue.push({ t: i * 0.04 * cdScale, kind: "kingShell", dir: dirs[i] });
      }
      e.fireCd = 2.0 * cdScale;
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
    } else if (pattern === "chaseVolley") {
      for (let i = 0; i < 4; i++) {
        e.attackQueue.push({ t: i * 0.1 * cdScale, kind: "kingShell", dir: face });
      }
      const sideA = face === "up" || face === "down" ? "left" : "up";
      const sideB = face === "up" || face === "down" ? "right" : "down";
      e.attackQueue.push({ t: 0.08 * cdScale, kind: "kingShell", dir: sideA, angleOffset: -0.18 });
      e.attackQueue.push({ t: 0.08 * cdScale, kind: "kingShell", dir: sideB, angleOffset: 0.18 });
      e.fireCd = 2.1 * cdScale;
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
    if (this.TickBossSkillWindup(e, dt, this.BeginTankManAttack)) return;
    this.TryBossNormalShot(e);
    if (e.fireCd <= 0) {
      const ratio = e.hp / Math.max(1, e.maxHp);
      const finalPhase = ratio <= BOSS_FINAL_HP_RATIO;
      e.finalPhase = finalPhase;
      let pattern;
      if (finalPhase) {
        const firstUltimate = !e.finalBurstUsed;
        if (firstUltimate || Math.random() < 0.28) {
          const heavies = ["stompRain", "sniperVolley", "disarmThrow"];
          pattern = heavies[Math.floor(Math.random() * heavies.length)];
          e.finalBurstUsed = true;
        }
      }
      if (!pattern) {
        const pool = TANK_MAN_ATTACKS.slice();
        if (!this.playerDisarmed && Math.random() < 0.42) pattern = "disarmThrow";
        else if (Math.random() < 0.28) pattern = "layBomb";
        else if (Math.random() < 0.32) pattern = "sniperVolley";
        else pattern = pool[Math.floor(Math.random() * pool.length)];
      }
      this.ArmBossSkill(e, pattern);
    }
  }

  BeginTankManAttack(e, pattern) {
    e.attackPattern = pattern;
    e.attackQueue = [];
    e.attackAge = 0;
    const cdScale = this.GetBossFireCdScale(e);
    const face = e.castFace || "down";

    if (pattern === "disarmThrow") {
      e.attackQueue.push({ t: 0.25 * cdScale, kind: "disarmThrow" });
      e.attackQueue.push({ t: 0.55 * cdScale, kind: "layBomb" });
      e.fireCd = 3.2 * cdScale;
      return;
    }

    if (pattern === "layBomb") {
      const n = e.finalPhase ? 3 : 2;
      for (let i = 0; i < n; i++) {
        e.attackQueue.push({ t: i * 0.22 * cdScale, kind: "layBomb" });
      }
      e.fireCd = 2.4 * cdScale;
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
      return;
    }

    // stompRain — mix rain + bombs
    for (let i = 0; i < 5; i++) {
      e.attackQueue.push({ t: i * 0.1 * cdScale, kind: "rain" });
    }
    e.attackQueue.push({ t: 0.35 * cdScale, kind: "layBomb" });
    e.attackQueue.push({ t: 0.55 * cdScale, kind: "layBomb" });
    e.fireCd = 3.1 * cdScale;
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
    if (this.TickBossSkillWindup(e, dt, this.BeginBossAttack)) return;
    this.TryBossNormalShot(e);
    if (e.fireCd <= 0) {
      const ratio = e.hp / Math.max(1, e.maxHp);
      const finalPhase = ratio <= BOSS_FINAL_HP_RATIO;
      e.finalPhase = finalPhase;
      let pattern;
      if (finalPhase) {
        const firstUltimate = !e.finalBurstUsed;
        if (firstUltimate || Math.random() < 0.38) {
          pattern = (e.barrelCount || 0) >= 8 ? "octoRing" : "barrage";
          e.finalBurstUsed = true;
        }
      }
      if (!pattern) {
        if ((e.barrelCount || 0) >= 8 && Math.random() < 0.34) {
          pattern = BOSS_OCTO_ATTACKS[Math.floor(Math.random() * BOSS_OCTO_ATTACKS.length)];
        } else {
          pattern = BOSS_ATTACKS[Math.floor(Math.random() * BOSS_ATTACKS.length)];
        }
      }
      this.ArmBossSkill(e, pattern);
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
    } else if (pattern === "barrage") {
      // 万炮齐发：宽扇形下压弹幕
      const n = 11;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = -1.05 + t * 2.1;
        e.attackQueue.push({ t: i * 0.04 * cdScale, kind: "shell", dir: "down", angleOffset: ang, label: i === 0 });
      }
      e.fireCd = 3.2 * cdScale;
    } else if (pattern === "fan") {
      // 扇形追击：朝玩家扇形 5 发
      const n = 5;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = -0.55 + t * 1.1;
        e.attackQueue.push({ t: 0.02 * i * cdScale, kind: "shell", dir: face, angleOffset: ang });
      }
      e.fireCd = 2.4 * cdScale;
    } else if (pattern === "mortar") {
      // 曲射迫击：高抛弧线砸向玩家附近
      const px = this.player?.alive ? this.player.x + this.player.w / 2 : CANVAS_W / 2;
      for (let i = 0; i < 5; i++) {
        const aimX = px + (i - 2) * 36;
        e.attackQueue.push({ t: i * 0.12 * cdScale, kind: "mortar", aimX });
      }
      e.fireCd = 2.8 * cdScale;
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
    } else if (pattern === "rain") {
      // 天降弹雨：上方落下慢速重力弹
      for (let i = 0; i < 8; i++) {
        e.attackQueue.push({ t: i * 0.1 * cdScale, kind: "rain" });
      }
      e.fireCd = 3.1 * cdScale;
    } else if (pattern === "burst") {
      // 三点连射：对准玩家连发
      for (let i = 0; i < 3; i++) {
        e.attackQueue.push({ t: i * 0.22 * cdScale, kind: "shell", dir: face, angleOffset: 0 });
      }
      e.fireCd = 2.1 * cdScale;
      this.ShowBuffToast("三点连射");
    } else {
      e.fireCd = 1.5 * cdScale;
    }
    e.attackAge = 0;
  }

  /** Start a readable telegraph, then resolve via TickBossSkillWindup → Begin*Attack. */
  ArmBossSkill(e, pattern) {
    e.pendingPattern = pattern;
    e.skillWindup = BOSS_SKILL_WINDUP;
    // Lock special cadence for the windup; Begin*Attack overwrites with the real cooldown.
    e.fireCd = Math.max(e.fireCd || 0, BOSS_SKILL_WINDUP + 0.05);
    let warn = BOSS_SKILL_WARN[pattern] || "⚠ 特殊攻击蓄力";
    if (pattern === "axisBurst" && (e.barrelCount || 1) <= 1) warn = "⚠ 点射蓄力";
    e.skillWarn = warn;
    this.ShowBuffToast(warn);
  }

  /** @returns {boolean} true while windup is active (caller should skip other attacks). */
  TickBossSkillWindup(e, dt, beginFn) {
    if (!(e.skillWindup > 0)) return false;
    e.skillWindup -= dt;
    if (e.skillWindup <= 0) {
      e.skillWindup = 0;
      const pattern = e.pendingPattern;
      e.pendingPattern = null;
      e.skillWarn = null;
      if (pattern) beginFn.call(this, e, pattern);
    }
    return true;
  }

  /** Ordinary directed boss shells between special skills. */
  TryBossNormalShot(e) {
    if ((e.skillWindup || 0) > 0) return;
    if (e.attackQueue?.length) return;
    if ((e.normalFireCd || 0) > 0) return;
    if ((e.protect || 0) > 0) return;
    if ((e.spawnFlash || 0) > 0) return;

    let face = e.castFace || e.dir || "down";
    if (this.player?.alive && Math.random() < 0.72) {
      face = DirFromVector(this.player.x - e.x, this.player.y - e.y);
    } else {
      const hq = this.GetBaseTarget();
      face = DirFromVector(hq.x - e.x, hq.y - e.y);
    }
    e.castFace = face;
    this.SpawnBossShellFromDir(e, face, (Math.random() - 0.5) * 0.08);
    e.normalFireCd = BOSS_NORMAL_FIRE_MIN + Math.random() * BOSS_NORMAL_FIRE_SPAN;
    this.audio.Shoot();
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

  DisarmPlayerThrowBarrel(boss) {
    const p = this.player;
    if (!p?.alive) return;
    if (this.playerDisarmed || p.disarmed) {
      this.LayTimedBomb(boss);
      return;
    }
    this.playerDisarmed = true;
    p.disarmed = true;
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
    if (isPlayer && (this.playerDisarmed || tank.disarmed)) return;
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

      if (this.BulletHitCarryables(b)) continue;
      if (this.BulletHitEagleStroll(b)) continue;

      // Enemy shells can shoot down the sortie eagle (mobile HQ).
      if (!b.isPlayer && this.eagleAlly && this.baseAlive && RectsOverlap(b, this.eagleAlly)) {
        b.alive = false;
        this.SpawnExplosion(b.x, b.y, 0.55);
        this.DestroyBase();
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
            this.timeRiftCd <= 0
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
    const prevRatio = e.hp / Math.max(1, e.maxHp);
    e.hp -= Math.max(1, power >= 3 ? 2 : 1);
    const nextRatio = e.hp / Math.max(1, e.maxHp);
    this.MaybeDropBossMilestoneToken(e, prevRatio, nextRatio);
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

  /** Boss HP milestones drop safe ? tokens (roulette bans field-wipe prizes). */
  MaybeDropBossMilestoneToken(e, prevRatio, nextRatio) {
    if (!e?.isBoss || !this.isBossStage) return;
    if (!e.bossDropMarks) e.bossDropMarks = [0.66, 0.33];
    for (let i = e.bossDropMarks.length - 1; i >= 0; i--) {
      const mark = e.bossDropMarks[i];
      if (prevRatio > mark && nextRatio <= mark) {
        e.bossDropMarks.splice(i, 1);
        const ox = (Math.random() - 0.5) * 48;
        const oy = 28 + Math.random() * 24;
        this.DropPowerup(e.x + e.w * 0.5 + ox, e.y + e.h * 0.5 + oy);
        this.ShowBuffToast("Boss 掉落道具！");
      }
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
    if (this.giantHits > 0) {
      this.giantHits -= 1;
      p.protect = Math.max(p.protect, 0.9);
      this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 0.7);
      this.ShowBuffToast(this.giantHits > 0 ? `巨大化扛伤！剩余 ${this.giantHits}` : "巨大化护甲耗尽！");
      this.audio.Bounce();
      return;
    }
    if ((this.absorbHits || 0) > 0 || (p.absorbHits || 0) > 0) {
      this.absorbHits = Math.max(0, (this.absorbHits || 0) - 1);
      p.absorbHits = this.absorbHits;
      p.protect = Math.max(p.protect, 1.0);
      this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 0.55);
      this.ShowBuffToast(this.absorbHits > 0 ? `装甲抵挡！剩余 ${this.absorbHits}` : "装甲耗尽！");
      this.audio.Bounce();
      return;
    }
    this.ClearGiantForm(false);
    this.DropCarriedBlock(true);
    p.alive = false;
    this.audio.StopEngine();
    this.SpawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 1.2);
    this.audio.Explode();
    this.lives -= 1;
    this.UpdateHud();
    if (this.lives <= 0) {
      this.lives = 0;
      this.respawnTimer = 0;
      this.EndGame(false, "生命耗尽。战役失败。");
      return;
    }
    // Use update-loop timer so pause cannot cancel respawn forever.
    this.respawnTimer = 0.9;
  }

  DestroyBase() {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    const hq = this.GetBaseTarget();
    const home = this.eagleStroll?.home || this.eagleAlly?.home || this.FindBaseCell();
    this.eagleAlly = null;
    this.eagleStroll = null;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === TILE_BASE) this.map[y][x] = TILE_BASE_DEAD;
      }
    }
    // Nest may already be empty while eagle is out — stamp ruined tiles at home.
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = home.x + dx;
        const y = home.y + dy;
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        this.map[y][x] = TILE_BASE_DEAD;
      }
    }
    this._baseCell = { x: home.x, y: home.y };
    this.SpawnExplosion(hq.x + hq.w / 2, hq.y + hq.h / 2, 1.4);
    this.audio.Lose();
    this.EndGame(false, "总部被毁。战役失败。");
  }

  /** Top-left tile of the 2×2 eagle base (live or ruined). */
  FindBaseCell() {
    if (this.eagleStroll?.home) {
      return { x: this.eagleStroll.home.x, y: this.eagleStroll.home.y };
    }
    if (this.eagleAlly?.home) {
      return { x: this.eagleAlly.home.x, y: this.eagleAlly.home.y };
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
    if (this.eagleAlly && this.baseAlive) {
      const e = this.eagleAlly;
      return { x: e.x, y: e.y, w: e.w, h: e.h };
    }
    const c = this.FindBaseCell();
    return { x: c.x * TILE, y: c.y * TILE, w: TILE * 2, h: TILE * 2 };
  }

  /** Golden ultra: HQ eagle sorties and rains missiles on field enemies. */
  StartEagleAlly(duration = 16) {
    if (!this.baseAlive) {
      this.ShowBuffToast("总部已毁，无法出击");
      return;
    }
    if (this.eagleAlly) {
      this.eagleAlly.ttl = Math.max(this.eagleAlly.ttl, duration);
      this.ShowBuffToast("鹰援续航！");
      return;
    }
    const cell = this.FindBaseCell();
    this.BreakBaseFort();
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (this.map[y]?.[x] === TILE_BASE) this.map[y][x] = TILE_EMPTY;
      }
    }
    this._baseCell = { x: cell.x, y: cell.y };
    const stepOut = this.IsBaseAtTop() ? TILE * 2.2 : -TILE * 2.2;
    this.eagleAlly = {
      x: Clamp(cell.x * TILE, 0, CANVAS_W - TILE * 2),
      y: Clamp(cell.y * TILE + stepOut, 0, CANVAS_H - TILE * 2),
      w: TILE * 2,
      h: TILE * 2,
      home: { x: cell.x, y: cell.y },
      ttl: duration,
      fireCd: 0.25,
      retargetT: 0,
      aimX: CANVAS_W * 0.5,
      aimY: CANVAS_H * 0.5,
      animTick: 0,
    };
    this.ShowBuffToast("鹰援出击！导弹清兵 16 秒");
    this.audio.Power();
  }

  EndEagleAlly() {
    const ally = this.eagleAlly;
    this.eagleAlly = null;
    if (!ally?.home || !this.baseAlive) return;
    const { x: hx, y: hy } = ally.home;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = hx + dx;
        const y = hy + dy;
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if (this.map[y][x] === TILE_EMPTY || this.map[y][x] === TILE_GRASS || this.map[y][x] === TILE_ICE) {
          this.map[y][x] = TILE_BASE;
        }
      }
    }
    this._baseCell = { x: hx, y: hy };
    // Gold ultra must not leave HQ naked after the sortie.
    this.pendingFortRestore = false;
    this.FortifyBase(true);
    this.shovelTimer = Math.max(this.shovelTimer, 14);
    this.ShowBuffToast("老鹰归巢 · 老家钢墙补上");
  }

  UpdateEagleAlly(dt) {
    const e = this.eagleAlly;
    if (!e || !this.baseAlive) {
      this.eagleAlly = null;
      return;
    }
    e.ttl -= dt;
    if (e.ttl <= 0) {
      this.EndEagleAlly();
      return;
    }
    e.animTick += dt * 10;
    e.retargetT -= dt;
    e.fireCd -= dt;

    if (e.retargetT <= 0) {
      e.retargetT = 0.45 + Math.random() * 0.35;
      let best = null;
      let bestD = 1e9;
      for (const en of this.enemies) {
        if (!en.alive || en.spawnFlash > 0) continue;
        const dx = en.x + en.w * 0.5 - (e.x + e.w * 0.5);
        const dy = en.y + en.h * 0.5 - (e.y + e.h * 0.5);
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = en;
        }
      }
      if (best) {
        e.aimX = best.x + best.w * 0.5;
        e.aimY = best.y + best.h * 0.5;
      } else {
        e.aimX = CANVAS_W * 0.5 + (Math.random() - 0.5) * 120;
        e.aimY = CANVAS_H * 0.45 + (Math.random() - 0.5) * 80;
      }
    }

    const cx = e.x + e.w * 0.5;
    const cy = e.y + e.h * 0.5;
    const dx = e.aimX - cx;
    const dy = e.aimY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 78;
    // Flyer — ignore terrain so it can actually clear lanes.
    e.x = Clamp(e.x + (dx / dist) * speed * dt, 4, CANVAS_W - e.w - 4);
    e.y = Clamp(e.y + (dy / dist) * speed * dt, 4, CANVAS_H - e.h - 4);

    if (e.fireCd <= 0) {
      const live = this.enemies.filter((en) => en.alive && en.spawnFlash <= 0);
      if (live.length) {
        this.SpawnEagleMissile(e, live[Math.floor(Math.random() * live.length)]);
        if (live.length > 1 && Math.random() < 0.55) {
          this.SpawnEagleMissile(e, live[Math.floor(Math.random() * live.length)]);
        }
        e.fireCd = 0.48;
        this.audio.Shoot();
      } else {
        e.fireCd = 0.7;
      }
    }
  }

  SpawnEagleMissile(ally, target) {
    const cx = ally.x + ally.w * 0.5;
    const cy = ally.y + ally.h * 0.5;
    const tx = target.x + target.w * 0.5;
    const ty = target.y + target.h * 0.5;
    const ang = Math.atan2(ty - cy, tx - cx);
    const spd = BULLET_SPEED * 1.15;
    const face = DirFromVector(Math.cos(ang), Math.sin(ang));
    this.bullets.push({
      x: cx - 4 + Math.cos(ang) * 10,
      y: cy - 4 + Math.sin(ang) * 10,
      w: 8,
      h: 8,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      alive: true,
      owner: this.player,
      isPlayer: true,
      power: 3,
      trail: [],
      arm: 0.12,
      traveled: 0,
      gravityMul: 0.2,
      bounceLeft: 0,
      pierceLeft: 1,
      face,
      homing: true,
      eagleMissile: true,
    });
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

  /** Negative: eagle kicks the fort open and waddles around the field. */
  StartEagleStroll(duration = 18) {
    if (!this.baseAlive) return;
    if (this.eagleAlly) this.eagleAlly = null;
    if (this.eagleStroll) {
      this.eagleStroll.ttl = Math.max(this.eagleStroll.ttl, duration);
      this.BreakBaseFort();
      this.ShowBuffToast("⚠ 老鹰还在外面跑…门又开了");
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
    this.ShowBuffToast("⚠ 老鹰自己开门跑出去了！护住它！");
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
      this.ShowBuffToast("老鹰跑完回家了");
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
    // Field token opens roulette; gunBarrel is a direct restore pickup.
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
      bossSafe: this.isBossStage,
    });
    const touch = this.isTouchDevice;
    this.roulette = {
      angle: Math.random() * Math.PI * 2, // orientation only — NOT the result
      omega: 0,
      pulling: false,
      pointerId: null,
      pull: 0, // 0 rest … 1 fully charged
      pullVel: 0,
      stillT: 0,
      hasSpun: false,
      phase: "enter", // enter | spin | exit | result
      enterT: 0,
      exitT: 0,
      pendingKind: null,
      result: null,
      resultT: 0,
      segments,
      // Leave room on the right for the pinball-style pull arc.
      cx: CANVAS_W / 2 - (touch ? 22 : 28),
      cy: CANVAS_H / 2 + (touch ? 40 : 28),
      radius: touch ? 148 : 120,
    };
    this.SyncTouchControlsVisibility();
    const nBad = segments.filter((s) => s.tier === "bad").length;
    const nUltra = segments.filter((s) => s.tier === "ultra").length;
    this.ShowBuffToast(
      this.isBossStage
        ? `Boss转轮 ×${segments.length}（金${nUltra} · 禁大爆炸/天罚/炸弹 · 红${nBad}）`
        : `转轮 ×${segments.length}（金${nUltra} / 红${nBad}）`
    );
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

  /** Right-side pinball plunger arc (rest at top → charge at bottom). */
  RoulettePlungerGeom(r = this.roulette) {
    if (!r) return null;
    const touch = this.isTouchDevice;
    const arcR = r.radius * (touch ? 1.08 : 1.12);
    const arcCx = r.cx + r.radius * 0.22;
    const arcCy = r.cy;
    const ang0 = -0.95; // rest (upper-right)
    const ang1 = 1.15; // full pull (lower-right)
    const pull = Clamp(r.pull || 0, 0, 1);
    const ang = ang0 + (ang1 - ang0) * pull;
    const knobX = arcCx + Math.cos(ang) * arcR;
    const knobY = arcCy + Math.sin(ang) * arcR;
    const knobR = touch ? 22 : 16;
    return { arcCx, arcCy, arcR, ang0, ang1, ang, knobX, knobY, knobR, pull };
  }

  RoulettePullFromPoint(r, x, y) {
    const g = this.RoulettePlungerGeom({ ...r, pull: 0 });
    if (!g) return 0;
    let ang = Math.atan2(y - g.arcCy, x - g.arcCx);
    // Keep on the right half; clamp into [ang0, ang1].
    if (ang < g.ang0) ang = g.ang0;
    if (ang > g.ang1) ang = g.ang1;
    return Clamp((ang - g.ang0) / Math.max(0.001, g.ang1 - g.ang0), 0, 1);
  }

  HitRoulettePlunger(r, x, y) {
    const g = this.RoulettePlungerGeom(r);
    if (!g) return false;
    const dKnob = Math.hypot(x - g.knobX, y - g.knobY);
    if (dKnob <= g.knobR + 14) return true;
    // Generous vertical strip along the arc's right side.
    const dArc = Math.hypot(x - g.arcCx, y - g.arcCy);
    if (Math.abs(dArc - g.arcR) < (this.isTouchDevice ? 28 : 20)) {
      const ang = Math.atan2(y - g.arcCy, x - g.arcCx);
      if (ang >= g.ang0 - 0.15 && ang <= g.ang1 + 0.15) return true;
    }
    return false;
  }

  OnCanvasPointerDown(ev) {
    if (this.state === "stageIntro") {
      this.SkipStageIntro();
      return;
    }
    if (this.state !== "roulette" || !this.roulette || this.roulette.phase !== "spin") return;
    const r = this.roulette;
    if (r.hasSpun || Math.abs(r.omega) > ROULETTE_STOP) return;
    const p = this.CanvasToLocal(ev);
    if (!this.HitRoulettePlunger(r, p.x, p.y)) return;
    ev.preventDefault();
    this.canvas.setPointerCapture?.(ev.pointerId);
    r.pulling = true;
    r.pointerId = ev.pointerId;
    r.pullVel = 0;
    r.pull = this.RoulettePullFromPoint(r, p.x, p.y);
    r.stillT = 0;
  }

  OnCanvasPointerMove(ev) {
    const r = this.roulette;
    if (this.state !== "roulette" || !r?.pulling || ev.pointerId !== r.pointerId) return;
    const p = this.CanvasToLocal(ev);
    r.pull = this.RoulettePullFromPoint(r, p.x, p.y);
  }

  OnCanvasPointerUp(ev) {
    const r = this.roulette;
    if (!r || ev.pointerId !== r.pointerId) return;
    const charge = r.pull;
    r.pulling = false;
    r.pointerId = null;
    this.RouletteReleasePlunger(charge);
  }

  /** Fire the wheel from a charged pull (pinball plunger release). */
  RouletteReleasePlunger(charge) {
    const r = this.roulette;
    if (!r || r.phase !== "spin" || r.hasSpun) {
      if (r) r.pullVel = 0;
      return;
    }
    const pull = Clamp(charge ?? r.pull ?? 0, 0, 1);
    if (pull < ROULETTE_PULL_MIN) {
      // Too light — spring back, no spin.
      r.pullVel = 0;
      return;
    }
    const power = ROULETTE_PULL_OMEGA_MIN + pull * ROULETTE_PULL_OMEGA_SPAN;
    // Always spin the same way so release feel is consistent (clockwise on screen).
    r.omega = Clamp(power + Math.random() * 2.5, -ROULETTE_MAX_OMEGA, ROULETTE_MAX_OMEGA);
    r.hasSpun = true;
    r.stillT = 0;
    r.pullVel = -4.5 - pull * 3.5; // spring the knob home
    this.audio.Shoot();
  }

  /** Keyboard / touch-fire shortcut: medium-strong plunger shot. */
  RouletteKick(amount) {
    const r = this.roulette;
    if (!r || r.phase !== "spin" || r.pulling || r.hasSpun || Math.abs(r.omega) > ROULETTE_STOP) return;
    const charge = Clamp(0.55 + (amount || 16) / 40, 0.55, 1);
    r.pull = charge;
    this.RouletteReleasePlunger(charge);
  }

  UpdateRoulette(dt) {
    const r = this.roulette;
    if (!r) return;

    if (r.phase === "enter") {
      r.enterT += dt;
      if (r.enterT >= ROULETTE_ENTER_DUR) {
        r.enterT = ROULETTE_ENTER_DUR;
        r.phase = "spin";
      }
      if (this.buffToast) {
        this.buffToast.ttl -= dt;
        if (this.buffToast.ttl <= 0) this.buffToast = null;
      }
      return;
    }

    if (r.phase === "exit") {
      r.exitT += dt;
      // Keep residual sparks alive while the wheel flies out.
      this.UpdateExplosions(dt);
      this.UpdateScreenFx(dt);
      if (r.exitT >= ROULETTE_EXIT_DUR) {
        r.exitT = ROULETTE_EXIT_DUR;
        const kind = r.pendingKind;
        r.pendingKind = null;
        r.phase = "result";
        r.resultT = 0;
        // Apply after fly-out so fullscreen FX is not covered by the wheel.
        if (kind) this.ApplyPowerup(kind);
      }
      return;
    }

    if (r.phase === "result") {
      r.resultT += dt;
      this.UpdateExplosions(dt);
      this.UpdateScreenFx(dt);
      if (r.resultT >= (r.resultHold || 1.85)) this.CloseRoulette();
      return;
    }

    // Plunger spring-back when not held.
    if (!r.pulling) {
      if (r.pull > 0.001 || Math.abs(r.pullVel) > 0.01) {
        r.pullVel += (-14 * r.pull) * dt; // spring to rest
        r.pullVel *= Math.exp(-10 * dt);
        r.pull = Clamp(r.pull + r.pullVel * dt, 0, 1);
        if (r.pull < 0.01 && Math.abs(r.pullVel) < 0.2) {
          r.pull = 0;
          r.pullVel = 0;
        }
      }
    }

    if (!r.pulling) {
      // Natural damping: viscous + coulomb + mild quadratic (no pre-chosen stop).
      const w = r.omega;
      const dragQ = ROULETTE_DRAG_Q * w * Math.abs(w);
      r.omega *= Math.exp(-ROULETTE_FRICTION * dt);
      if (r.omega > 0) r.omega = Math.max(0, r.omega - (ROULETTE_COULOMB + Math.abs(dragQ)) * dt);
      else if (r.omega < 0) r.omega = Math.min(0, r.omega + (ROULETTE_COULOMB + Math.abs(dragQ)) * dt);
      r.angle += r.omega * dt;
      if (Math.abs(r.omega) < ROULETTE_STOP) {
        r.omega = 0;
        if (r.hasSpun) {
          r.stillT += dt;
          if (r.stillT > 0.28) this.ResolveRoulette();
        }
      } else {
        r.stillT = 0;
      }
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
    r.phase = "exit";
    r.exitT = 0;
    r.result = seg;
    r.pendingKind = seg.kind;
    r.resultHold = Math.max(1.35, ((POWER_FX[seg.kind]?.dur) || 1.1) + 0.35);
    r.omega = 0;
    r.pulling = false;
    r.pointerId = null;
    r.pull = 0;
    r.pullVel = 0;
    // Toast while flying out — FX starts after the wheel clears.
    this.ShowBuffToast(`${seg.tier === "ultra" ? "超" : seg.tier === "bad" ? "负" : "好"} · ${seg.label}`);
  }

  /** Enter / exit motion for the wheel chrome (dim + transform). */
  RouletteMotion(r) {
    if (!r || r.phase === "result") return null;
    if (r.phase === "enter") {
      const u = Clamp(r.enterT / ROULETTE_ENTER_DUR, 0, 1);
      const e = EaseOutBack(u);
      return {
        offsetY: (1 - e) * (CANVAS_H * 0.62),
        scale: 0.28 + 0.72 * e,
        alpha: Clamp(u * 1.35, 0, 1),
        dim: 0.72 * Clamp(u * 1.2, 0, 1),
      };
    }
    if (r.phase === "exit") {
      const u = Clamp(r.exitT / ROULETTE_EXIT_DUR, 0, 1);
      const e = EaseInCubic(u);
      return {
        offsetY: -e * (CANVAS_H * 0.78),
        scale: 1 - 0.55 * e,
        alpha: 1 - e,
        dim: 0.72 * (1 - e),
      };
    }
    return { offsetY: 0, scale: 1, alpha: 1, dim: 0.72 };
  }

  CloseRoulette() {
    this.roulette = null;
    if (this.state === "roulette") this.state = "playing";
    this.lastTs = 0;
    this.SyncTouchControlsVisibility();
  }

  ApplyPowerup(kind) {
    this.audio.Power();
    this.PlayPowerFx(kind);
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
        this.ShowBuffToast(p?.power >= 3 ? "火力满了，顺带狂射一阵" : "火力升级");
        break;
      case POWER.gun:
        if (p) {
          p.power = 3;
          p.maxBullets = Math.max(p.maxBullets, 3);
        }
        this.overdriveTimer = Math.max(this.overdriveTimer, 10);
        this.ShowBuffToast("破钢弹：能打钢墙，射速加快");
        break;
      case POWER.life:
        this.lives += 2;
        this.ShowBuffToast("生命 +2");
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
        this.KillAllFieldEnemies({ spareBoss: true });
        this.NukeBricks(0.45);
        this.SpawnBrickDebris(18);
        this.ShowBuffToast("炸清场上敌军，掀掉一些砖");
        break;
      case POWER.shovel:
        this.shovelTimer = 22;
        this.pendingFortRestore = false;
        this.FortifyBase(true);
        this.ShowBuffToast("老家钢墙加固 22 秒");
        break;
      case POWER.antigrav:
        this.antigravTimer = 18;
        this.ShowBuffToast("反坠 18 秒：炮弹不那么往下掉");
        break;
      case POWER.bounce:
        this.bounceTimer = 20;
        this.ShowBuffToast("弹跳弹 20 秒");
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
        this.ShowBuffToast("幽灵穿墙 16 秒：砖墙钢墙都能钻");
        break;
      case POWER.mirror:
        this.mirrorTimer = 18;
        this.ShowBuffToast("双炮 18 秒：背后也开火");
        break;
      case POWER.magnet:
        this.magnetTimer = 18;
        this.ShowBuffToast("追踪弹 18 秒");
        break;
      case POWER.warp:
        this.WarpPlayer();
        if (p) p.protect = Math.max(p.protect, 5);
        this.ShowBuffToast("闪现到别处 + 短护盾");
        break;
      case POWER.fork:
        this.forkTimer = 16;
        this.spreadTimer = 0;
        this.ShowBuffToast("一次三发 16 秒");
        break;
      case POWER.rapid:
        this.rapidTimer = 14;
        if (p) p.maxBullets = Math.max(p.maxBullets, 3);
        this.ShowBuffToast("射速加快 14 秒");
        break;
      case POWER.pierce:
        this.pierceTimer = 14;
        this.ShowBuffToast("穿透弹：可打穿敌坦 14 秒");
        break;
      case POWER.spread:
        this.spreadTimer = 14;
        this.forkTimer = 0;
        this.ShowBuffToast("散射：大角度三发 14 秒");
        break;
      case POWER.sniper:
        this.sniperTimer = 12;
        if (p) p.power = Math.max(p.power, 3);
        this.ShowBuffToast("狙击弹：飞得快、掉得少、伤得高 12 秒");
        break;
      case POWER.nuke:
        this.KillAllFieldEnemies({ spareBoss: true });
        this.NukeBricks(0.92);
        this.SpawnBrickDebris(36);
        this.SpawnMeteorRain(6);
        if (p) {
          p.protect = Math.max(p.protect, 10);
          p.power = 3;
          p.maxBullets = Math.max(p.maxBullets, 3);
        }
        this.ShowBuffToast("大爆炸：清场 + 掀砖 + 陨石");
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
        this.ShowBuffToast("狂射：四联开火 24 秒");
        break;
      case POWER.apocalypse:
        this.freezeTimer = 18;
        this.KillAllFieldEnemies({ spareBoss: true });
        this.NukeBricks(0.7);
        this.SpawnBrickDebris(48);
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
        this.ShowBuffToast("无敌：几乎打不死你 22 秒");
        break;
      case POWER.steelRain:
        this.SpawnMeteorRain(22, { power: 3 });
        if (p) p.protect = Math.max(p.protect, 6);
        this.ShowBuffToast("钢雨：破钢陨石 ×22");
        break;
      case POWER.fortress: {
        // If eagle is out (sortie / stroll), bring it home first so we can seal properly.
        if (this.eagleStroll) this.ReturnEagleHome();
        if (this.eagleAlly) this.EndEagleAlly();
        this.shovelTimer = Math.max(this.shovelTimer, 36);
        this.pendingFortRestore = false;
        this.FortifyBase(true);
        if (p) p.protect = Math.max(p.protect, 18);
        this.freezeTimer = Math.max(this.freezeTimer, 6);
        this.ShowBuffToast("加钢墙：老家围上钢墙 + 你自己护盾");
        break;
      }
      case POWER.phoenix:
        this.lives += 2;
        if (p) {
          p.protect = Math.max(p.protect, 14);
          p.power = Math.max(p.power, 2);
          p.maxBullets = Math.max(p.maxBullets, 2);
        }
        this.FortifyBase(true);
        this.shovelTimer = Math.max(this.shovelTimer, 16);
        this.ShowBuffToast("续命：命+2、护盾、老家钢墙");
        break;
      case POWER.arsenal:
        if (p) {
          p.power = 3;
          p.maxBullets = 4;
          p.protect = Math.max(p.protect, 8);
        }
        this.overdriveTimer = Math.max(this.overdriveTimer, 18);
        this.rapidTimer = Math.max(this.rapidTimer, 16);
        this.pierceTimer = Math.max(this.pierceTimer, 16);
        this.forkTimer = Math.max(this.forkTimer, 14);
        this.spreadTimer = 0;
        this.bounceTimer = Math.max(this.bounceTimer, 12);
        this.ShowBuffToast("弹海：狂射 + 三发 + 穿透");
        break;
      case POWER.eagleAlly:
        this.StartEagleAlly(16);
        break;
      case POWER.giant:
        this.StartGiantForm(GIANT_DURATION);
        break;
      case POWER.spawnExtra:
        this.ForceSpawnExtras(4);
        this.ShowBuffToast("⚠ 敌军多来 4 辆");
        break;
      case POWER.enemyShield:
        for (const e of this.enemies) {
          if (e.alive) e.protect = Math.max(e.protect || 0, 14);
        }
        this.ShowBuffToast("⚠ 敌军全员有盾");
        break;
      case POWER.heavyCurse:
        this.heavyCurseTimer = 14;
        this.antigravTimer = 0;
        this.ShowBuffToast("⚠ 弹更坠：你的炮弹掉得更狠");
        break;
      case POWER.enemyRage:
        this.enemyRageTimer = 12;
        this.ShowBuffToast("⚠ 敌加速：敌军更快更凶");
        break;
      case POWER.softStun:
        this.playerStunTimer = 2.8;
        this.ShowBuffToast("⚠ 动不了！先扛着");
        break;
      case POWER.fortBreak:
        this.BreakBaseFort();
        this.ShowBuffToast("⚠ 老家钢墙被拆了");
        break;
      case POWER.eagleStroll:
        this.StartEagleStroll(18);
        break;
      default:
        break;
    }
    this.UpdateHud();
  }

  KillAllFieldEnemies({ spareBoss = false } = {}) {
    for (const e of this.enemies) {
      if (!e.alive || e.spawnFlash > 0) continue;
      if (spareBoss && e.isBoss) continue;
      e.hp = 0;
      e.alive = false;
      e.deathTimer = 0.01;
      this.score += e.score;
      this.SpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 1.1);
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

  SpawnMeteorRain(count = 6, opts = {}) {
    const owner = this.player;
    const power = opts.power ?? Math.max(2, owner?.power || 2);
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
        power,
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
    // Always place walls. Skipping occupied cells left permanent holes in the fort
    // when a tank stood on the ring — shove tanks out after placing.
    for (const [x, y] of cells) {
      if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
      if (this.map[y][x] === TILE_BASE || this.map[y][x] === TILE_BASE_DEAD) continue;
      if (steel) {
        this.map[y][x] = TILE_STEEL;
        if (this.brickMask[y]) this.brickMask[y][x] = 0;
      } else {
        this.SetBrickCell(x, y, true);
      }
    }
    if (this.player?.alive) this.UnstickTank(this.player, { maxDist: 64 });
    for (const e of this.enemies) {
      if (e.alive) this.UnstickTank(e, { maxDist: 64 });
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
    // Place brick fort back; shove tanks out afterward (same hole-bug as FortifyBase).
    const cells = this.GetBaseFortCells();
    for (const [x, y] of cells) {
      if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
      if (this.map[y][x] === TILE_BASE || this.map[y][x] === TILE_BASE_DEAD) continue;
      this.SetBrickCell(x, y, true);
    }
    if (this.player?.alive) this.UnstickTank(this.player, { maxDist: 64 });
    for (const e of this.enemies) {
      if (e.alive) this.UnstickTank(e, { maxDist: 64 });
    }
    return true;
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
    return {
      x,
      y,
      w: size,
      h: size,
      dir: this.IsBaseAtTop() ? "up" : "down",
      speed: type.speed,
      hp: type.hp,
      maxHp: type.hp,
      score: type.score,
      shootCd: type.shootCd,
      bulletBoost: type.bulletBoost || 1,
      typeId: type.id,
      texture: type.texture,
      alive: true,
      fireCd: type.boss ? 1.6 * this.GetBossFireCdScale({ fireIntervalMul: type.fireIntervalMul ?? 1 }) : 0.8,
      normalFireCd: type.boss ? 0.9 : 0,
      skillWindup: 0,
      pendingPattern: null,
      skillWarn: null,
      aiTimer: 0.3,
      spawnFlash: type.boss ? 0.6 : 1.0,
      protect: type.boss ? 1.2 : 0,
      dropsPower: type.boss
        ? false
        : (type.id === "armor" || Math.random() < this.GetPowerDropRate() || (this.isBossStage && Math.random() < 0.35)),
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
      finalBurstUsed: false,
      finalPhase: false,
      bossDropMarks: type.boss ? [0.66, 0.33] : null,
      barrelCount: type.barrelCount ?? this.stageData?.barrelCount ?? (type.tankKing ? 4 : 0),
      barrelFlash: Object.fromEntries(DIR_OCTO.map((d) => [d, 0])),
    };
  }

  SpawnExplosion(x, y, scale = 1, opts = {}) {
    this.explosions.push({
      x,
      y,
      t: 0,
      dur: opts.dur ?? (0.35 + scale * 0.1),
      scale,
      ring: !!opts.ring,
      flash: !!opts.flash,
    });
  }

  /** Kick off NES-flavored FX for any roulette / ultra power. */
  PlayPowerFx(kind) {
    const spec = POWER_FX[kind];
    if (!spec) return;
    if (spec.style === "blast") {
      this.PlayBlastFx(kind, spec);
      return;
    }

    this.screenFx = {
      kind,
      style: spec.style,
      label: spec.label,
      tint: spec.tint,
      t: 0,
      dur: spec.dur,
      shake: spec.shake || 0,
      fullscreen: !!spec.fullscreen,
      flashFrames: spec.flashFrames || 10,
    };
    this.SpawnPowerFxBurst(kind, spec);
  }

  /** NES-flavored ultra blast: shake + frame flash + sheet explosion rings + brick chips. */
  PlayBlastFx(kind = "nuke", specIn = null) {
    const spec = specIn || POWER_FX[kind] || {
      dur: 1.4, shake: 12, rings: 3, blastN: 14, flashFrames: 14, label: "爆破", tint: "#ffe08a",
    };

    this.screenFx = {
      kind,
      style: "blast",
      label: spec.label || "爆破",
      tint: spec.tint || "#ffe08a",
      t: 0,
      dur: spec.dur,
      shake: spec.shake,
      fullscreen: true,
      flashFrames: spec.flashFrames || 12,
      rings: spec.rings || 3,
    };

    const cx = CANVAS_W * 0.5;
    const cy = CANVAS_H * 0.42;
    this.SpawnExplosion(cx, cy, 2.4, { dur: 0.55, flash: true });
    this.SpawnExplosion(cx - 18, cy + 8, 1.6, { dur: 0.5 });
    this.SpawnExplosion(cx + 18, cy + 8, 1.6, { dur: 0.5 });

    const ringCount = spec.rings || 3;
    for (let ring = 0; ring < ringCount; ring++) {
      const n = 6 + ring * 2;
      const rad = 36 + ring * 34;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + ring * 0.22;
        this.fxBlastQueue.push({
          delay: 0.05 + ring * 0.09 + i * 0.012,
          x: cx + Math.cos(ang) * rad,
          y: cy + Math.sin(ang) * rad * 0.72,
          scale: 1.15 + ring * 0.18,
          ring: true,
        });
      }
    }

    const blastN = spec.blastN || 14;
    for (let i = 0; i < blastN; i++) {
      this.fxBlastQueue.push({
        delay: 0.12 + Math.random() * (spec.dur * 0.55),
        x: 20 + Math.random() * (CANVAS_W - 40),
        y: 24 + Math.random() * (CANVAS_H - 60),
        scale: 0.7 + Math.random() * 1.1,
      });
    }
  }

  /** Style-specific spark / mark bursts anchored on player, HQ, or field. */
  SpawnPowerFxBurst(kind, spec) {
    if (!this.fxDebris) this.fxDebris = [];
    if (!this.fxMarks) this.fxMarks = [];
    const p = this.player;
    const px = p ? p.x + p.w * 0.5 : CANVAS_W * 0.5;
    const py = p ? p.y + p.h * 0.5 : CANVAS_H * 0.55;
    const tint = spec.tint || "#ffe08a";
    const hq = this.GetBaseTarget?.() || { x: CANVAS_W * 0.5, y: CANVAS_H - 24 };

    const spark = (x, y, colors, n = 10, speed = 140) => {
      for (let i = 0; i < n; i++) {
        const s = 2 + Math.floor(Math.random() * 4);
        const ang = Math.random() * Math.PI * 2;
        const spd = speed * (0.4 + Math.random());
        this.fxDebris.push({
          x, y, w: s, h: s,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 40,
          life: 0.45 + Math.random() * 0.45,
          ttl: 0.45 + Math.random() * 0.45,
          color: colors[Math.floor(Math.random() * colors.length)],
          grav: 280,
        });
      }
    };

    const mark = (type, opts) => {
      this.fxMarks.push({
        type,
        ttl: opts.ttl ?? 0.9,
        life: opts.ttl ?? 0.9,
        color: opts.color || tint,
        x: opts.x ?? px,
        y: opts.y ?? py,
        x2: opts.x2,
        y2: opts.y2,
        r: opts.r || 20,
        text: opts.text,
      });
    };

    switch (spec.style) {
      case "buff":
      case "weapon":
      case "ultra":
        spark(px, py, [tint, "#ffffff", "#ffe080"], spec.style === "ultra" ? 22 : 14, 180);
        this.SpawnExplosion(px, py, spec.style === "ultra" ? 1.8 : 1.1, { flash: true, dur: 0.4 });
        break;
      case "life":
        spark(px, py, ["#70ff98", "#ffffff", "#40c060"], 16, 120);
        for (let i = 0; i < 4; i++) {
          mark("plus", { x: px + (i - 1.5) * 22, y: py - 10 - i * 8, ttl: 0.9 + i * 0.05, color: "#70ff98" });
        }
        break;
      case "shield":
        spark(px, py, ["#80c8ff", "#ffffff", "#4080c0"], 12, 100);
        mark("ring", { x: px, y: py, r: 28, ttl: 1.0, color: "#80c8ff" });
        mark("ring", { x: px, y: py, r: 42, ttl: 0.85, color: "#a0d8ff" });
        break;
      case "armor":
        spark(px, py, ["#d0d0d0", "#f0d060", "#808080"], 14, 110);
        mark("plate", { x: px, y: py, ttl: 1.0, color: tint });
        break;
      case "freeze":
        for (let i = 0; i < 28; i++) {
          spark(
            16 + Math.random() * (CANVAS_W - 32),
            20 + Math.random() * (CANVAS_H - 40),
            ["#a0e8ff", "#ffffff", "#60b0e0"],
            1,
            40,
          );
        }
        break;
      case "fort":
        spark(hq.x, hq.y, ["#c0c0c0", "#ffffff", "#808080"], 18, 130);
        mark("ring", { x: hq.x, y: hq.y, r: 36, ttl: 1.0, color: "#d0d0d0" });
        mark("ring", { x: hq.x, y: hq.y, r: 48, ttl: 0.85, color: "#a0a0a0" });
        // No HQ explosion — looked like the fort was being blown open.
        break;
      case "fortBreak":
        spark(hq.x, hq.y, ["#ff8060", "#b05028", "#603018"], 22, 160);
        this.SpawnBrickDebris(20);
        this.SpawnExplosion(hq.x, hq.y, 1.5, { flash: true });
        break;
      case "antigrav":
        for (let i = 0; i < 18; i++) {
          mark("arrowUp", {
            x: 24 + Math.random() * (CANVAS_W - 48),
            y: CANVAS_H - 30 - Math.random() * 80,
            ttl: 0.7 + Math.random() * 0.4,
            color: tint,
          });
        }
        spark(px, py, [tint, "#ffffff"], 10, 90);
        break;
      case "bounce":
        spark(px, py, [tint, "#ffffff"], 12, 150);
        mark("bounce", { x: px, y: py, ttl: 0.9, color: tint });
        break;
      case "meteor":
        for (let i = 0; i < 10; i++) {
          mark("meteor", {
            x: 30 + Math.random() * (CANVAS_W - 60),
            y: -10 - Math.random() * 40,
            x2: 20 + Math.random() * 40,
            y2: 80 + Math.random() * 60,
            ttl: 0.7 + Math.random() * 0.35,
            color: "#ff8040",
          });
        }
        break;
      case "ghost":
        spark(px, py, ["#c0e0ff", "#ffffff"], 10, 70);
        mark("ring", { x: px, y: py, r: 34, ttl: 0.9, color: "#c0e0ff" });
        break;
      case "mirror":
        spark(px, py, [tint, "#ffffff"], 12, 120);
        mark("mirror", { x: px, y: py, ttl: 1.0, color: tint });
        break;
      case "magnet":
        for (const e of this.enemies) {
          if (!e.alive) continue;
          mark("beam", {
            x: px, y: py,
            x2: e.x + e.w * 0.5,
            y2: e.y + e.h * 0.5,
            ttl: 0.85,
            color: tint,
          });
        }
        spark(px, py, [tint, "#ffffff"], 8, 90);
        break;
      case "warp":
        spark(px, py, ["#ffffff", "#c0e0ff", "#80c8ff"], 20, 200);
        this.SpawnExplosion(px, py, 1.4, { flash: true, dur: 0.35 });
        break;
      case "giant":
        spark(px, py, [tint, "#ffffff"], 18, 160);
        mark("ring", { x: px, y: py, r: 24, ttl: 1.1, color: tint });
        mark("ring", { x: px, y: py, r: 48, ttl: 1.0, color: "#ffe080" });
        mark("ring", { x: px, y: py, r: 72, ttl: 0.85, color: "#f0d060" });
        break;
      case "curse":
        spark(px, py, [tint, "#600000", "#ff8080"], 16, 140);
        for (const e of this.enemies) {
          if (!e.alive) continue;
          spark(e.x + e.w * 0.5, e.y + e.h * 0.5, [tint, "#ff6060"], 4, 80);
        }
        break;
      case "stun":
        spark(px, py, [tint, "#ffffff"], 14, 100);
        for (let i = 0; i < 5; i++) {
          mark("star", {
            x: px + Math.cos(i * 1.25) * 28,
            y: py + Math.sin(i * 1.25) * 20 - 8,
            ttl: 0.85,
            color: tint,
          });
        }
        break;
      case "eagle":
        spark(hq.x, hq.y, [tint, "#ffffff", "#ffd0d0"], 16, 120);
        mark("ring", { x: hq.x, y: hq.y, r: 40, ttl: 1.1, color: tint });
        break;
      default:
        spark(px, py, [tint, "#ffffff"], 10, 120);
        break;
    }
  }

  SpawnBrickDebris(count = 24) {
    if (!this.fxDebris) this.fxDebris = [];
    const colors = ["#b05028", "#d87838", "#804020", "#e8a050", "#603018"];
    for (let i = 0; i < count; i++) {
      const x = 16 + Math.random() * (CANVAS_W - 32);
      const y = 24 + Math.random() * (CANVAS_H * 0.7);
      const s = 3 + Math.floor(Math.random() * 5);
      this.fxDebris.push({
        x,
        y,
        w: s,
        h: s,
        vx: (Math.random() - 0.5) * 220,
        vy: -80 - Math.random() * 160,
        life: 0.55 + Math.random() * 0.7,
        ttl: 0.55 + Math.random() * 0.7,
        color: colors[Math.floor(Math.random() * colors.length)],
        grav: 420,
      });
    }
  }

  UpdateScreenFx(dt) {
    if (this.fxBlastQueue?.length) {
      const keep = [];
      for (const blast of this.fxBlastQueue) {
        blast.delay -= dt;
        if (blast.delay <= 0) {
          this.SpawnExplosion(blast.x, blast.y, blast.scale, {
            dur: 0.32 + blast.scale * 0.08,
            ring: blast.ring,
          });
        } else {
          keep.push(blast);
        }
      }
      this.fxBlastQueue = keep;
    }

    if (this.fxDebris?.length) {
      for (const d of this.fxDebris) {
        d.ttl -= dt;
        d.vy += (d.grav ?? 420) * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vx *= 0.985;
      }
      this.fxDebris = this.fxDebris.filter((d) => d.ttl > 0 && d.y < CANVAS_H + 20);
    }

    if (this.fxMarks?.length) {
      for (const m of this.fxMarks) {
        m.ttl -= dt;
        if (m.type === "arrowUp") m.y -= 70 * dt;
        if (m.type === "meteor") {
          m.x += (m.x2 || 30) * dt;
          m.y += (m.y2 || 90) * dt;
        }
        if (m.type === "plus") m.y -= 40 * dt;
      }
      this.fxMarks = this.fxMarks.filter((m) => m.ttl > 0);
    }

    if (this.screenFx) {
      this.screenFx.t += dt;
      if (this.screenFx.t >= this.screenFx.dur) this.screenFx = null;
    }
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

    ctx.save();
    if (this.screenFx) {
      const u = Clamp(1 - this.screenFx.t / this.screenFx.dur, 0, 1);
      const amp = this.screenFx.shake * u;
      // Integer pixel shake — keeps the NES nearest-neighbor look.
      const sx = Math.round((Math.random() * 2 - 1) * amp);
      const sy = Math.round((Math.random() * 2 - 1) * amp * 0.75);
      ctx.translate(sx, sy);
    }

    this.DrawGround(ctx);
    this.DrawTiles(ctx, false); // non-grass
    this.DrawBase(ctx);
    if (this.eagleAlly) this.DrawEagleAlly(ctx);
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
    this.DrawFxDebris(ctx);
    this.DrawFxMarks(ctx);
    // Screen FX under the wheel while spinning; after fly-out redraw on top so fullscreen reads.
    this.DrawScreenFxOverlay(ctx);
    ctx.restore();

    // gravity hint arc when aiming sideways/up (playing only)
    if (this.state === "playing" && this.player?.alive) this.DrawAimGhost(ctx);
    this.DrawBuffHud(ctx);
    if (this.state === "playing" && this.isTutorial) this.DrawTutorialHint(ctx);
    if (this.state === "playing" && this.isBarricadeTeach) this.DrawBarricadeTeachHint(ctx);
    if (this.state === "roulette") this.DrawRoulette(ctx);
    if (this.state === "roulette" && this.roulette?.phase === "result") this.DrawScreenFxOverlay(ctx);
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
          kind === "tankMan" ? "拆炮 · 定时炸弹 · 无重力狙击" :
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
    if (this.eagleAlly && this.baseAlive) {
      // Empty nest — eagle is out on sortie.
      ctx.fillStyle = "#0c0c12";
      ctx.fillRect(nestX, nestY, TILE * 2, TILE * 2);
      ctx.strokeStyle = "#3a3a48";
      ctx.lineWidth = 2;
      ctx.strokeRect(nestX + 1, nestY + 1, TILE * 2 - 2, TILE * 2 - 2);
      ctx.fillStyle = "#2a2a34";
      ctx.fillRect(nestX + 6, nestY + 6, TILE * 2 - 12, TILE * 2 - 12);
      return;
    }

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

  DrawEagleAlly(ctx) {
    const e = this.eagleAlly;
    if (!e || !this.baseAlive) return;
    const [gx, gy] = TILE_SHEET.baseAlive;
    const bob = Math.sin(e.animTick * 0.9) * 2;
    const pulse = 0.7 + 0.3 * Math.abs(Math.sin(this.frame * 0.22));
    ctx.save();
    ctx.globalAlpha = pulse;
    this.BlitGrid(ctx, gx, gy, e.x, e.y + bob, e.w, e.h, 2, 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(255,224,96,${0.45 + 0.4 * pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(e.x - 1, e.y + bob - 1, e.w + 2, e.h + 2);
    // Missile hardpoints flash
    if (e.fireCd > 0.35) {
      ctx.fillStyle = "#ffe060";
      ctx.fillRect(Math.round(e.x + e.w * 0.5 - 2), Math.round(e.y + e.h + bob), 4, 5);
    }
    ctx.restore();
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

  DrawTank(ctx, tank, isPlayer) {
    if (tank.spawnFlash > 0) {
      const frames = FX_SHEET.spawn;
      const idx = Math.min(frames.length - 1, Math.floor((1 - tank.spawnFlash) * frames.length));
      const [gx, gy] = frames[idx];
      this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);
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

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(tank.x + 8, tank.y + tank.h - 6, tank.w - 16, 5);

    ctx.fillStyle = "#3a3020";
    ctx.fillRect(cx - legSpread - 5, cy + 8, 10, 22 + legKick);
    ctx.fillRect(cx + legSpread - 5, cy + 8, 10, 22 - legKick);
    ctx.fillStyle = "#c0a040";
    ctx.fillRect(cx - legSpread - 6, cy + 26 + legKick, 12, 6);
    ctx.fillRect(cx + legSpread - 6, cy + 26 - legKick, 12, 6);

    const { gx, gy } = this.TankSheetOrigin(tank, false);
    this.BlitGrid(ctx, gx, gy, tank.x + 6, tank.y + 2, tank.w - 12, tank.h - 18);

    ctx.fillStyle = "#d0b050";
    ctx.beginPath();
    ctx.arc(cx, tank.y + 12, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#201808";
    ctx.fillRect(cx - 6, tank.y + 8, 5, 4);
    ctx.fillRect(cx + 2, tank.y + 8, 5, 4);

    this.DrawBossBarrels(ctx, tank);

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
      ctx.fillStyle = lit ? "#fff0a0" : king ? "#f0c050" : "#c8d0d8";
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

    // Skill telegraph: pulse ring on boss + warn under HP bar.
    if ((boss.skillWindup || 0) > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.018);
      const cx = boss.x + boss.w / 2;
      const cy = boss.y + boss.h / 2;
      const radius = Math.max(boss.w, boss.h) * (0.62 + 0.12 * pulse);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.strokeStyle = "#ffcc44";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.2 + 0.25 * pulse;
      ctx.fillStyle = "#ffaa22";
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (boss.skillWarn) {
        ctx.fillStyle = `rgba(0,0,0,${0.55 + 0.25 * pulse})`;
        ctx.font = `11px ${PIXEL_FONT}`;
        const tw = ctx.measureText(boss.skillWarn).width + 16;
        ctx.fillRect((CANVAS_W - tw) / 2, y + barH + 6, tw, 18);
        ctx.fillStyle = "#ffcc44";
        ctx.textBaseline = "middle";
        ctx.fillText(boss.skillWarn, CANVAS_W / 2, y + barH + 15);
      }
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  DrawBullet(ctx, b) {
    if (b.trail.length > 1) {
      ctx.strokeStyle = b.meteor
        ? "rgba(255,120,40,0.55)"
        : b.sniper
          ? "rgba(120,220,255,0.7)"
          : b.eagleMissile
            ? "rgba(255,224,96,0.7)"
            : b.isPlayer
              ? (b.homing ? "rgba(255,120,160,0.45)" : "rgba(255,220,120,0.35)")
              : b.bossShell
                ? "rgba(255,180,80,0.45)"
                : "rgba(255,120,100,0.3)";
      ctx.lineWidth = b.meteor || b.sniper || b.bossShell || b.eagleMissile ? 3 : 2;
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
        ctx.fillStyle = "#3a1808";
        ctx.fillRect(-9, -3, 18, 6);
        ctx.fillStyle = "#ff9040";
        ctx.fillRect(-8, -2, 16, 4);
        ctx.fillStyle = "#ffe0a0";
        ctx.fillRect(2, -1, 6, 2);
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
    const motion = this.RouletteMotion(r);
    // After fly-out: leave the canvas clear so fullscreen power FX can read.
    if (!motion) return;

    const touch = this.isTouchDevice;
    const segs = this.RouletteSegments();
    const n = Math.max(1, segs.length);
    const slice = (Math.PI * 2) / n;
    const needleIdx = this.RouletteIndexAtNeedle();
    const under = segs[needleIdx] || segs[0];
    const focus = r.result || under;
    const wheelImg = this.images.rouletteWheel;
    const needle = this.images.rouletteNeedle;
    const rad = r.radius;
    const bannerH = touch ? 44 : 28;
    const bannerY = touch ? 8 : 10;
    const labelPx = touch ? 18 : 14;
    const bannerPx = touch ? 18 : 13;
    const hintPx = touch ? 14 : 11;
    const legendPx = touch ? 13 : 10;
    const hubR = touch ? 22 : 16;
    const hubPx = touch ? 15 : 11;
    const ox = 0;
    const oy = motion.offsetY;
    const sc = motion.scale;
    const alpha = motion.alpha;

    const muted = (tier, focusSeg) => {
      if (tier === "good") return focusSeg ? "rgba(48,140,88,0.97)" : "rgba(28,88,52,0.94)";
      if (tier === "ultra") return focusSeg ? "rgba(188,148,40,0.97)" : "rgba(120,88,24,0.94)";
      return focusSeg ? "rgba(168,56,56,0.97)" : "rgba(112,36,36,0.94)";
    };

    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${Clamp(motion.dim, 0, 0.85)})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;

    // Result strip — taller + larger type on touch so CJK stays readable.
    ctx.fillStyle = focus.bg;
    ctx.fillRect(20, bannerY + oy * 0.35, CANVAS_W - 40, bannerH);
    ctx.strokeStyle = focus.rim || focus.color;
    ctx.lineWidth = touch ? 3 : 2;
    ctx.strokeRect(20, bannerY + oy * 0.35, CANVAS_W - 40, bannerH);
    const iconSize = touch ? 22 : 16;
    const iconCx = touch ? 48 : 44;
    const iconCy = bannerY + oy * 0.35 + bannerH / 2;
    this.DrawPowerIcon(ctx, focus.kind, iconCx, iconCy, iconSize);
    ctx.fillStyle = focus.color;
    ctx.font = `${bannerPx}px ${PIXEL_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tag = focus.tier === "ultra" ? "超 " : focus.tier === "bad" ? "负 " : "好 ";
    ctx.fillText(`${tag}${focus.label}`, iconCx + iconSize / 2 + 10, iconCy);
    ctx.textBaseline = "alphabetic";

    ctx.save();
    ctx.translate(r.cx + ox, r.cy + oy);
    ctx.scale(sc, sc);

    // Soft shadow only
    ctx.beginPath();
    ctx.arc(2, 3, rad + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    ctx.rotate(r.angle);

    // Rim texture underlay (aligned 10-slice bake); segment fills overwrite colors to match prizes.
    if (wheelImg) {
      const diam = rad * 2 + 10;
      ctx.globalAlpha = alpha * 0.35;
      ctx.drawImage(wheelImg, -diam / 2, -diam / 2, diam, diam);
      ctx.globalAlpha = alpha;
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

    // Labels: screen-upright at wedge midpoints (no radial spin — CJK stays readable).
    for (let i = 0; i < n; i++) {
      const seg = segs[i];
      const mid = i * slice + slice * 0.5;
      const isFocus = i === needleIdx;
      const dist = rad * (touch ? 0.62 : 0.64);
      const lx = Math.cos(mid) * dist;
      const ly = Math.sin(mid) * dist;
      ctx.save();
      ctx.translate(lx, ly);
      // Cancel wheel rotation so glyph baselines stay horizontal on screen.
      ctx.rotate(-r.angle);
      ctx.font = `bold ${labelPx}px ${PIXEL_FONT}`;
      const textW = ctx.measureText(seg.label).width;
      const padX = touch ? 8 : 6;
      const tw = Math.max(touch ? 44 : 32, textW + padX * 2);
      const th = touch ? 24 : 18;
      ctx.fillStyle = isFocus ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.84)";
      ctx.fillRect(-tw / 2, -th / 2, tw, th);
      ctx.strokeStyle = isFocus ? (seg.rim || seg.color) : "rgba(255,255,255,0.35)";
      ctx.lineWidth = isFocus ? 2 : 1;
      ctx.strokeRect(-tw / 2 + 0.5, -th / 2 + 0.5, tw - 1, th - 1);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Hard black outline then bright fill — readable on green/gold/red wedges.
      ctx.lineWidth = touch ? 4 : 3;
      ctx.strokeStyle = "#000";
      ctx.lineJoin = "round";
      ctx.strokeText(seg.label, 0, 1);
      ctx.fillStyle = isFocus ? "#fff8d0" : "#ffffff";
      ctx.fillText(seg.label, 0, 1);
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

    // Slim needle — tip lands on rim at top (follow wheel transform).
    const needleCx = r.cx + ox;
    const needleCy = r.cy + oy;
    const ny = needleCy - rad * sc;
    const needleW = (touch ? 28 : 20) * sc;
    const needleH = (touch ? 40 : 32) * sc;
    if (needle) {
      ctx.drawImage(needle, needleCx - needleW / 2, ny - needleH + 4 * sc, needleW, needleH);
    } else {
      ctx.fillStyle = "#e0c060";
      ctx.beginPath();
      ctx.moveTo(needleCx, ny + 2 * sc);
      ctx.lineTo(needleCx - 7 * sc, ny - 16 * sc);
      ctx.lineTo(needleCx + 7 * sc, ny - 16 * sc);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(160,168,176,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(needleCx, needleCy, rad * sc + 3, 0, Math.PI * 2);
    ctx.stroke();

    this.DrawRoulettePlunger(ctx, r, motion);

    if (r.phase === "spin" || r.phase === "enter") {
      const footY = CANVAS_H - (touch ? 28 : 18);
      const legendY = CANVAS_H - (touch ? 10 : 6);
      ctx.fillStyle = "#a8b0b8";
      ctx.font = `${hintPx}px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      let hint = "转轮就位…";
      if (r.phase === "spin") {
        if (Math.abs(r.omega) > ROULETTE_STOP) hint = "减速中…";
        else if (r.pulling || r.pull > 0.05) hint = "松手发射！";
        else hint = "右边下拉蓄力 · 松手转 / 空格";
      }
      ctx.fillText(hint, r.cx, footY);
      ctx.textAlign = "left";
      ctx.font = `${legendPx}px ${PIXEL_FONT}`;
      ctx.fillStyle = TIER_PALETTE.good.color;
      ctx.fillText("绿=好", 16, legendY);
      ctx.fillStyle = TIER_PALETTE.ultra.color;
      ctx.fillText("金=超", touch ? 90 : 70, legendY);
      ctx.fillStyle = TIER_PALETTE.bad.color;
      ctx.fillText("红=负", touch ? 170 : 120, legendY);
    }
    ctx.restore();
  }

  /** Pinball-style pull arc on the right — drag knob down to charge, release to spin. */
  DrawRoulettePlunger(ctx, r, motion) {
    if (!r || r.phase === "exit" || r.phase === "result") return;
    const g = this.RoulettePlungerGeom(r);
    if (!g) return;
    const oy = motion?.offsetY || 0;
    const sc = motion?.scale || 1;
    const alpha = motion?.alpha ?? 1;
    const touch = this.isTouchDevice;
    const charged = g.pull;
    const spinning = Math.abs(r.omega) > ROULETTE_STOP || r.hasSpun;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, oy);

    // Arc rail
    ctx.beginPath();
    ctx.arc(g.arcCx, g.arcCy, g.arcR * sc, g.ang0, g.ang1, false);
    ctx.strokeStyle = "rgba(40,40,48,0.95)";
    ctx.lineWidth = (touch ? 14 : 11) * sc;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.arcCx, g.arcCy, g.arcR * sc, g.ang0, g.ang1, false);
    ctx.strokeStyle = spinning ? "rgba(120,120,128,0.55)" : "rgba(180,188,200,0.85)";
    ctx.lineWidth = (touch ? 6 : 5) * sc;
    ctx.stroke();

    // Charge fill along the arc
    if (charged > 0.02) {
      const angFill = g.ang0 + (g.ang1 - g.ang0) * charged;
      ctx.beginPath();
      ctx.arc(g.arcCx, g.arcCy, g.arcR * sc, g.ang0, angFill, false);
      ctx.strokeStyle = charged >= ROULETTE_PULL_MIN ? "#ffe060" : "#c8c070";
      ctx.lineWidth = (touch ? 6 : 5) * sc;
      ctx.stroke();
    }

    // End caps
    for (const ang of [g.ang0, g.ang1]) {
      const ex = g.arcCx + Math.cos(ang) * g.arcR * sc;
      const ey = g.arcCy + Math.sin(ang) * g.arcR * sc;
      ctx.beginPath();
      ctx.arc(ex, ey, (touch ? 5 : 4) * sc, 0, Math.PI * 2);
      ctx.fillStyle = "#2a2a32";
      ctx.fill();
      ctx.strokeStyle = "#9098a0";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Knob
    const kx = g.arcCx + Math.cos(g.ang) * g.arcR * sc;
    const ky = g.arcCy + Math.sin(g.ang) * g.arcR * sc;
    const kr = g.knobR * sc;
    ctx.beginPath();
    ctx.arc(kx + 1.5 * sc, ky + 2 * sc, kr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    const hot = charged >= ROULETTE_PULL_MIN;
    ctx.fillStyle = spinning ? "#505058" : (r.pulling ? (hot ? "#ffe060" : "#d0d070") : "#e8e0c0");
    ctx.fill();
    ctx.strokeStyle = spinning ? "#808088" : "#202028";
    ctx.lineWidth = touch ? 3 : 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(kx - kr * 0.25, ky - kr * 0.25, kr * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();

    // Side label
    if (!spinning && r.phase === "spin") {
      ctx.fillStyle = "#c8d0d8";
      ctx.font = `${touch ? 11 : 9}px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lx = Math.min(CANVAS_W - 18, g.arcCx + g.arcR * sc + (touch ? 18 : 14));
      ctx.save();
      ctx.translate(lx, g.arcCy);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(r.pulling ? "蓄力" : "下拉", 0, 0);
      ctx.restore();
      ctx.textBaseline = "alphabetic";
    }

    ctx.restore();
  }

  DrawBuffHud(ctx) {
    const chips = [];
    if (this.antigravTimer > 0) chips.push({ t: `反坠 ${Math.ceil(this.antigravTimer)}`, c: "#b8f0ff" });
    if (this.bounceTimer > 0) chips.push({ t: `弹 ${Math.ceil(this.bounceTimer)}`, c: "#70ff98" });
    if (this.ghostTimer > 0) chips.push({ t: `幽 ${Math.ceil(this.ghostTimer)}`, c: "#70ff98" });
    if (this.mirrorTimer > 0) chips.push({ t: `双炮 ${Math.ceil(this.mirrorTimer)}`, c: "#70ff98" });
    if (this.magnetTimer > 0) chips.push({ t: `磁 ${Math.ceil(this.magnetTimer)}`, c: "#70ff98" });
    if (this.forkTimer > 0) chips.push({ t: `三发 ${Math.ceil(this.forkTimer)}`, c: "#70ff98" });
    if (this.rapidTimer > 0) chips.push({ t: `速 ${Math.ceil(this.rapidTimer)}`, c: "#70ff98" });
    if (this.pierceTimer > 0) chips.push({ t: `穿透 ${Math.ceil(this.pierceTimer)}`, c: "#70ff98" });
    if (this.spreadTimer > 0) chips.push({ t: `散 ${Math.ceil(this.spreadTimer)}`, c: "#70ff98" });
    if (this.sniperTimer > 0) chips.push({ t: `狙 ${Math.ceil(this.sniperTimer)}`, c: "#70ff98" });
    if (this.overdriveTimer > 0) chips.push({ t: `狂射 ${Math.ceil(this.overdriveTimer)}`, c: "#ffe060" });
    if (this.giantTimer > 0) {
      chips.push({ t: `巨大 ${Math.ceil(this.giantTimer)}·甲${this.giantHits}`, c: "#ffe060" });
    }
    if (this.heavyCurseTimer > 0) chips.push({ t: `弹坠 ${Math.ceil(this.heavyCurseTimer)}`, c: "#ff6060" });
    if (this.enemyRageTimer > 0) chips.push({ t: `敌加速 ${Math.ceil(this.enemyRageTimer)}`, c: "#ff6060" });
    if (this.playerStunTimer > 0) chips.push({ t: `动不了 ${Math.ceil(this.playerStunTimer)}`, c: "#ff6060" });
    if (this.eagleAlly) chips.push({ t: `鹰援 ${Math.ceil(this.eagleAlly.ttl)}`, c: "#ffe060" });
    if (this.freezeTimer > 0) chips.push({ t: `冻 ${Math.ceil(this.freezeTimer)}`, c: "#70ff98" });
    if ((this.absorbHits || 0) > 0) chips.push({ t: `装甲×${this.absorbHits}`, c: "#c8e0ff" });
    if (this.playerDisarmed) chips.push({ t: "无炮管·去捡", c: "#ff6060" });
    if (this.eagleStroll && this.baseAlive) {
      chips.push({ t: `老鹰跑 ${Math.ceil(this.eagleStroll.ttl)}`, c: "#ff6060" });
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

    // Big stroll banner so the mobile HQ fail condition is impossible to miss.
    if (this.eagleWarnT > 0 && this.state === "playing") {
      const alpha = Clamp(this.eagleWarnT / 0.55, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(40,0,0,0.78)";
      ctx.fillRect(16, CANVAS_H * 0.28, CANVAS_W - 32, 58);
      ctx.strokeStyle = "#ff6060";
      ctx.lineWidth = 2;
      ctx.strokeRect(16, CANVAS_H * 0.28, CANVAS_W - 32, 58);
      ctx.fillStyle = "#ffe060";
      ctx.font = `14px ${PIXEL_FONT}`;
      ctx.textAlign = "center";
      if (this.eagleStroll) {
        ctx.fillText("⚠ 老鹰自己跑出去了！", CANVAS_W / 2, CANVAS_H * 0.28 + 22);
        ctx.fillStyle = "#ff9090";
        ctx.font = `11px ${PIXEL_FONT}`;
        ctx.fillText("老家门开了 · 敌军会追它 · 被打中即失败", CANVAS_W / 2, CANVAS_H * 0.28 + 44);
      }
      ctx.textAlign = "left";
      ctx.restore();
    }

    if (this.buffToast && (this.state !== "roulette" || this.roulette?.phase === "result" || this.roulette?.phase === "exit")) {
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
    const grow = ex.t / Math.max(0.001, ex.dur);
    const size = 28 * ex.scale + 20 * grow;
    this.BlitGrid(ctx, gx, gy, ex.x - size / 2, ex.y - size / 2, size, size);

    // Extra NES pop: hard white core + pixel shock ring on big blasts.
    if (ex.flash || ex.scale >= 1.6) {
      const pulse = 1 - grow;
      ctx.save();
      ctx.globalAlpha = 0.55 * pulse;
      ctx.fillStyle = grow < 0.35 ? "#ffffff" : "#ffe060";
      const core = Math.max(4, size * 0.18);
      ctx.fillRect(Math.round(ex.x - core / 2), Math.round(ex.y - core / 2), Math.round(core), Math.round(core));
      if (ex.ring || ex.scale >= 2) {
        ctx.globalAlpha = 0.4 * pulse;
        ctx.strokeStyle = "#ffd040";
        ctx.lineWidth = 2;
        const r = size * (0.55 + grow * 0.55);
        ctx.strokeRect(Math.round(ex.x - r / 2), Math.round(ex.y - r / 2), Math.round(r), Math.round(r));
      }
      ctx.restore();
    }
  }

  DrawFxDebris(ctx) {
    if (!this.fxDebris?.length) return;
    for (const d of this.fxDebris) {
      ctx.globalAlpha = Clamp(d.ttl / Math.max(0.05, d.life), 0, 1);
      ctx.fillStyle = d.color;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.w, d.h);
    }
    ctx.globalAlpha = 1;
  }

  DrawFxMarks(ctx) {
    if (!this.fxMarks?.length) return;
    ctx.save();
    for (const m of this.fxMarks) {
      const a = Clamp(m.ttl / Math.max(0.05, m.life), 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = m.color;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      const x = Math.round(m.x);
      const y = Math.round(m.y);
      if (m.type === "ring") {
        const r = Math.round(m.r || 24);
        ctx.strokeRect(x - r, y - Math.round(r * 0.7), r * 2, Math.round(r * 1.4));
      } else if (m.type === "plus") {
        ctx.fillRect(x - 1, y - 6, 3, 13);
        ctx.fillRect(x - 6, y - 1, 13, 3);
      } else if (m.type === "plate") {
        ctx.fillStyle = "#000";
        ctx.fillRect(x - 14, y - 10, 28, 20);
        ctx.fillStyle = m.color;
        ctx.fillRect(x - 12, y - 8, 24, 16);
        ctx.fillStyle = "#101010";
        ctx.fillRect(x - 8, y - 3, 16, 6);
      } else if (m.type === "arrowUp") {
        ctx.fillRect(x - 1, y - 10, 3, 14);
        ctx.fillRect(x - 4, y - 10, 9, 3);
        ctx.fillRect(x - 3, y - 13, 7, 3);
      } else if (m.type === "bounce") {
        ctx.beginPath();
        ctx.moveTo(x - 10, y + 6);
        ctx.lineTo(x - 4, y - 2);
        ctx.lineTo(x + 2, y + 6);
        ctx.lineTo(x + 8, y - 4);
        ctx.stroke();
      } else if (m.type === "meteor") {
        ctx.fillRect(x - 2, y - 6, 4, 10);
        ctx.fillStyle = "#ffe080";
        ctx.fillRect(x - 1, y - 10, 2, 5);
      } else if (m.type === "mirror") {
        ctx.fillRect(x - 1, y - 16, 2, 32);
        ctx.globalAlpha = a * 0.45;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 18, y - 14, 14, 28);
        ctx.fillRect(x + 4, y - 14, 14, 28);
      } else if (m.type === "beam") {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(Math.round(m.x2), Math.round(m.y2));
        ctx.stroke();
        ctx.fillRect(Math.round(m.x2) - 2, Math.round(m.y2) - 2, 4, 4);
      } else if (m.type === "star") {
        ctx.fillRect(x - 1, y - 5, 3, 11);
        ctx.fillRect(x - 5, y - 1, 11, 3);
        ctx.fillRect(x - 3, y - 3, 7, 7);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Full-screen / local NES flash overlays keyed by power style. */
  DrawScreenFxOverlay(ctx) {
    const fx = this.screenFx;
    if (!fx) return;
    const u = fx.t / Math.max(0.001, fx.dur);
    const early = fx.t < (fx.flashFrames || 12) / 60;
    const style = fx.style || "blast";
    const tint = fx.tint || "#ffe08a";

    // Fullscreen color wash + CRT scan bands for big styles.
    const wantsWash = fx.fullscreen || style === "blast" || style === "ultra" || style === "freeze"
      || style === "ghost" || style === "curse" || style === "stun" || style === "antigrav"
      || style === "meteor" || style === "mirror" || style === "eagle" || style === "life";
    if (wantsWash && (early || (u < 0.5 && Math.floor(this.frame / 2) % 2 === 0))) {
      ctx.save();
      let wash = tint;
      if (style === "blast") {
        wash = fx.kind === "apocalypse" ? "#fff2a0" : (fx.kind === "nuke" ? "#fff8d0" : "#ffffff");
      } else if (style === "freeze") wash = "#a0e8ff";
      else if (style === "ghost") wash = "#d8e8ff";
      else if (style === "curse" || style === "eagle") wash = "#401010";
      else if (style === "life") wash = "#184028";
      else if (style === "antigrav") wash = "#103028";
      else if (style === "meteor") wash = "#401808";
      else if (style === "stun") wash = "#403010";
      else if (style === "ultra" || style === "giant") wash = "#302008";
      ctx.globalAlpha = early ? 0.5 : 0.2 * (1 - u / 0.5);
      if (style === "curse" || style === "eagle" || style === "meteor") ctx.globalAlpha *= 1.15;
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = style === "freeze" || style === "ghost" ? "#ffffff" : "#000";
      for (let y = 0; y < CANVAS_H; y += 8) {
        if (((y / 8) + this.frame) % 2 === 0) ctx.fillRect(0, y, CANVAS_W, 2);
      }
      ctx.restore();
    }

    // Ghost: horizontal wipe bar.
    if (style === "ghost" && u < 0.7) {
      const y = Math.round((u / 0.7) * CANVAS_H);
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - u / 0.7);
      ctx.fillStyle = "#c0e0ff";
      ctx.fillRect(0, y - 6, CANVAS_W, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, y - 2, CANVAS_W, 4);
      ctx.restore();
    }

    // Mirror: vertical split flash.
    if (style === "mirror" && u < 0.55) {
      ctx.save();
      ctx.globalAlpha = 0.4 * (1 - u / 0.55);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(CANVAS_W * 0.5 - 2, 0, 4, CANVAS_H);
      ctx.globalAlpha *= 0.7;
      ctx.fillRect(0, 0, CANVAS_W * 0.5 - 2, CANVAS_H);
      ctx.restore();
    }

    // Antigrav: rising scan dashes.
    if (style === "antigrav" && u < 0.75) {
      ctx.save();
      ctx.globalAlpha = 0.45 * (1 - u / 0.75);
      ctx.fillStyle = tint;
      const off = Math.floor(this.frame * 2) % 12;
      for (let x = 8; x < CANVAS_W; x += 16) {
        for (let y = off; y < CANVAS_H; y += 12) {
          ctx.fillRect(x, CANVAS_H - y, 2, 5);
        }
      }
      ctx.restore();
    }

    // Freeze: ice lattice.
    if (style === "freeze" && u < 0.65) {
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - u / 0.65);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const x = 20 + i * 48;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 30, CANVAS_H);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Blast / ultra expanding pixel rings.
    if ((style === "blast" || style === "ultra" || style === "giant") && u < 0.7) {
      const cx = CANVAS_W * 0.5;
      const cy = CANVAS_H * 0.42;
      const rings = style === "blast"
        ? (fx.kind === "apocalypse" ? 4 : (fx.kind === "nuke" ? 3 : 2))
        : (style === "giant" ? 3 : 3);
      ctx.save();
      for (let i = 0; i < rings; i++) {
        const progress = Clamp((fx.t - i * 0.08) / 0.55, 0, 1);
        if (progress <= 0 || progress >= 1) continue;
        const r = 20 + progress * (110 + i * 28);
        ctx.globalAlpha = 0.55 * (1 - progress);
        ctx.strokeStyle = i % 2 === 0 ? tint : "#ff8040";
        ctx.lineWidth = 3;
        ctx.strokeRect(Math.round(cx - r), Math.round(cy - r * 0.7), Math.round(r * 2), Math.round(r * 1.4));
      }
      ctx.restore();
    }

    // Caption stamp for notable powers.
    if (u < 0.55 && fx.label) {
      const showLabel = style === "blast" || style === "ultra" || style === "giant"
        || style === "freeze" || style === "curse" || style === "stun"
        || style === "eagle" || style === "meteor" || style === "ghost"
        || style === "antigrav" || style === "life" || style === "armor"
        || early;
      if (showLabel) {
        ctx.save();
        ctx.globalAlpha = 0.92 * (1 - u / 0.55);
        ctx.fillStyle = "#000";
        ctx.font = `16px ${PIXEL_FONT}`;
        ctx.textAlign = "center";
        const tw = ctx.measureText(fx.label).width + 22;
        ctx.fillRect((CANVAS_W - tw) / 2, CANVAS_H * 0.16, tw, 26);
        ctx.fillStyle = (style === "curse" || style === "eagle" || (style === "blast" && fx.kind !== "bomb"))
          ? "#ff6040"
          : tint;
        ctx.textBaseline = "middle";
        ctx.fillText(fx.label, CANVAS_W / 2, CANVAS_H * 0.16 + 13);
        ctx.restore();
      }
    }
  }
}

const game = new Game();
game.Init().catch((err) => {
  console.error(err);
  document.getElementById("startOverlay").querySelector("p").textContent =
    "资源加载失败，请检查 assets 目录。";
});
