// ===========================================================================
// Data_Tuning_Tank.mjs —— 第一关 03–05 那辆八九式中战车（甲）的手感与节奏数值
//
// 口径：docs/Data_FirstLevel0105Refactor20260923Contract.md §2 第 7 条、§5.7；
// 规则层 Script_FirstLevelTankBrain.mjs 只读这张表。纯数据、零 three、零副作用。
//
// 出处标注：
//   [史] 八九式中战车（甲）公开资料：全重约 12 t、100 hp 级水冷汽油机、公路约 25 km/h、
//        越野 10–15 km/h；炮塔手摇转动；主炮九〇式 57 mm 短身管，低初速（约 350 m/s）；
//        车体前部与炮塔后部各一挺九一式车载机枪。
//   [需] 用户 2026-09-23 原话与分包任务书给的数（加速 ~0.6、减速 ~1.2、原地 ≤0.35 rad/s、
//        手摇 0.22–0.30 rad/s、瞄准停顿 1.2–1.8 s、节奏 6–9 s ±1.5 s、后倒 ≤3 m、
//        decoyCooldownS 15 s、扫描 10–14 s 看 3 s、护兵 4 人车头前 5–8 m）。
//   [旧] 沿用 Data_Tuning_FirstLevel 里既有 tank* 值（实拍过的射界、弹速、伤害）。
//   [几] 按现有布局量出来的（几何扫描；Space 包重排后要重量）。
// ===========================================================================

/** 大脑开关：false 时 Runtime / FrontBattle 走旧的定时插值路径（可回退）。 */
export const TANK_BRAIN_ENABLED = true;

export const TANK = Object.freeze({
  brainEnabled: TANK_BRAIN_ENABLED,

  // --- 驾驶 -----------------------------------------------------------------
  drive: Object.freeze({
    // [史] 越野 10–15 km/h；前沿破路上再慢一档：巡航 2.2 m/s ≈ 8 km/h，挤压段 0.9 m/s。
    cruiseMps: 2.2,
    squeezeMps: 0.9,
    reverseMps: 0.8,
    // [需] 起步 ~0.6 m/s²（12 t 的车一档起步），刹车 ~1.2 m/s²。
    accelMps2: 0.6,
    decelMps2: 1.2,
    // [需] 停下才原地转向，≤0.35 rad/s；行进中转向率 = 速度 / 转弯半径（上限 moveTurnMaxRad）。
    pivotRadS: 0.32,
    turnRadiusM: 5.5,
    moveTurnMaxRad: 0.4,
    // 车头与路线切线差这么多以上：先停车原地转，转正了再走（不横着滑）。
    pivotThresholdRad: 0.3,
    // 原地转到这么正就起步。
    pivotDoneRad: 0.04,
    // 路线切线用前后各这么远的两个点求（把折线的尖角磨圆）。
    tangentSpanM: 2.2,
    // 到点判定与「停在语义路点上」的容差。
    arriveM: 0.15,
    // [需] 阶段内躲弹后倒上限。
    reverseMaxM: 3,
    // 引擎：怠速 / 满转（给音频与排气）。[史] 汽油机 1800 rpm 级。
    idleRpm: 600,
    maxRpm: 1800,
    // 负载 = 加速度项 + 速度项 + 原地转向项 + 挤压段加成，夹到 [0,1]。
    loadAccelWeight: 0.55,
    loadSpeedWeight: 0.35,
    loadPivotWeight: 0.45,
    loadSqueezeBonus: 0.35,
    // rpm 跟随负载的时间常数（秒）：油门不是开关。
    rpmLagS: 0.6,
    // 点头 / 后仰：纵向加速度 → 车体俯仰（弧度 / (m/s²)），上限。
    pitchPerAccel: 0.022,
    pitchMaxRad: 0.03,
  }),

  // --- 炮手（主炮 + 炮塔） -----------------------------------------------------
  gunner: Object.freeze({
    // [需] 10 Hz 感知，每 tick 至多 6 条视线。
    perceptionHz: 10,
    raysPerTick: 6,
    rangeM: 140,
    // 记忆：看不见之后按 lastKnown 处理多久。
    memoryS: 12,
    // [需] 手摇炮塔 0.22–0.30 rad/s（每次瞄准抽一次，同一次瞄准不变速）。
    traverseMinRad: 0.22,
    traverseMaxRad: 0.30,
    // 被炸 / 被打时「甩」炮塔：仍是手摇，只是摇得急一点。
    whipRad: 0.42,
    // 炮塔转到离目标这么近就停摇，开始瞄准停顿；目标又跑出 relayRad 就重新摇。
    alignRad: 0.03,
    relayRad: 0.09,
    // [需] 瞄准停顿 1.2–1.8 s：棘轮声停了 = 要开炮了。
    layMinS: 1.2,
    layMaxS: 1.8,
    // [需] 停车时节奏 6–9 s ±1.5 s（中值 7.5，抖 ±1.5 → 6–9）。
    intervalMidS: 7.5,
    intervalJitterS: 1.5,
    // [旧] tankCannonMinRangeM 12：再近主炮打不着（炮手从观察窗看不下去）。
    minRangeM: 12,
    // 俯仰：[需] −10°…+20°。
    pitchMinRad: -0.1745,
    pitchMaxRad: 0.349,
    pitchRateRad: 0.35,
    // [旧] 低初速 57 mm：沿用 tankShellSpeedMps 180（玩家看得出「弹着比炮口晚」）。
    shellSpeedMps: 180,
    // [旧] 炮弹：半径 5 m、伤害 85（与原 FireShell 一致）。
    shellRadiusM: 5,
    shellDamage: 85,
    // 散布：第一发 3.2 m，同一目标每连发一发 ×0.62，下限 0.7 m（「越打越准」）。
    scatterFirstM: 3.2,
    scatterShrink: 0.62,
    scatterMinM: 0.7,
    // 提前量：按目标水平速度 × 飞行时间，上限（防速度噪声把弹甩到天边）。
    leadMaxM: 4,
    // 对新暴露的玩家：第一发打在掩体沿上；没有掩体就打在他前面这么远的地上。
    warningShortM: 4.5,
    // 「新暴露」：玩家离开视线超过这么久再露头，下一发重新从警告弹开始。
    reexposeS: 6,
    // 目标权重（× 可见度 × 距离项 + 惯性）。被人操作的缴获机枪最高。
    weights: Object.freeze({
      mannedMg: 1.7, player: 1.0, leftGun: 1.25, luo: 0.9, guard: 0.75, squad: 0.6, zone: 0.55,
    }),
    // 距离项 = 1 / (1 + d / distanceFalloffM)。
    distanceFalloffM: 45,
    // 惯性：当前目标分数 ×1.35，换目标要明显更好才换。
    inertia: 1.35,
    // 看不见的目标：记忆里还新鲜就按 lastKnown 的掩体打 HE，分数打这个折。
    unseenScale: 0.55,
    // 保护：任何弹着点离 missionUntargetable / protect 的人至少这么远
    // （[旧] 弹片外沿 5 × BLAST.radiusScale 1.9 = 9.5 m，再留 0.3 m）。
    protectClearM: 9.8,
    // 区域目标（缺口封锁）默认散布 3–5 m。
    zoneScatterMinM: 3,
    zoneScatterMaxM: 5,
    // 前两次预兆让罗班长喊出来（bark "turretTraverse"），之后只靠声音与炮塔。
    calloutCount: 2,
  }),

  // --- 车体机枪 / 塔后机枪 ------------------------------------------------------
  mg: Object.freeze({
    // [旧] tankHullMgArcRad .45（≈26°）、俯仰 −0.18…+0.25、射速间隔 0.14 s、伤害倍率 0.65。
    hullArcRad: 0.45,
    downRad: 0.18,
    upRad: 0.25,
    shotIntervalS: 0.14,
    damageScale: 0.65,
    // 点射：1.2 s 一串，歇 2.0–2.8 s。
    burstS: 1.2,
    restMinS: 2.0,
    restMaxS: 2.8,
    // [需] 首次接触「走进来」：第一串从目标前 walkInStartM 处起，扫到目标，零伤害。
    walkInStartM: 9,
    // 之后的点射：散布（米）。
    spreadM: 1.0,
    // 看不见后按 lastKnown 压制多久（掩体沿上起土）。
    suppressS: 5,
    // 第一次接触判定：这么久没看见过这个目标，再看见算「首次」。
    freshContactS: 12,
    rangeM: 110,
  }),
  // 死角：玩家贴近这么近、又不在车体机枪射界里 → 炮塔转过来用塔后机枪 / 开舱盖喊护兵。
  deadZone: Object.freeze({
    rangeM: 10,
    // 塔后机枪射界（相对炮塔正后方）。
    rearArcRad: 0.35,
    // [需] ≥6 s 才转过来：半圈 π / 0.3 ≈ 10 s，最短也要 6 s。
    turnRad: 0.3,
    // 从发现贴身的人到塔后机枪能开火，最少这么久（炮塔手摇掉头 + 换人上塔后机枪）。
    minRearS: 6,
    // 舱盖喊人：冷却。
    hatchShoutCooldownS: 14,
  }),

  // --- 反应 -------------------------------------------------------------------
  react: Object.freeze({
    // [需] ≤8 m 的手榴弹 / 集束弹爆炸 → 后倒 1.5–3 m、炮塔甩向投掷者、机枪压 2 s、护兵散开。
    blastRangeM: 8,
    reverseMinM: 1.5,
    reverseMaxM: 3,
    // [旧] Data_Tuning_FirstLevelFront.bundleCoveredThrowRangeM 9：后倒后投掷者仍在这个距离内。
    keepThrowRangeM: 9,
    suppressS: 2,
    scatterS: 5,
    // [需] 枪弹打车体：每 15 s 最多被牵一次注意（不是无限诱饵）。
    decoyCooldownS: 15,
    decoyLookS: 3,
    // 观察窗关闭：挨一发就关这么久。
    slitClosedS: 1.6,
    // [需] 关注扫描：每 10–14 s 朝取弹沟 / 攻击支路看 3 s。
    scanMinS: 10,
    scanMaxS: 14,
    scanLookS: 3,
    // 同一次爆炸反应之后冷却（连扔两颗只算一次后倒）。
    cooldownS: 4,
  }),

  // --- 护兵槽 ------------------------------------------------------------------
  escorts: Object.freeze({
    // [需] 4 人两对，路两侧沟里，车头前 5–8 m。
    slots: Object.freeze([
      Object.freeze({ id: "ScreenL1", side: -1, ahead: 5 }),
      Object.freeze({ id: "ScreenR1", side: 1, ahead: 5 }),
      Object.freeze({ id: "ScreenL2", side: -1, ahead: 8 }),
      Object.freeze({ id: "ScreenR2", side: 1, ahead: 8 }),
    ]),
    // 车体中线到沟的横向距离（[几] 现有路宽约 7 m）。
    lateralM: 3.6,
    // 走着的时候：紧跟、半径小；停车在 firePoint/hullDown/block：推到路边掩体（半径放大让 AI 自己挑掩体）。
    moveRadiusM: 0.8,
    moveSlackM: 0.4,
    holdRadiusM: 4,
    holdSlackM: 1.2,
    holdPushM: 2.5,
    // 散开：半径与外推。
    scatterRadiusM: 5,
    scatterPushM: 4,
    // 喊人：往车的那一侧收。
    rallyRadiusM: 3,
  }),

  // --- 毁伤 --------------------------------------------------------------------
  damage: Object.freeze({
    // 只有这些爆炸物能伤车（普通手榴弹只引起反应）。
    explosives: Object.freeze(["GrenadeBundle"]),
    // [旧] tankTrackMinDamage 35：620 × (1 − d/4.2)² ≥ 35 → 约 3.2 m 内算炸到履带。
    trackMinDamage: 35,
    // 发动机舱 / 炮塔座圈是装甲顶盖：要贴上去炸（≥400 → 约 0.8 m 内，即落在后甲板 / 格栅 / 座圈上）。
    // 落在车旁地上的集束弹只断履带（MobilityKill），要「再补一下」才彻底哑火。
    engineMinDamage: 400,
    // 车体局部坐标（米，-Z 车头，+X 右）。[几] 按 Model_Type89Tank 外廓 4.30 × 2.15 × 2.56。
    zones: Object.freeze([
      Object.freeze({ id: "trackL", min: [-1.075, 0, -2.15], max: [-0.62, 1.1, 2.15], kind: "track", side: -1 }),
      Object.freeze({ id: "trackR", min: [0.62, 0, -2.15], max: [1.075, 1.1, 2.15], kind: "track", side: 1 }),
      Object.freeze({ id: "engineDeck", min: [-0.75, 1.2, 0.4], max: [0.75, 1.75, 2.1], kind: "engine" }),
      Object.freeze({ id: "engineGrille", min: [-0.8, 0.3, 2.0], max: [0.8, 1.5, 2.2], kind: "engine" }),
      Object.freeze({ id: "turretRing", min: [-0.75, 1.55, -1.47], max: [0.75, 1.95, 0.03], kind: "ring" }),
    ]),
    // 熄火：发动机咳嗽到停的时长（音频与排气读 rpm）。
    stallS: 1.8,
  }),

  // --- 表现（运行时读） ----------------------------------------------------------
  view: Object.freeze({
    // 炮管枢轴：炮塔局部坐标里的耳轴点（[几] Barrel 网格 z ∈ [−1.113, −0.579]，y ∈ [0.239, 0.394]）。
    trunnion: Object.freeze([0, 0.32, -0.6]),
    recoilM: 0.25,
    recoilReturnS: 0.45,
    // 履带贴图滚动：每米车速对应的 uv 位移（[几] 履带贴图 v 向一圈约 9.6 m）。
    trackUvPerM: 0.104,
    // 履带扬尘：两条履带后方（车体局部），按速度调强度。
    trackDust: Object.freeze({
      offsets: Object.freeze([Object.freeze([-0.85, 0.2, 2.2]), Object.freeze([0.85, 0.2, 2.2])]),
      source: Object.freeze({ kind: "dust", rate: 5, radius: 0.5, rise: 0.35, sizeStart: 0.14, sizeEnd: 1.1,
        life: 1.7, opacity: 0.18 }),
      minSpeedMps: 0.25,
    }),
    // 排气：发动机舱后格栅（车体局部），油门一脚一股黑烟。
    exhaust: Object.freeze({
      offset: Object.freeze([0.45, 1.25, 2.12]),
      puffLoad: 0.55,
      puffCooldownS: 0.9,
      source: Object.freeze({ kind: "black", rate: 1.4, radius: 0.08, rise: 0.6, sizeStart: 0.1, sizeEnd: 0.6,
        life: 1.4, opacity: 0.16 }),
      puff: Object.freeze({ kind: "black", rate: 14, radius: 0.12, rise: 0.9, sizeStart: 0.16, sizeEnd: 0.9,
        life: 1.6, opacity: 0.32 }),
      puffS: 0.35,
    }),
    // 开炮：炮口焰 cannon 档 + 地面尘环（1–1.5 s 遮蔽 = 天然窗口）。
    cannonMuzzleScale: 1,
    groundRing: Object.freeze({ radiusM: 3.2, lifeS: 1.3 }),
    // 震屏：25 m 内隆隆（按负载）；30 m 内开炮一记俯仰冲击。
    rumbleRangeM: 25,
    fireKickRangeM: 30,
    fireKickPitchRad: -0.035,
  }),
});

// ---------------------------------------------------------------------------
// 临时路点（现有布局）。Space 包正在重排 03–05，第二波 Front 包会换成新路；
// 这里只为在现布局上跑通「露面 → 驶出 → 预兆 → 先压阵位 → 封口 → 05 挤压」。
// [几] 2026-09-23 按 MISSION_LAYOUT.blocks + SampleMissionTerrain 扫过：全程车体外廓不碰实体；
//   · 起点在北面约 60 m 外的高地后面（阶段 03 看不见，只听得见）；
//   · 绕开 NorthRuin 东墙（x ≥ 68.5）与 FieldRuin2（x ≥ 62.3 过 z −174）；
//   · preview (55,−167)：阵位站姿只看得见炮塔、看不见车体（hull-down 剪影），炮口也够得着阵位；
//   · firePointNest (50,−162)：同样 hull-down，炮口对站姿阵位有视线；
//   · block (44.6,−146)：对缺口、阵位、攻击支路全通视；两次挤压往缺口方向推 2.5 m + 1.7 m，
//     投掷位 (39,−140) 到车 4.7–7.5 m（< bundleCoveredThrowRangeM 9）。
// 字段：kind 语义（cruise/hullDown/firePoint/squeeze/block）、stage（最早哪一步能到）、
//   holdUntil（到了这个点要等哪个事实才继续；"stage:<Id>" 表示等进入那一步）、holdS、
//   faceTo（停车时车头对着哪）。
// ---------------------------------------------------------------------------
const W = (x, z, kind = "cruise", extra = {}) => Object.freeze({ x, z, kind, ...extra });
const NEST = Object.freeze({ x: 27, z: -142 });
const GAP = Object.freeze({ x: -8, z: -139 });
export const TANK_TEMP_PATH = Object.freeze({
  id: "TempExistingLayout20260923",
  waypoints: Object.freeze([
    W(71, -265, "cruise", { stage: "Support" }),
    W(70.5, -215, "cruise", { stage: "Support" }),
    // 离图外等：阵位夺下以后引擎声已经能听见，前排守军撤下来（rifleWithdrawalResolved）才驶出。
    W(69.6, -203, "hullDown", { stage: "Support", holdUntil: "rifleWithdrawalResolved" }),
    W(69.6, -186, "cruise", { stage: "Support" }),
    W(66.5, -177.5, "cruise", { stage: "Support" }),
    W(62.8, -171.2, "cruise", { stage: "Support" }),
    // K5 露炮塔：03 的预告点。只转炮塔看阵位，不开火（03 主炮不许开，见运行时 weaponsFree）。
    W(55, -167, "hullDown", { stage: "Support", faceTo: NEST, holdUntil: "stage:MachineGun", preview: true }),
    // 04：驶出路弯 → hull-down 火力点压阵位，压住了（tankPositionPressured）才往前封口。
    W(50, -162, "firePoint", { stage: "MachineGun", faceTo: NEST, holdS: 10, holdUntil: "tankPositionPressured" }),
    W(46.5, -153.5, "cruise", { stage: "MachineGun" }),
    W(44.6, -146, "block", { stage: "MachineGun", faceTo: GAP, holdUntil: "stage:Tank" }),
    // 05：往缺口挤两次（每次都有油门、履带尖啸、排气）。
    W(42.3, -145.2, "squeeze", { stage: "Tank", faceTo: GAP, holdS: 14 }),
    W(40.6, -144.8, "squeeze", { stage: "Tank", faceTo: GAP }),
  ]),
  // 关注扫描点：取弹沟、攻击支路（05 才看）。
  scan: Object.freeze([
    Object.freeze({ x: 27, z: -119, stage: "Tank" }),
    Object.freeze({ x: 35, z: -127, stage: "Tank" }),
    Object.freeze({ x: 38, z: -134, stage: "Tank" }),
  ]),
  stageOrder: Object.freeze(["Support", "MachineGun", "Tank", "Orders"]),
});
