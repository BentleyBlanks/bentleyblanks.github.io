/**
 * Script_Config.mjs — 《黑石峪 · 一九四三年冬》全部可调数值的唯一来源
 * Owner: AgentFoundation
 *
 * 纪律：
 *  - 零 import。任何模块里出现的裸数字都应该搬进这里。
 *  - 运行时视为只读。唯二的合法写入口是 ApplyChapterOverrides / ApplyQualityPreset，
 *    它们就地合并进同一个 Config 对象（因为 ctx.config 是活引用），并返回该对象。
 *  - 单位：长度=米，时间=秒，角度=弧度（字段名带 Deg 的才是度），速率=每秒。
 *
 * 调参哲学（服务于「压抑真实」，不是服务于爽）：
 *  - 弹药极稀缺：全流程 12 发，一发就是一次决定。
 *  - 敌人致命：伪军一枪 42、日军一枪 55，两枪必死；正面交火几乎必死。
 *  - 玩家脆弱：无自然回血，失血不止会死，低温会死，体力恢复慢。
 *  - 潜行永远比交火便宜：噪音传得远，警戒涨得快、落得慢。
 */

/* ------------------------------------------------------------------ *
 * 色彩调色板：冬日冷灰是唯一底色，火光暖橙是唯一暖色对比。
 * 值为 0xRRGGBB 数字（three 直接吃）；PaletteCss 提供 '#rrggbb' 字符串给 DOM。
 * 严禁新增「血」相关颜色（红线二）：事后痕迹一律用 StainDark。
 * ------------------------------------------------------------------ */
export const Palette = {
  /* 天与雪 */
  SkyZenith: 0x5d6a78,
  SkyHorizon: 0xa9b4c0,
  SkyDusk: 0x6e6a72,
  SkyNight: 0x1e242c,
  FogWinter: 0xa4b0bc,
  FogNight: 0x28303a,
  SnowLit: 0xd9dfe6,
  SnowMid: 0xb8c2cd,
  SnowShadow: 0x8d9aab,
  SnowTrampled: 0x9aa0a4,
  Ice: 0xa6bcc8,

  /* 土石木 */
  Rock: 0x585e66,
  RockDark: 0x363b42,
  Gravel: 0x6a6d70,
  Dirt: 0x4c4438,
  Mud: 0x3e3830,
  MudWall: 0x8a7a63,
  StoneWall: 0x6d6f70,
  BrickBurnt: 0x4a3d38,
  Wood: 0x5e4a35,
  WoodOld: 0x736450,
  CharredWood: 0x241f1d,
  Thatch: 0x8a7645,
  Straw: 0xb09a63,
  Paper: 0xd6cdba,
  PaperWindow: 0xcfc8b6,

  /* 布与人 */
  FabricGray: 0x4b525a,      /* 八路军灰棉衣 */
  FabricKhaki: 0x6d6748,     /* 伪军土黄 */
  FabricOlive: 0x585e42,     /* 日军军服 */
  FabricBlue: 0x394554,      /* 村民靛蓝 */
  FabricRed: 0x8a3129,       /* 小满的红头绳——全片唯一的一点红，极小面积 */
  ClothCoarse: 0x7d7566,
  ClothPadded: 0x6a6558,
  Fur: 0x54483a,
  SkinPale: 0xc0a189,
  SkinWeathered: 0xa07e63,

  /* 金属 */
  MetalDull: 0x5a5f63,
  MetalRust: 0x6b4a35,
  Gunmetal: 0x2c2f33,
  BarbedWire: 0x4d4a45,

  /* 植被 */
  Foliage: 0x4a5340,
  FoliageDead: 0x6b6350,

  /* 唯一暖色：火 */
  FireCore: 0xffe0ad,
  FireMid: 0xff9c3f,
  FireDeep: 0xd0521a,
  Ember: 0xff6a1e,
  LanternGlow: 0xffc27a,
  MuzzleFlash: 0xfff0c8,
  FlareLight: 0xffd9a8,
  SearchlightBeam: 0xdfe8f2,

  /* 事后痕迹（不做血肉展示） */
  StainDark: 0x3a2b26,
  SootBlack: 0x1b1917,
  AshGray: 0x7c7a76,

  /* HUD */
  UiInk: 0xe6ebf1,
  UiDim: 0x9aa4b0,
  UiFaint: 0x5f6a75,
  UiPanel: 0x14181d,
  UiAlertCalm: 0xcfd6dd,
  UiAlertSuspicious: 0xd9a13b,
  UiAlertCombat: 0xb4453a,
  UiCost: 0x8c7f6a,          /* 代价记录用的哑色：它不是成就，不给金色 */
  UiHealth: 0xb9c2cb,
  UiStamina: 0x8fa08c,
  UiWarmth: 0x7fa2b8,
};

function ToCssColor(hex) {
  return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}

export const PaletteCss = (() => {
  const out = {};
  for (const key of Object.keys(Palette)) out[key] = ToCssColor(Palette[key]);
  return out;
})();

/* ------------------------------------------------------------------ *
 * 主配置树
 * ------------------------------------------------------------------ */
const BaseConfig = {
  Meta: {
    title: '黑石峪 · 一九四三年冬',
    version: '0.1.0',
    buildDate: '2026-07-29',
    targetRunMinutes: 25,
  },

  Loop: {
    targetFps: 60,
    maxDeltaSeconds: 0.05,
    fixedStep: 1 / 60,
    hitstopMaxSeconds: 0.12,
    rulesStepSeconds: 0.25,      /* Rules 不需要每帧跑 */
    enemyStrideFrames: 3,        /* 敌人视线检测分帧：frame % 3 */
    autosaveSeconds: 45,
  },

  Render: {
    shadowMapSize: 1024,
    shadowDistance: 45,
    pixelRatioCap: 2,
    fogNear: 12,
    fogFar: 90,
    toneMappingExposure: 1.05,
    bloomStrength: 0.35,
    vignette: 0.42,
    filmGrain: 0.05,
    desaturationBase: 0.18,      /* 冬日的底子就是褪色的 */
    chromaticAberration: 0.0015,
    snowParticleCount: 2400,
    volumetricSteps: 12,
    maxDrawCalls: 220,
    lodNearDistance: 12,
    lodFarDistance: 30,
  },

  Camera: {
    fov: 58,
    aimFov: 42,
    near: 0.1,
    far: 400,
    shoulderOffset: { x: 0.62, y: 1.52, z: 0 },
    distance: 3.1,
    aimDistance: 1.65,
    crouchHeightOffset: -0.42,
    proneHeightOffset: -0.95,
    followLambda: 9,
    aimLambda: 16,
    pitchMinDeg: -62,
    pitchMaxDeg: 68,
    breathAmplitude: 0.011,
    breathRate: 0.28,
    handheldAmplitude: 0.006,
    handheldRate: 1.7,
    sprintFovBoost: 4.5,
    collisionRadius: 0.28,
    shakeDecayLambda: 6.5,
    dialogueDistance: 2.2,
  },

  Player: {
    walkSpeed: 1.85,
    runSpeed: 4.40,
    crouchSpeed: 1.05,
    proneSpeed: 0.55,
    aimSpeed: 1.15,
    acceleration: 14,
    deceleration: 18,
    radius: 0.34,
    height: 1.76,
    eyeHeight: 1.62,
    crouchHeight: 1.18,
    proneHeight: 0.55,
    stepHeight: 0.42,
    turnLambda: 12,
    injuredSpeedScale: 0.72,      /* 沈铁腿上有伤，一直都不是全速 */
    coldSpeedScale: 0.86,
    vaultMaxHeight: 1.25,
    vaultSeconds: 0.9,
    squeezeSeconds: 1.6,
    stanceChangeSeconds: 0.45,
    footstepStrideWalk: 0.72,
    footstepStrideRun: 1.05,
    footstepStrideCrouch: 0.60,
  },

  Stealth: {
    Noise: {
      footstepWalk: 3,
      footstepRun: 9,
      footstepCrouch: 1.2,
      footstepProne: 0.5,
      gunshotRifle: 40,
      gunshotPistol: 34,
      boltCycle: 6,
      stone: 12,
      grenade: 45,
      meleeHit: 8,
      stealthKill: 5,
      doorOpen: 6,
      doorForce: 14,
      vault: 4,
      craft: 2,
      container: 4,
      dogBark: 25,
      companionMove: 1.6,
      bodyFall: 7,
      landHard: 6,
      iceCrack: 10,
    },
    /* 噪音在何种表面上更响（雪地吃声，冰面刺耳） */
    SurfaceNoiseScale: {
      Snow: 0.72, Ice: 1.35, Dirt: 1.0, Stone: 1.15,
      Wood: 1.25, Metal: 1.45, Cloth: 0.55, Water: 1.3, Straw: 0.8,
    },
    alertYellow: 0.34,
    alertRed: 0.75,
    alertRiseBase: 0.55,
    alertDecayPerSecond: 0.12,     /* 涨得快、落得慢：被怀疑过就回不去了 */
    alertGraceSeconds: 3.0,
    alertMemorySeconds: 22,
    alertMomentumScale: 0.8,       /* 已经起疑的敌人锁定得更快 */
    concealmentCrouchBonus: 0.30,
    concealmentProneBonus: 0.45,
    concealmentCoverBonus: 0.35,
    darknessBonus: 0.65,           /* 光照 0 时的最大加成 */
    motionPenaltyPerSpeed: 0.50,   /* 动就是暴露 */
    stillnessFloor: 0.35,
    footprintLifeSeconds: 90,
    footprintNoticeRange: 4.5,
    footprintFadeInBlizzard: 0.45, /* 暴雪会替你抹掉脚印 */
    bodyNoticeRange: 6.5,
  },

  Enemy: {
    viewRangeDay: 22,
    viewRangeDusk: 14,
    viewRangeNight: 9,
    viewHalfAngleDeg: 55,
    peripheralHalfAngleDeg: 100,
    peripheralScale: 0.35,
    hearingRangeScale: 1.0,
    searchSeconds: 26,
    searchRadius: 11,
    squadCallRadius: 30,
    reactionSeconds: 0.55,
    fireIntervalSeconds: 1.9,
    accuracyBase: 0.32,
    accuracyRamp: 0.06,            /* 每次开火后逐步修正弹着 */
    accuracyMax: 0.72,
    health: 100,
    /* 敌人的枪是致命的：任何一支步枪两发送走玩家（52*2 > 100）。
       这条数字撑着「正面交火几乎必死」，配合 accuracyBase 0.32 的高失手率，
       结果是：被打中就基本没得谈，但敌人经常打不中——紧张来自不确定，不来自数值海绵。 */
    damageRifle: 52,
    damageRifleJapanese: 64,
    damagePistol: 34,
    damageBayonet: 44,
    damageDogBite: 24,
    suppressionSeconds: 3.5,
    staggerThreshold: 30,
    flashlightRange: 26,
    flashlightHalfAngleDeg: 18,
    searchlightRange: 55,
    searchlightHalfAngleDeg: 9,
    searchlightSweepSpeed: 0.28,
    flareRiseSeconds: 2.2,
    flareBurnSeconds: 18,
    flareLightRadius: 34,
    dogViewScale: 0.6,
    dogScentRange: 14,
    dogSpeed: 5.6,
    dogBarkCooldown: 2.4,
    corpseInvestigateSeconds: 8,
    Archetypes: {
      PuppetSoldier: { health: 100, accuracyScale: 0.85, viewScale: 0.95, damage: 52, weapon: 'RifleZhongzheng' },
      PuppetOfficer: { health: 110, accuracyScale: 1.0, viewScale: 1.05, damage: 34, weapon: 'PistolMauser' },
      JapaneseSoldier: { health: 115, accuracyScale: 1.15, viewScale: 1.15, damage: 64, weapon: 'RifleArisaka' },
      JapaneseNco: { health: 130, accuracyScale: 1.25, viewScale: 1.2, damage: 64, weapon: 'RifleArisaka' },
      Dog: { health: 45, accuracyScale: 1.0, viewScale: 0.6, damage: 24, weapon: 'None' },
    },
  },

  Combat: {
    /* 全流程 12 发，分章发放，超预算一律拒绝（Survival 强制） */
    AmmoBudget: { total: 12, chapter1: 2, chapter2: 4, chapter3: 6 },
    hitstopSeconds: 0.09,
    hitstopKillSeconds: 0.12,
    meleeLightDamage: 34,
    meleeHeavyDamage: 62,
    meleeStaminaLight: 12,
    meleeStaminaHeavy: 24,
    meleeRange: 1.45,
    meleeHalfAngleDeg: 55,
    blockStaminaPerHit: 18,
    blockDamageScale: 0.25,
    dodgeStamina: 16,
    dodgeIFrames: 0.32,
    dodgeDistance: 1.9,
    stealthKillSeconds: 1.35,
    stealthKillCooldown: 4.0,
    stealthKillConeDeg: 80,
    stealthKillRange: 1.35,
    grenadeRadius: 5.5,
    grenadeDamage: 120,
    grenadeFuseSeconds: 4.2,
    throwChargeMax: 1.2,
    throwSpeedMin: 6,
    throwSpeedMax: 15,
    stoneThrowSpeedMax: 17,
    HitMultiplier: { Head: 2.6, Torso: 1.0, ArmLeft: 0.65, ArmRight: 0.65, LegLeft: 0.7, LegRight: 0.7 },
    Weapons: {
      RifleZhongzheng: {
        label: '中正式', kind: 'Rifle', damage: 78, magazine: 5, boltAction: true,
        fireCooldown: 0.35, boltSeconds: 1.15, reloadSeconds: 3.4, noiseRadius: 40,
        recoil: 0.085, spreadBase: 0.0075, falloffStart: 25, falloffEnd: 90, ammoType: 'rifle',
      },
      PistolMauser: {
        label: '盒子炮', kind: 'Pistol', damage: 46, magazine: 10, boltAction: false,
        fireCooldown: 0.22, boltSeconds: 0, reloadSeconds: 2.8, noiseRadius: 34,
        recoil: 0.115, spreadBase: 0.0175, falloffStart: 10, falloffEnd: 35, ammoType: 'pistol',
      },
      KnifeBayonet: {
        label: '刺刀', kind: 'Melee', damage: 34, magazine: 0, boltAction: false,
        fireCooldown: 0.55, boltSeconds: 0, reloadSeconds: 0, noiseRadius: 8,
        recoil: 0, spreadBase: 0, falloffStart: 0, falloffEnd: 0, ammoType: 'none',
      },
      Shovel: {
        label: '工兵锹', kind: 'Melee', damage: 40, magazine: 0, boltAction: false,
        fireCooldown: 0.75, boltSeconds: 0, reloadSeconds: 0, noiseRadius: 9,
        recoil: 0, spreadBase: 0, falloffStart: 0, falloffEnd: 0, ammoType: 'none',
      },
    },
    /* 瞄准散布：呼吸/体力/伤势/架枪共同决定（Rules.ComputeAimSway 读这里） */
    Aim: {
      spreadStand: 0.030,
      bracedScale: 0.35,
      crouchScale: 0.62,
      proneScale: 0.30,
      movingScale: 2.2,
      settleSeconds: 1.2,
      settleFloor: 0.42,
      holdFatigueSeconds: 4.5,     /* 端太久端不住 */
      holdFatigueScale: 2.4,
      staminaPenalty: 1.35,
      injuryPenalty: 1.5,
      coldPenalty: 0.9,
      swayRateA: 0.62,
      swayRateB: 1.13,
      swayAmplitude: 0.0135,
    },
  },

  Survival: {
    maxHealth: 100,
    maxStamina: 100,
    maxWarmth: 100,
    maxHunger: 100,
    bleedPerSecond: 1.6,
    bleedMovingScale: 1.45,
    bleedDurationSeconds: 60,
    healthRegenPerSecond: 0.0,     /* 不回血。伤就是伤。 */
    bandageHeal: 22,
    rationHeal: 6,
    rationHunger: 45,
    staminaDrainRun: 11,
    staminaDrainAim: 1.8,
    staminaRegen: 9,
    staminaRegenDelay: 1.1,
    staminaColdScale: 0.55,        /* 冷的时候恢复不过来 */
    warmthDrainBlizzard: 1.1,
    warmthDrainOpen: 0.45,
    warmthDrainIndoorScale: 0.35,
    warmthDrainWetScale: 1.6,
    warmthMovingScale: 0.85,
    warmthGainFire: 6.0,
    warmthClothingRelief: 0.45,
    warmthLowThreshold: 30,
    warmthCriticalThreshold: 12,
    warmthDamagePerSecond: 1.2,    /* 温度见底就开始掉血 */
    hungerDrainPerSecond: 0.08,
    hungerLowThreshold: 25,
    hungerStaminaScale: 0.6,
    inventorySlots: 10,
    interactSeconds: 1.4,
    craftSeconds: 2.2,
    searchContainerSeconds: 1.8,
    pryDoorSeconds: 3.2,
    /* 搜刮产出：稀缺是设计目标，不是运气问题 */
    LootTables: {
      HouseRuin: [
        { id: 'Cloth', count: 1, weight: 30 },
        { id: 'Match', count: 1, weight: 18 },
        { id: 'PineBranch', count: 1, weight: 16 },
        { id: 'Ration', count: 1, weight: 10 },
        { id: 'Liquor', count: 1, weight: 8 },
        { id: 'Herb', count: 1, weight: 8 },
        { id: 'None', count: 0, weight: 40 },
      ],
      Cellar: [
        { id: 'Ration', count: 1, weight: 22 },
        { id: 'Cloth', count: 1, weight: 20 },
        { id: 'Liquor', count: 1, weight: 14 },
        { id: 'Rope', count: 1, weight: 8 },
        { id: 'None', count: 0, weight: 26 },
      ],
      Checkpoint: [
        { id: 'RifleAmmo', count: 1, weight: 16 },
        { id: 'Cloth', count: 1, weight: 18 },
        { id: 'Ration', count: 1, weight: 12 },
        { id: 'None', count: 0, weight: 34 },
      ],
      Body: [
        { id: 'RifleAmmo', count: 1, weight: 22 },
        { id: 'PistolAmmo', count: 1, weight: 10 },
        { id: 'None', count: 0, weight: 48 },
      ],
    },
    Recipes: {
      RecipeBandage: {
        id: 'RecipeBandage', name: '绷带',
        inputs: [{ id: 'Cloth', count: 1 }, { id: 'Liquor', count: 1 }],
        output: { id: 'Bandage', count: 1 }, seconds: 2.2, noiseRadius: 2, requiresFire: false,
      },
      RecipeCampfire: {
        id: 'RecipeCampfire', name: '火堆',
        inputs: [{ id: 'Match', count: 1 }, { id: 'PineBranch', count: 2 }],
        output: { id: 'Firewood', count: 1 }, seconds: 3.5, noiseRadius: 3, requiresFire: false,
      },
      RecipeHerbPoultice: {
        id: 'RecipeHerbPoultice', name: '草药膏',
        inputs: [{ id: 'Herb', count: 2 }, { id: 'Cloth', count: 1 }],
        output: { id: 'Bandage', count: 1 }, seconds: 2.8, noiseRadius: 2, requiresFire: true,
      },
    },
  },

  World: {
    tileSize: 2,
    chunkSpan: 128,
    navGridStep: 1.0,
    groundFriction: 1,
    coverLowHeight: 0.95,
    coverHighHeight: 1.75,
    lootDensity: 0.55,
    terrainHeightScale: 9.5,
    terrainNoiseScale: 0.017,
    snowDepthMax: 0.35,
    pathRequestsPerFrame: 2,
    occlusionWall: 0.85,
    occlusionRuin: 0.55,
    occlusionSnowMound: 0.35,
    occlusionIndoor: 0.92,
    Presets: {
      Village: { spanX: 128, spanZ: 128, buildingCount: 14, treeCount: 90, coverCount: 46 },
      Valley: { spanX: 160, spanZ: 110, buildingCount: 7, treeCount: 130, coverCount: 52 },
      Pass: { spanX: 150, spanZ: 150, buildingCount: 3, treeCount: 70, coverCount: 38 },
    },
  },

  Weather: {
    Clear: { snowRate: 0.0, windSpeed: 1.2, windDirectionDeg: 300, fogDensity: 0.010, visibility: 1.00, ambientLight: 1.00, exposure: 0.30, viewRangeScale: 1.00, hearingScale: 1.00 },
    LightSnow: { snowRate: 0.35, windSpeed: 2.6, windDirectionDeg: 285, fogDensity: 0.018, visibility: 0.80, ambientLight: 0.85, exposure: 0.55, viewRangeScale: 0.90, hearingScale: 0.95 },
    Overcast: { snowRate: 0.10, windSpeed: 3.4, windDirectionDeg: 270, fogDensity: 0.024, visibility: 0.70, ambientLight: 0.72, exposure: 0.62, viewRangeScale: 0.85, hearingScale: 1.00 },
    Blizzard: { snowRate: 1.00, windSpeed: 9.5, windDirectionDeg: 250, fogDensity: 0.055, visibility: 0.32, ambientLight: 0.45, exposure: 1.00, viewRangeScale: 0.52, hearingScale: 0.60 },
  },

  TimeOfDay: {
    Dawn: { sunElevationDeg: 8, sunAzimuthDeg: 96, ambientLight: 0.42, viewRange: 20, key: 0xb9c6d4, fill: 0x4c5a6b },
    Noon: { sunElevationDeg: 34, sunAzimuthDeg: 180, ambientLight: 0.72, viewRange: 22, key: 0xdfe6ec, fill: 0x6a7684 },
    Dusk: { sunElevationDeg: 4, sunAzimuthDeg: 262, ambientLight: 0.30, viewRange: 14, key: 0xc08a5e, fill: 0x3f4653 },
    Night: { sunElevationDeg: -12, sunAzimuthDeg: 300, ambientLight: 0.14, viewRange: 9, key: 0x63748c, fill: 0x1a2027 },
  },

  Companion: {
    followDistance: 2.6,
    followMaxDistance: 9.0,
    catchUpDistance: 6.0,
    catchUpSpeed: 4.0,
    walkSpeed: 1.9,
    crouchSpeed: 1.1,
    hideRadius: 5.0,
    scareDecayPerSecond: 0.06,
    scareOnGunshot: 0.35,
    scareOnPlayerHurt: 0.28,
    scareOnEnemyNear: 0.22,
    trustOnShare: 0.10,
    trustOnProtect: 0.15,
    tiredPerMinute: 0.10,
    barkCooldownSeconds: 14,
    barkMinGapSeconds: 6,
    squeezeSeconds: 2.4,
    captureRadius: 1.6,
  },

  Audio: {
    masterVolume: 0.8,
    busMusic: 0.55,
    busSfx: 0.9,
    busAmbience: 0.6,
    busVoice: 1.0,
    maxVoices: 24,
    rolloffRefDistance: 4,
    rolloffMaxDistance: 60,
    muffledIndoor: 0.35,
    muffledLowHealth: 0.55,
    heartbeatHealthThreshold: 35,
    captionMinDistance: 0.5,
    captionMaxDistance: 45,
    musicFadeSeconds: 2.4,
    ambienceFadeSeconds: 3.0,
  },

  Hud: {
    subtitleSeconds: 3.2,
    subtitleMinSeconds: 1.6,
    subtitleCharSeconds: 0.16,
    toastSeconds: 2.4,
    promptFadeSeconds: 0.12,
    fontScale: 1.0,
    safeAreaPadding: 16,
    objectiveShowSeconds: 5.0,
    chapterTitleSeconds: 4.5,
    soundCaptionSeconds: 2.0,
    soundCaptionMax: 3,
    touchButtonMinPx: 48,
    touchStickRadiusPx: 72,
    vitalsPulseThreshold: 0.30,
  },

  Difficulty: {
    current: 'Standard',
    Presets: {
      /* 「不擅长动作游戏也想看完这个故事」 */
      Story: { enemyDamageScale: 0.65, enemyAccuracyScale: 0.70, detectionScale: 0.75, alertDecayScale: 1.35, warmthDrainScale: 0.70, ammoBonus: 2 },
      Standard: { enemyDamageScale: 1.00, enemyAccuracyScale: 1.00, detectionScale: 1.00, alertDecayScale: 1.00, warmthDrainScale: 1.00, ammoBonus: 0 },
      Harsh: { enemyDamageScale: 1.30, enemyAccuracyScale: 1.20, detectionScale: 1.25, alertDecayScale: 0.75, warmthDrainScale: 1.30, ammoBonus: -2 },
    },
  },

  Save: {
    key: 'blackstone1943_progress_v1',
    settingsKey: 'blackstone1943_settings_v1',
    version: 1,
  },

  Debug: {
    enabled: false,
    showNav: false,
    showCovers: false,
    showViewCones: false,
    showStats: false,
    logEvents: false,
  },
};

/* ------------------------------------------------------------------ *
 * 章节覆盖：点路径 → 值。ApplyChapterOverrides 会先还原基线再合并。
 * ------------------------------------------------------------------ */
const ChapterOverrides = {
  /* 一 · 雪窖：拂晓小雪，只有伪军搜村小队。教学章，稍微手下留情。 */
  ChapterSnowCellar: {
    'Enemy.viewRangeDay': 20,
    'Enemy.accuracyBase': 0.26,
    'Enemy.fireIntervalSeconds': 2.3,
    'Enemy.reactionSeconds': 0.75,
    'Stealth.alertRiseBase': 0.48,
    'Survival.warmthDrainOpen': 0.40,
    'Render.fogFar': 78,
  },
  /* 二 · 断谷：正午，视野最好，资源见底。第一次真正的枪战。 */
  ChapterBrokenValley: {
    'Enemy.viewRangeDay': 24,
    'Enemy.accuracyBase': 0.34,
    'Enemy.fireIntervalSeconds': 1.9,
    'Enemy.reactionSeconds': 0.55,
    'Stealth.alertRiseBase': 0.58,
    'Survival.warmthDrainOpen': 0.35,
    'Render.fogFar': 105,
  },
  /* 三 · 风雪垭口：黄昏转夜 + 暴雪。看不见你，但狗闻得到你，体温在杀你。 */
  ChapterWindPass: {
    'Enemy.viewRangeDusk': 13,
    'Enemy.viewRangeNight': 8,
    'Enemy.accuracyBase': 0.38,
    'Enemy.fireIntervalSeconds': 1.7,
    'Enemy.reactionSeconds': 0.45,
    'Stealth.alertRiseBase': 0.62,
    'Stealth.alertDecayPerSecond': 0.09,
    'Stealth.footprintFadeInBlizzard': 0.45,
    'Survival.warmthDrainBlizzard': 1.45,
    'Survival.staminaRegen': 7,
    'Render.fogFar': 52,
    'Render.fogNear': 6,
  },
};

const QualityPresets = {
  low: {
    'Render.shadowMapSize': 0,
    'Render.shadowDistance': 0,
    'Render.pixelRatioCap': 1.5,
    'Render.bloomStrength': 0.0,
    'Render.snowParticleCount': 700,
    'Render.volumetricSteps': 0,
    'Render.maxDrawCalls': 120,
    'Render.filmGrain': 0.0,
    'Loop.enemyStrideFrames': 4,
    'Render.lodNearDistance': 8,
    'Render.lodFarDistance': 20,
  },
  medium: {
    'Render.shadowMapSize': 1024,
    'Render.shadowDistance': 32,
    'Render.pixelRatioCap': 1.75,
    'Render.bloomStrength': 0.25,
    'Render.snowParticleCount': 1400,
    'Render.volumetricSteps': 6,
    'Render.maxDrawCalls': 180,
    'Render.filmGrain': 0.04,
    'Loop.enemyStrideFrames': 3,
    'Render.lodNearDistance': 10,
    'Render.lodFarDistance': 26,
  },
  high: {
    'Render.shadowMapSize': 2048,
    'Render.shadowDistance': 45,
    'Render.pixelRatioCap': 2,
    'Render.bloomStrength': 0.35,
    'Render.snowParticleCount': 2400,
    'Render.volumetricSteps': 12,
    'Render.maxDrawCalls': 220,
    'Render.filmGrain': 0.05,
    'Loop.enemyStrideFrames': 3,
    'Render.lodNearDistance': 12,
    'Render.lodFarDistance': 30,
  },
};

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */
function DeepClone(value) {
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) out[i] = DeepClone(value[i]);
    return out;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = DeepClone(value[key]);
    return out;
  }
  return value;
}

function DeepAssign(target, source) {
  for (const key of Object.keys(source)) {
    const next = source[key];
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      DeepAssign(target[key], next);
    } else {
      target[key] = Array.isArray(next) ? DeepClone(next) : next;
    }
  }
  return target;
}

function SetByPath(root, path, value) {
  const parts = String(path).split('.');
  let node = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
  return root;
}

/** 活配置树。ctx.config 指向它；运行时只读。 */
export const Config = DeepClone(BaseConfig);

let activeChapterId = null;
/* null = 还没选档位，Config 保持基线（= 契约里写死的那一份）。Boot 猜完设备后再调 ApplyQualityPreset。 */
let activeQuality = null;

/** 点路径读取，如 GetTuning('Stealth.Noise.gunshotRifle', 40) */
export function GetTuning(path, fallback) {
  if (typeof path !== 'string' || path.length === 0) return fallback;
  const parts = path.split('.');
  let node = Config;
  for (let i = 0; i < parts.length; i += 1) {
    if (node === null || typeof node !== 'object' || !(parts[i] in node)) return fallback;
    node = node[parts[i]];
  }
  return node === undefined ? fallback : node;
}

function RebuildActiveConfig() {
  DeepAssign(Config, DeepClone(BaseConfig));
  const chapterMap = activeChapterId ? ChapterOverrides[activeChapterId] : null;
  if (chapterMap) {
    for (const path of Object.keys(chapterMap)) SetByPath(Config, path, chapterMap[path]);
  }
  const qualityMap = QualityPresets[activeQuality];
  if (qualityMap) {
    for (const path of Object.keys(qualityMap)) SetByPath(Config, path, qualityMap[path]);
  }
  return Config;
}

/** 章节数值覆盖（Boot 换章时调用）。就地更新并返回同一个 Config 引用。 */
export function ApplyChapterOverrides(chapterId) {
  activeChapterId = ChapterOverrides[chapterId] ? chapterId : null;
  return RebuildActiveConfig();
}

/** 设备档位覆盖：'low' | 'medium' | 'high'。 */
export function ApplyQualityPreset(level) {
  activeQuality = QualityPresets[level] ? level : 'high';
  return RebuildActiveConfig();
}

/** 当前难度系数（Enemy/Rules 读它做缩放）。 */
export function GetDifficulty() {
  const presets = Config.Difficulty.Presets;
  return presets[Config.Difficulty.current] || presets.Standard;
}

/** 切换难度；未知名字保持原状并返回 false。 */
export function SetDifficulty(name) {
  if (!Config.Difficulty.Presets[name]) return false;
  Config.Difficulty.current = name;
  return true;
}

/** 只读快照（调试/存档用，改它不影响运行时）。 */
export function SnapshotConfig() {
  return DeepClone(Config);
}

export default Config;
