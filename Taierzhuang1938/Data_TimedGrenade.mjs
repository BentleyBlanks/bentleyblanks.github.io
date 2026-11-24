// Data_TimedGrenade.mjs — 爆炸测试场特制拉线温雷木柄手榴弹的纯数据参数（零 three，零函数）。
//
// 玩法口径：
//   · 独立于普通手榴弹（WEAPONS.Grenade），暂只作为爆炸测试场的特制木柄手榴弹；
//   · 拿在手上可见底盖已旋开的木柄尾端与拉火麻绳/瓷珠拉环；
//   · 按住左键（或右键先拉线拿在手上等，再左键投出）触发左手抓绳猛拉动作，拉火瞬间迸发火星与硫烟；
//   · 拉火后引信立即在手里倒计时燃烧，玩家可按目标距离决定温雷多久再扔出（可空爆或落地即炸，防止敌军躲闪）；
//   · 捏在手里超过引信时长会直接在手里起爆（面板可开关）。

export const TIMED_GRENADE = Object.freeze({
  id: "TimedStickGrenade",
  baseWeaponId: "Grenade",
  defaultFuseS: 4.2,
  fuseOptionsS: Object.freeze([3.0, 4.2, 5.5]),
  pullDurationS: 0.34,          // 左手伸出抓绳并猛拉离手的总时长
  igniteAt: 0.74,               // 拉线进度到达此处时火管发火、火星迸发并开始倒计时
  throwStartT: 0.35,            // 从温雷高举架势直接切入 FPS_GRENADE_THROW 的起始进度（避免重新蓄力延迟）
  overarmPower: 0.78,           // 左键标准长投力道（约 22–28 m，覆盖试爆场主靶区）
  underhandPower: 0.28,         // 右键温雷后再按右键的近距轻抛力道（约 10–14 m）
  minReleaseFuseS: 0.02,        // 脱手最低剩余引信（不截断到普通弹的 0.35 s，支持真正空爆与落地瞬爆）
  urgentFuseS: 1.35,            // 剩余低于此时进入急促燃烧阶段（震颤、火星加密、琥珀警示）
  criticalFuseS: 0.65,          // 剩余低于此时进入临爆阶段（剧烈喷焰、绯红脉冲）
  rearmDelayS: 0.52,            // 投出或手里起爆后取出下一枚新弹的间隔
  overcookBlastAheadM: 0.36,    // 手里自爆时的爆心位置（相对眼位向前）
  overcookBlastDropM: -0.14,    // 手里自爆时的爆心位置（相对眼位向下）
  airburstHeightM: 0.65,        // 起爆高度超过地面此值判定为「空爆」

  // 第一人称特制木柄弹附加件局部坐标（对照 _blender/Script_GrenadeDetail.py：弹头 -Z、木柄 +Z）
  geometry: Object.freeze({
    tailZ: 0.108,               // 木柄底端开口位置
    bandZ: -0.078,              // 铸铁弹头中段红布警示环位置
    bandRadiusM: 0.0262,
    bandHeightM: 0.024,
    wrapZ: -0.016,              // 木柄颈部缠绳/布箍位置
    wrapRadiusM: 0.0148,
    wrapHeightM: 0.022,
    cordSegments: 10,
    cordRadiusM: 0.0032,
    cordRestLengthM: 0.076,     // 待拉线时垂在柄尾的麻绳长度
    cordPullStretchM: 0.165,    // 拉断前被左手拽直的最大长度
    beadRadiusM: 0.0098,        // 瓷珠拉头半径
    ringRadiusM: 0.0155,        // 拉环半径
    ringTubeM: 0.0024,
  }),

  // 第一人称持握 / 拉线 / 温雷姿态（相机 / armAnchor 空间）
  poses: Object.freeze({
    // 待拉线：抬高并微倾弹柄，让红布警示带、麻绳箍、敞口铜尾、垂挂麻绳与瓷珠拉环完整落在视野右下
    ready: Object.freeze({
      mountPos: Object.freeze([0.128, 0.020, -0.392]),
      mountEuler: Object.freeze([0.56, -0.36, 0.24]),
      leftHand: Object.freeze([-0.068, -0.145, -0.360]),
      leftEuler: Object.freeze([0.15, 0.45, -0.35]),
      rightShoulder: Object.freeze([0.19, -0.36, 0.04]),
      leftShoulder: Object.freeze([-0.19, -0.38, 0.04]),
      rightElbow: Object.freeze([0.38, -0.76, 0.15]),
      leftElbow: Object.freeze([-0.38, -0.76, 0.15]),
    }),
    // 拉线抓握顶峰：右手稳住弹柄并略微横倾，左手直接伸到柄尾捏住瓷珠拉环
    pullGrab: Object.freeze({
      mountPos: Object.freeze([0.082, 0.022, -0.392]),
      mountEuler: Object.freeze([0.58, -0.46, 0.36]),
      leftHand: Object.freeze([0.032, -0.100, -0.355]),
    }),
    // 猛拉离手：右手微向右后收稳，左手向左下方狠拽拉断火绳（全程在镜头内清晰可见）
    pullYank: Object.freeze({
      mountPos: Object.freeze([0.138, 0.034, -0.378]),
      mountEuler: Object.freeze([0.64, -0.26, 0.16]),
      leftHand: Object.freeze([-0.072, -0.132, -0.352]),
    }),
    // 温雷待投：右手持雷举在视野右侧（整颗红布弹头、木柄、敞口尾管与火花细烟完整入画不裁边）
    cook: Object.freeze({
      mountPos: Object.freeze([0.158, -0.012, -0.372]),
      mountEuler: Object.freeze([0.68, -0.22, -0.08]),
      leftHand: Object.freeze([-0.175, -0.260, -0.310]),
      rightShoulder: Object.freeze([0.21, -0.35, 0.03]),
      leftShoulder: Object.freeze([-0.19, -0.40, 0.04]),
      rightElbow: Object.freeze([0.24, -0.80, 0.15]),
      leftElbow: Object.freeze([-0.42, -0.82, 0.15]),
    }),
  }),

  // Seedream 5.0 Pro 生成的贴图（全部登记于 Data_TextureManifest.mjs，带缓存戳）
  textures: Object.freeze({
    sparkAtlas: "./Texture/Texture_GrenadeFuseSpark_01.webp?v=20261124",
    smokeAtlas: "./Texture/Texture_GrenadeFuseSmoke_01.webp?v=20261124",
    bandBase: "./Texture/Texture_TimedGrenadeBandBase.webp?v=20261124",
    bandNormal: "./Texture/Texture_TimedGrenadeBandNormal.webp?v=20261124",
    bandOrm: "./Texture/Texture_TimedGrenadeBandOrm.webp?v=20261124",
  }),

  // 特效预算与节奏
  vfx: Object.freeze({
    sparkPool: 36,
    smokePool: 28,
    igniteBurstSparks: 22,
    igniteBurstSmoke: 6,
    cookSparkRateBase: 22,
    cookSparkRateCritical: 48,
    cookSmokeRateBase: 14,
    cookSmokeRateCritical: 26,
    flightSparkIntervalS: 0.022,
    flightSmokeIntervalS: 0.030,
    lightIntensityBase: 0.65,
    lightIntensityIgnite: 2.2,
    lightDistanceM: 1.4,
  }),

  // 音效键（Script_Audio.RECIPES）
  audio: Object.freeze({
    pullCue: "grenadeCordPull",
    hissCue: "grenadeFuseHiss",
    hissIntervalS: 0.24,
  }),
});
