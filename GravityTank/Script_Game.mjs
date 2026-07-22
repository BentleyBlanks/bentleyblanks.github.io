/**
 * GravityTank — Battle City stage 1 with gravity bullets.
 * Visuals: classic NES Battle City–style sprites (StefanBS/battle-city-clone, MIT).
 */

const TILE = 16;
const MAP_W = 26;
const MAP_H = 26;
const CANVAS_W = MAP_W * TILE; // 416
const CANVAS_H = MAP_H * TILE;
const TANK_SIZE = 32;
const SHEET_CELL = 8;
const SPRITE = 16; // classic tank / metatile source size in the sheet
const MAX_ENEMIES_ON_FIELD = 4;
const TOTAL_ENEMIES = 20;
const PLAYER_LIVES = 3;
const GRAVITY = 420; // px/s^2 — bullets fall toward bottom of map
const BULLET_SPEED = 280;
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

const POWER = {
  star: "star",
  bomb: "bomb",
  clock: "clock",
  shovel: "shovel",
  helmet: "helmet",
  life: "life",
  gun: "gun",
};

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

/** Classic-inspired Stage 1 layout (26x26 half-tiles). Legend in buildStageMap. */
function BuildStageMap() {
  // Compact authoring: each char is one half-tile.
  // . empty  # brick  @ steel  ~ water  % grass  = ice  B base zone (filled later)
  const rows = [
    "..........................",
    "..........................",
    "..##..##..##..##..##..##..",
    "..##..##..##..##..##..##..",
    "..##..##..##@@##..##..##..",
    "..##..##..##@@##..##..##..",
    "..##..##..##..##..##..##..",
    "..##..##..........##..##..",
    "..##..##..####....##..##..",
    "..........####............",
    "####..##..........##..####",
    "####..##..%%..%%..##..####",
    "......##..%%..%%..##......",
    "..##......##..##......##..",
    "..##@@....##..##....@@##..",
    "..##@@................@@..",
    "..##......####........##..",
    "..........####............",
    "..##..##..........##..##..",
    "..##..##..##..##..##..##..",
    "..##..##..##..##..##..##..",
    "..##..............##..##..",
    "..##....##....##....##....",
    "........##BBBB##..........",
    "........##BBBB##..........",
    "..........BBBB............",
  ];

  const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(TILE_EMPTY));
  const legend = {
    ".": TILE_EMPTY,
    "#": TILE_BRICK,
    "@": TILE_STEEL,
    "~": TILE_WATER,
    "%": TILE_GRASS,
    "=": TILE_ICE,
    B: TILE_EMPTY,
  };

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const ch = rows[y][x];
      map[y][x] = legend[ch] ?? TILE_EMPTY;
    }
  }

  // Eagle base 2x2 at classic bottom-center
  const bx = 12;
  const by = 24;
  map[by][bx] = TILE_BASE;
  map[by][bx + 1] = TILE_BASE;
  map[by + 1][bx] = TILE_BASE;
  map[by + 1][bx + 1] = TILE_BASE;

  // Brick fort around base
  const fort = [
    [11, 23], [12, 23], [13, 23], [14, 23],
    [11, 24], [14, 24],
    [11, 25], [14, 25],
  ];
  for (const [fx, fy] of fort) {
    if (map[fy][fx] === TILE_EMPTY) map[fy][fx] = TILE_BRICK;
  }

  // Extra water pools for classic feel
  for (let x = 8; x <= 9; x++) {
    for (let y = 12; y <= 13; y++) map[y][x] = TILE_WATER;
  }
  for (let x = 16; x <= 17; x++) {
    for (let y = 12; y <= 13; y++) map[y][x] = TILE_WATER;
  }

  // Ice patch
  for (let x = 11; x <= 14; x++) {
    map[10][x] = TILE_ICE;
    map[11][x] = TILE_ICE;
  }

  return map;
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
      bgm: "assets/AudioBgm_Battle.wav",
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
      enemyIcons: document.getElementById("enemyIcons"),
      mobileLives: document.getElementById("mobileLives"),
      mobilePower: document.getElementById("mobilePower"),
      mobileScore: document.getElementById("mobileScore"),
      mobileRemain: document.getElementById("mobileRemain"),
    };
    this.overlays = {
      start: document.getElementById("startOverlay"),
      pause: document.getElementById("pauseOverlay"),
      end: document.getElementById("endOverlay"),
      endTitle: document.getElementById("endTitle"),
      endMessage: document.getElementById("endMessage"),
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
    this.map = [];
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.explosions = [];
    this.powerups = [];
    this.spawnQueue = [];
    this.score = 0;
    this.lives = PLAYER_LIVES;
    this.enemiesRemaining = TOTAL_ENEMIES;
    this.spawnTimer = 0;
    this.freezeTimer = 0;
    this.shovelTimer = 0;
    this.pendingFortRestore = false;
    this.baseAlive = true;
    this.waterPhase = 0;
    this.lastTs = 0;
    this.spawnSlots = [
      { x: 0 * TILE, y: 0 },
      { x: 12 * TILE, y: 0 },
      { x: 24 * TILE, y: 0 },
    ];
    this.nextSpawnSlot = 0;
    this.frame = 0;
  }

  async Init() {
    await this.LoadAssets();
    await this.audio.LoadAll().catch((err) => console.warn("SFX pack load", err));
    this.BindUi();
    this.RenderEnemyIcons();
    this.DrawBootFrame();
    if (new URLSearchParams(location.search).has("autostart")) {
      this.StartGame();
    }
    requestAnimationFrame((t) => this.Loop(t));
  }

  async LoadAssets() {
    this.images = {
      sheet: await LoadImage("assets/Texture_ClassicSheet.png"),
    };
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

    document.getElementById("startButton").addEventListener("click", () => this.StartGame());
    document.getElementById("restartButton").addEventListener("click", () => this.StartGame());
    document.getElementById("resumeButton").addEventListener("click", () => this.SetPaused(false));

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "j"].includes(k) || e.code === "Space") {
        e.preventDefault();
      }
      this.keys.add(k);
      if (e.code === "Space") this.keys.add(" ");
      if (k === "p") this.TogglePause();
      if ((k === "enter" || k === " ") && this.state === "ready") this.StartGame();
      if ((k === "enter" || k === " ") && (this.state === "won" || this.state === "lost")) this.StartGame();
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
    this.SyncTouchControlsVisibility();
  }

  SyncTouchControlsVisibility() {
    const show = this.isTouchDevice && (this.state === "playing" || this.state === "paused");
    if (this.touchUi.stickWrap) this.touchUi.stickWrap.hidden = !show;
    if (this.touchUi.actionsWrap) this.touchUi.actionsWrap.hidden = !show;
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
  }

  StartGame() {
    this.map = BuildStageMap();
    this.bullets = [];
    this.explosions = [];
    this.powerups = [];
    this.enemies = [];
    this.score = 0;
    this.lives = PLAYER_LIVES;
    this.enemiesRemaining = TOTAL_ENEMIES;
    this.spawnTimer = 0.2;
    this.freezeTimer = 0;
    this.shovelTimer = 0;
    this.pendingFortRestore = false;
    this.baseAlive = true;
    this.nextSpawnSlot = 0;
    this.respawnTimer = 0;
    this.BuildSpawnQueue();
    this.SpawnPlayer(true);
    this.spawnTimer = 0;
    for (let i = 0; i < 3; i++) {
      this.TrySpawnEnemy(10);
      const last = this.enemies[this.enemies.length - 1];
      if (last) last.spawnFlash = 0;
    }
    this.state = "playing";
    this.overlays.start.hidden = true;
    this.overlays.pause.hidden = true;
    this.overlays.end.hidden = true;
    this.ResetTouchInput();
    this.SyncTouchControlsVisibility();
    this.UpdateHud();
    this.RenderEnemyIcons();
    this.audio.Ensure();
    this.audio.StopEngine();
    this.audio.StopPowerSpawn();
    this.audio.StopBgm();
    this.audio.StageStart();
    // Start looping battle BGM shortly after the stage jingle.
    setTimeout(() => {
      if (this.state === "playing") this.audio.StartBgm();
    }, 1800);
  }

  BuildSpawnQueue() {
    // Stage 1 mix: mostly basic, some fast/power/armor
    const mix = [];
    for (let i = 0; i < 10; i++) mix.push(ENEMY_TYPES[0]);
    for (let i = 0; i < 5; i++) mix.push(ENEMY_TYPES[1]);
    for (let i = 0; i < 3; i++) mix.push(ENEMY_TYPES[2]);
    for (let i = 0; i < 2; i++) mix.push(ENEMY_TYPES[3]);
    // shuffle
    for (let i = mix.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mix[i], mix[j]] = [mix[j], mix[i]];
    }
    this.spawnQueue = mix;
  }

  SpawnPlayer(fullProtect) {
    const px = 8 * TILE + 2;
    const py = 24 * TILE + 2;
    this.player = {
      x: px,
      y: py,
      w: TANK_SIZE,
      h: TANK_SIZE,
      dir: "up",
      speed: PLAYER_SPEED,
      power: 1,
      maxBullets: 1,
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
    if (this.pendingFortRestore) {
      if (this.TryRestoreBaseFort()) this.pendingFortRestore = false;
    }

    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnTimer = 0;
        if (this.state === "playing" && this.lives > 0 && (!this.player || !this.player.alive)) {
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

    // pickup powerups
    for (const pu of this.powerups) {
      if (!pu.alive) continue;
      if (RectsOverlap(p, { x: pu.x, y: pu.y, w: 24, h: 24 })) {
        pu.alive = false;
        this.ApplyPowerup(pu.kind);
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
      this.MoveTank(e, d.x * e.speed * dt, d.y * e.speed * dt);
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
      if (t === TILE_BRICK || t === TILE_STEEL || t === TILE_WATER || t === TILE_BASE || t === TILE_BASE_DEAD) return true;
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
    if (tank.fireCd > 0) return;
    const owned = this.bullets.filter((b) => b.alive && b.owner === tank).length;
    const maxB = isPlayer ? tank.maxBullets : 1;
    if (owned >= maxB) return;

    const d = DIR[tank.dir];
    const speed = BULLET_SPEED * (tank.bulletBoost || 1) * (isPlayer && tank.power >= 2 ? 1.12 : 1);
    // Gravity bullets: initial velocity along barrel; gravity pulls +Y every frame.
    // Give slight upward bias when shooting sideways so arcs are usable.
    let vx = d.x * speed;
    let vy = d.y * speed;
    if (tank.dir === "left" || tank.dir === "right") {
      vy -= 90; // loft for horizontal shots
    } else if (tank.dir === "up") {
      vy -= 40; // extra loft against gravity
    }

    const cx = tank.x + tank.w / 2;
    const cy = tank.y + tank.h / 2;
    const bullet = {
      x: cx - 4 + d.x * 14,
      y: cy - 4 + d.y * 14,
      w: 8,
      h: 8,
      vx,
      vy,
      alive: true,
      owner: tank,
      isPlayer,
      power: isPlayer ? tank.power : (tank.typeId === "power" ? 2 : 1),
      trail: [],
      // Short fuse so the muzzle doesn't instantly suicide; gravity arcs can still fall back.
      arm: 0.22,
      traveled: 0,
    };
    this.bullets.push(bullet);
    tank.fireCd = isPlayer ? (tank.power >= 2 ? 0.22 : 0.32) : tank.shootCd;
    this.audio.Shoot();
  }

  UpdateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.alive) continue;

      // GRAVITY — the signature mechanic
      b.vy += GRAVITY * dt;
      const stepX = b.vx * dt;
      const stepY = b.vy * dt;
      b.x += stepX;
      b.y += stepY;
      b.traveled += Math.hypot(stepX, stepY);
      if (b.arm > 0) b.arm -= dt;

      b.trail.push({ x: b.x + 4, y: b.y + 4 });
      if (b.trail.length > 10) b.trail.shift();

      if (b.x < -20 || b.y < -40 || b.x > CANVAS_W + 20 || b.y > CANVAS_H + 40) {
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
          b.alive = false;
          this.DamageEnemy(e, b.power);
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
        this.DestroyBrickCluster(tx, ty, b.power);
        b.alive = false;
        this.SpawnExplosion(b.x, b.y, 0.45);
        this.audio.Hit();
        return true;
      }
      if (t === TILE_STEEL) {
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

  DestroyBrickCluster(tx, ty, power) {
    // destroy a small cluster for juicier feel; higher power clears more
    const r = power >= 2 ? 1 : 0;
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if (this.map[y][x] === TILE_BRICK) this.map[y][x] = TILE_EMPTY;
      }
    }
    // always clear the hit cell
    if (this.map[ty]?.[tx] === TILE_BRICK) this.map[ty][tx] = TILE_EMPTY;
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
      // drop powerup chance (classic ~ flashing tank); use armor/power or random
      if (e.dropsPower || Math.random() < 0.22) this.DropPowerup(e.x, e.y);
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
    const kinds = [POWER.star, POWER.bomb, POWER.clock, POWER.shovel, POWER.helmet, POWER.life, POWER.gun];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.powerups.push({
      x: Clamp(x, 8, CANVAS_W - 32),
      y: Clamp(y, 8, CANVAS_H - 32),
      kind,
      alive: true,
      ttl: 12,
      blink: 0,
    });
    this.audio.PowerSpawn();
  }

  ApplyPowerup(kind) {
    this.audio.Power();
    const p = this.player;
    switch (kind) {
      case POWER.star:
        if (p) {
          p.power = Math.min(3, p.power + 1);
          if (p.power >= 2) p.maxBullets = 2;
          if (p.power >= 3) p.maxBullets = 2;
        }
        break;
      case POWER.gun:
        if (p) {
          p.power = 3;
          p.maxBullets = 2;
        }
        break;
      case POWER.life:
        this.lives += 1;
        break;
      case POWER.helmet:
        if (p) p.protect = 8;
        break;
      case POWER.clock:
        this.freezeTimer = 8;
        break;
      case POWER.bomb:
        for (const e of this.enemies) {
          if (e.alive && e.spawnFlash <= 0) {
            e.hp = 0;
            e.alive = false;
            e.deathTimer = 0.01;
            this.score += e.score;
            this.SpawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 1);
          }
        }
        this.audio.Explode();
        this.RenderEnemyIcons();
        break;
      case POWER.shovel:
        this.shovelTimer = 12;
        this.pendingFortRestore = false;
        this.FortifyBase(true);
        break;
      default:
        break;
    }
    this.UpdateHud();
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
      this.map[y][x] = steel ? TILE_STEEL : TILE_BRICK;
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
      this.map[y][x] = TILE_BRICK;
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
      dropsPower: type.id === "armor" || Math.random() < 0.15,
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
      this.EndGame(true, `敌军肃清。得分 ${this.score}`);
    }
  }

  EndGame(won, message) {
    this.state = won ? "won" : "lost";
    this.overlays.end.hidden = false;
    this.overlays.endTitle.textContent = won ? "关卡通过" : "游戏结束";
    this.overlays.endMessage.textContent = message;
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
    this.hud.lives.textContent = lives;
    this.hud.power.textContent = power;
    this.hud.score.textContent = score;
    this.hud.remain.textContent = remain;
    if (this.hud.mobileLives) this.hud.mobileLives.textContent = lives;
    if (this.hud.mobilePower) this.hud.mobilePower.textContent = power;
    if (this.hud.mobileScore) this.hud.mobileScore.textContent = score;
    if (this.hud.mobileRemain) this.hud.mobileRemain.textContent = remain;
  }

  RenderEnemyIcons() {
    const queued = this.spawnQueue?.length ?? TOTAL_ENEMIES;
    const alive = this.enemies.filter((e) => e.alive).length;
    const pending = this.state === "ready" || this.state === "boot" ? TOTAL_ENEMIES : queued + alive;
    const killed = Math.max(0, TOTAL_ENEMIES - pending);
    const box = this.hud.enemyIcons;
    box.innerHTML = "";
    for (let i = 0; i < TOTAL_ENEMIES; i++) {
      const icon = document.createElement("i");
      if (i < killed) icon.classList.add("gone");
      box.appendChild(icon);
    }
  }

  DrawBootFrame() {
    this.state = "ready";
    this.map = BuildStageMap();
    this.Render();
  }

  Render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

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

    if (this.state === "ready") {
      // dim already handled by overlay
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
    const [gx, gy] = TILE_SHEET.brick;
    this.BlitGrid(ctx, gx, gy, px, py, TILE, TILE, 1, 1);
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

    const { gx, gy } = this.TankSheetOrigin(tank, isPlayer);
    this.BlitGrid(ctx, gx, gy, tank.x, tank.y, tank.w, tank.h);

    if (isPlayer && tank.protect > 0) {
      const [sx, sy] = FX_SHEET.shield[Math.floor(this.frame / 4) % 2];
      this.BlitGrid(ctx, sx, sy, tank.x, tank.y, tank.w, tank.h);
    }
  }

  DrawBullet(ctx, b) {
    if (b.trail.length > 1) {
      ctx.strokeStyle = b.isPlayer ? "rgba(255,220,120,0.35)" : "rgba(255,120,100,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.trail[0].x, b.trail[0].y);
      for (let i = 1; i < b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
      ctx.stroke();
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

    let x = p.x + p.w / 2 + d.x * 14;
    let y = p.y + p.h / 2 + d.y * 14;
    ctx.strokeStyle = "rgba(232, 160, 90, 0.35)";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const step = 1 / 30;
    for (let i = 0; i < 55; i++) {
      vy += GRAVITY * step;
      x += vx * step;
      y += vy * step;
      ctx.lineTo(x, y);
      if (x < 0 || y < 0 || x > CANVAS_W || y > CANVAS_H) break;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const t = this.map[ty]?.[tx];
      if (t === TILE_BRICK || t === TILE_STEEL || t === TILE_BASE) break;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  DrawPowerup(ctx, pu) {
    if (pu.ttl < 3 && Math.floor(pu.blink * 6) % 2 === 0) return;
    const key = pu.kind === "life" ? "life" : pu.kind;
    const grid = POWER_SHEET[key] || POWER_SHEET.star;
    const [gx, gy] = grid;
    this.BlitGrid(ctx, gx, gy, pu.x, pu.y, 28, 28);
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
