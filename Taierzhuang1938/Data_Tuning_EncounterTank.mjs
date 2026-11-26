// ===========================================================================
// Data_Tuning_EncounterTank.mjs —— 遭遇试玩与正式第一关九四式轻装甲车 AI/压迫力数值
//
// 纯 JSON 可序列化数据、零 three、零函数（遵守 Data_DataSources / Data_TextAndTuning 门禁）。
// 覆盖 05–06 弯北两辆九四式（tank1 / tank2）、08 沟口阻击九四式（tank3）及原版 11–13 沟北追车。
//
// 几何尺寸实测自 Model/Type94Tankette/Model_Type94Tankette.glb：
//   · Hull 外廓 X ∈ [-0.81, +0.81], Y ∈ [0.18, 1.24], Z ∈ [-1.37, +1.60]（全高含炮塔约 1.63 m）
//   · TurretYaw 原点 [0.083, 1.061, 0.538]，MachineGunYaw [0, 0.300, -0.417]，枪口至 -0.74 m
// ===========================================================================

export const ENCOUNTER_TANK = Object.freeze({
  hull: Object.freeze({
    // 物理碰撞盒半尺寸（米）与中心离地高度：贴合九四式实模，既能真挡步枪弹溅火星，也不越界卡人。
    half: Object.freeze([0.84, 0.84, 1.56]),
    centerY: 0.84,
    // 炮塔枢轴（车体局部坐标，米，-Z 为车头）
    turretOffset: Object.freeze([0.083, 1.061, 0.538]),
    // 机枪口（炮塔局部坐标，米，-Z 为枪口前方，略越过枪管尖 -0.74 防自撞）
    muzzleInTurret: Object.freeze([0, 0.28, -0.86]),
    // 车尾排气管与双侧履带扬尘挂点（车体局部坐标，米）
    exhaustOffset: Object.freeze([-0.55, 1.05, 0.45]),
    trackDustOffsets: Object.freeze([
      Object.freeze([-0.68, 0.14, 1.15]),
      Object.freeze([0.68, 0.14, 1.15]),
    ]),
    // 车体被炸毁后的烟火挂点（车体局部坐标，米）
    burnSmokeOffset: Object.freeze([0, 0.85, 0.15]),
  }),

  // --- 感知与威胁评估 --------------------------------------------------------
  perceive: Object.freeze({
    hz: 10,
    raysPerTick: 10,
    rangeM: 125,
    // 目标缩回掩体后仍记住其最后暴露位置多久（用于掩体沿持续压制扫射）
    memoryS: 6.5,
    // 玩家脱离视线超过 reexposeS 后再露头，重新从「首次接触扫地警告」起手
    reexposeS: 6.0,
    // 不同目标的基础权重：取消对玩家的隐藏偏心（player === squad），优先压制自动武器、诱饵与反坦克近距威胁
    weights: Object.freeze({
      player: 1.00,
      decoy: 2.35,
      heavyAlly: 1.65,
      squad: 1.00,
      zone: 0.55,
    }),
    // 动态战术加权：活跃射击、暴露姿态、反坦克近距绕侧、防锁死单人饱和冷却、双车射界分摊
    firingBonus: 1.35,
    heavyFiringBonus: 1.45,
    recentFireWindowS: 3.0,
    exposedBonus: 1.25,
    antiTankRangeM: 22,
    antiTankBonus: 2.40,
    saturationBursts: 2,
    saturationCooldownS: 6.0,
    saturationScale: 0.40,
    sharedTargetScale: 0.65,
    distanceFalloffM: 36,
    // 目标惯性：防止两目标分数接近时炮塔来回抽搐
    inertia: 1.32,
    // 看不见但记忆仍新鲜的目标打折系数
    unseenScale: 0.62,
    unseenZoneScale: 0.72,
  }),

  // --- 炮塔与枪管瞄准 --------------------------------------------------------
  turret: Object.freeze({
    // 轻型九四式单人手动炮塔比八九式 57 mm 轻巧得多，索敌与转向更灵敏
    scanRateRadS: 0.42,
    trackRateRadS: 1.05,
    whipRateRadS: 1.75,
    // 炮塔对齐容差（约 5.5°）与连射中重新追瞄门槛（约 14°）
    alignRad: 0.095,
    relayRad: 0.24,
    // 炮塔转到位后的短暂停顿（棘轮声骤停 → 马上开火的实战预兆）
    aimHoldMinS: 0.32,
    aimHoldMaxS: 0.58,
    // 炮塔俯仰（弧度）：九四式枪架实测范围 [-13°, +17°]
    pitchMinRad: -0.22,
    pitchMaxRad: 0.30,
    pitchRateRadS: 1.35,
    // 无目标时的炮塔警戒扫描半角与周期
    idleSweepArcRad: 0.52,
    idleSweepPeriodS: 7.2,
    // 紧贴车身死角（米）：玩家绕到后轮/车头正下方塞集束弹时枪管俯角够不到
    closeDeadZoneM: 3.3,
  }),

  // --- 九一式 6.5mm 车载机枪火力与压迫力 --------------------------------------
  mg: Object.freeze({
    // 射速间隔（秒，约 500 rpm ± 机械节律抖动，6.5×50mmSR 九一式车载机枪实史指标）
    shotIntervalS: 0.12,
    shotJitterS: 0.008,
    muzzleSpeedMps: 736,
    // 节制短点射（5–8 发精准点射）与换气停顿；50 发漏斗弹仓打空后进入真实换弹窗口
    burstMinS: 0.60,
    burstMaxS: 0.96,
    restMinS: 0.85,
    restMaxS: 1.35,
    // 压制躲在掩体后的目标：12 发左右掩体沿压制扫射 + 较长换气
    suppressBurstS: 1.44,
    suppressRestMinS: 1.40,
    suppressRestMaxS: 2.00,
    // 50 发九一式十弹夹漏斗：单车长装填需 4.8–5.6 秒，构成真实的突进/换位战术窗口
    hopperCapacity: 50,
    reloadMinS: 4.8,
    reloadMaxS: 5.6,
    // 首次接触「走进来」警告扫射：约 9 发从目标前方 walkInStartM 扫到掩体沿，零直接伤害但满压制
    walkInBurstS: 1.08,
    walkInStartM: 6.0,
    walkInDamageScale: 0,
    // 正式杀伤点射：修正双折问题（66 * 0.95 * 0.33 ≈ 20.7 HP/发，暴露约 5 发致命），友军保留压制不误杀剧情人物
    playerDamageScale: 0.95,
    allyDamageScale: 0.14,
    // 角散布模型（弧度，1 mil = 0.001 rad）：无稳定器行进间 45 mil 明显发散；短停 1.5x 瞄具从 24 mil 收敛至 9.5 mil
    coldSpreadRad: 0.024,
    settledSpreadRad: 0.0095,
    movingSpreadRad: 0.045,
    movingSpeedThresholdMps: 0.3,
    suppressSpreadRad: 0.022,
    zoneSpreadRad: 0.036,
    spreadFirstM: 0.85,
    spreadShrink: 0.70,
    spreadMinM: 0.28,
    spreadPerM: 0.012,
    moveResetM: 3.5,
    // 掩体压制与区域压制近距最小散布底线
    suppressSpreadM: 0.55,
    zoneSpreadM: 1.15,
    suppressDurationS: 5.2,
    freshContactS: 9.5,
    // 弹着近失额外压制：对玩家与掩体友军同时生效，真实体现被九一式压在沟底的质感
    suppressRadiusM: 6.8,
    suppressPlayerPerShot: 0.14,
    allySuppressRadiusM: 6.0,
    allySuppressPerShot: 0.16,
    // 允许发射的俯仰角限制（超出则不穿车体硬打）
    downRad: 0.36,
    upRad: 0.36,
  }),

  // --- 战斗反应（受击 / 观察缝致盲 / 手榴弹近爆） ------------------------------
  react: Object.freeze({
    // 玩家步枪子弹打在坦克装甲上：冒火星 + 叮当声，且强制甩炮塔回压（带冷却防无限风筝）
    bulletAggroCooldownS: 7.5,
    bulletAggroS: 4.5,
    // 连续瞄准射击炮塔与观察缝（3 秒内命中 3 发）：铅沫飞溅迫使车长缩回防盾停火 2.2 秒
    slitHitWindowS: 3.0,
    slitHitsToBlind: 3,
    slitBlindS: 2.2,
    slitBlindCooldownS: 9.0,
    // 手榴弹在车旁近爆：车身晃动 + 立刻甩炮塔朝投掷者方向狂扫压制
    blastRangeM: 9.0,
    blastAggroS: 5.0,
    blastCooldownS: 3.0,
    blastRockRad: 0.065,
    rockDecayRate: 5.5,
  }),

  // --- 行驶平滑追赶（切拍跳时间时按道路时速平滑行驶，杜绝视觉瞬移） ------------
  motion: Object.freeze({
    maxCatchupMps: 6.0,
    teleportSnapM: 65,
  }),

  // --- 引擎、震屏与粒子表现 ---------------------------------------------------
  pressure: Object.freeze({
    rumbleRangeM: 30,
    fireShakeRangeM: 22,
    fireShakePitchRad: 0.0045,
    idleRpm: 650,
    maxRpm: 1950,
    cruiseMps: 3.6,
    rpmLagS: 0.45,
    minDustSpeedMps: 0.35,
  }),

  // --- 音频配置（复用 TankAudio + tankMg） ------------------------------------
  audio: Object.freeze({
    mgCue: "tankMg",
    mgVolume: 0.94,
    mgAirCutHz: 0,
    pingCooldownS: 0.08,
    pingVolume: 0.78,
  }),

  // --- 幺娃 06g/06h 西坎吸引后车炮塔 -----------------------------------------
  decoyFire: Object.freeze({
    burstIntervalMinS: 2.2,
    burstIntervalMaxS: 3.4,
    shotsPerBurst: 4,
    shotSpacingS: 0.14,
    maxRangeM: 72,
  }),

  // --- 交战节奏与战区压制点（数据驱动，不写死在逻辑里） ------------------------
  engagement: Object.freeze({
    // 接近/静默段：保留引擎轰鸣、履带声、碰撞防弹与炮塔扫视，但不主动开车载机枪
    holdFireBeats: Object.freeze([
      "05a", "05b", "05c",
      "08b",
      "11a", "11b", "11c", "12a", "12b", "13a", "13b",
    ]),
    // 06g / 06h：幺娃在西坎用捷克式牵制后车炮塔（除非玩家进入正面极近距离或主动开火吸引）
    decoyBeats: Object.freeze({
      "06g": Object.freeze({ tankId: "tank2", actorId: "yao", priorityBoost: 2.8, playerOverrideRangeM: 12 }),
      "06h": Object.freeze({ tankId: "tank2", actorId: "yao", priorityBoost: 2.8, playerOverrideRangeM: 12 }),
    }),
    // 沟口阻击战壕沿压制点：即使我军全缩进沟底，沟北九四式也会按节奏横扫战壕沿制造强压迫
    trenchZonesByTank: Object.freeze({
      tank3: Object.freeze([
        Object.freeze({ id: "ditchLipCenter", x: 105.5, z: 477.2, weight: 0.75 }),
        Object.freeze({ id: "ditchLipEast", x: 113.5, z: 477.6, weight: 0.72 }),
        Object.freeze({ id: "ditchLipBridge", x: 99.8, z: 475.6, weight: 0.68 }),
        Object.freeze({ id: "ditchLipMid", x: 109.5, z: 477.4, weight: 0.70 }),
      ]),
    }),
    // 06a–06f 凹路弯口东侧战车压制点（兜底，当玩家与小队全躲在深沟里无直接视线时仍持续压制沟沿）
    roadZonesByTank: Object.freeze({
      tank1: Object.freeze([
        Object.freeze({ id: "bendNorthTrench", x: 90.0, z: 264.0, weight: 0.62 }),
        Object.freeze({ id: "bendAlcove", x: 93.5, z: 277.0, weight: 0.65 }),
      ]),
      tank2: Object.freeze([
        Object.freeze({ id: "bendWestSlope", x: 84.0, z: 274.0, weight: 0.60 }),
        Object.freeze({ id: "bendNorthRim", x: 89.0, z: 262.0, weight: 0.58 }),
      ]),
    }),
  }),
});
