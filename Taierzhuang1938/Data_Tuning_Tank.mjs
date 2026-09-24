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
import { FRONT_TANK_PATH, FRONT_SPACE, FRONT_SORTIE } from "./Data_FirstLevelFrontRoute.mjs";
import { FRONT_TANK_ESCORT_SLOTS } from "./Data_FirstLevelMissionFront.mjs";
import { FRONT_UNBREAKABLE } from "./Data_FirstLevelFrontBreakables.mjs";

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
    // 相邻两段夹角超过这个就是折返点（HullDown 折返顶约 160°）：切线不跨它磨圆，离开时先原地掉头。[几]
    reversalRad: 1.75,
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
    // HE 瞄点离地高度：要贴着地面，炮弹才在瞄点炸（FireShell 只在碰到地面 / 实体时起爆）。
    // 2026-09-24 实测：原来瞄离地 0.5 m，打人的弹从瞄点上方飞过去、落在 17 m 外 —— 04 撤回后墙的路上
    // (34–36, −124) 一串弹坑就是这么来的。
    burstRiseM: 0.05,
    // 散布：第一发 3.2 m，同一目标每连发一发 ×0.62，下限 0.7 m（「越打越准」）。
    scatterFirstM: 3.2,
    scatterShrink: 0.62,
    scatterMinM: 0.7,
    // 提前量：按目标水平速度 × 飞行时间，上限（防速度噪声把弹甩到天边）。
    leadMaxM: 4,
    // 对新暴露的玩家：第一发打在掩体沿上；没有掩体就打在他前面这么远的地上。
    warningShortM: 4.5,
    // 警告弹只砸土不要命：伤害乘这个数（2026-09-23 实测：满伤害的沿上一发在 1.8 m 外
    // 把只剩 15 血的玩家直接炸死，预兆等于没给）。落点离还没被警告过的玩家这么近的任何一发
    // （包括轰阵位掩体的区域弹）都按警告弹算。
    // 2026-09-24：0.2 → 0.04。Player.TakeHit 不论伤害大小**每一下都开一道流血伤口**（约 0.7 HP/s，叠加），
    // 0.2 × 85 贴身还有 9 点、照样开伤口；0.04 × 85 = 3.4 低于 BLAST.playerMinDamage 4 → 只给压制、不进 TakeHit。
    warningDamageScale: 0.04,
    warningRadiusM: 4.5,
    // 「新暴露」：玩家离开视线超过这么久再露头，下一发重新从警告弹开始。
    reexposeS: 6,
    // 目标离上一发瞄准时的位置挪开这么远（跑动、换掩体）：散布回到 scatterFirstM 重新收敛。
    // 2026-09-24 审查实测：04 撤离途中一直在视线里往后撤的玩家吃到越来越准的满伤害炮弹（落点 11.4 / 2.6 / 7.2 m）。
    moveResetM: 4,
    // 剧本撤离窗口（04 阵位被压住以后、玩家回到阵位后墙 rightRearReached 以前）：战车照样开炮、照样砸土，
    // 但落在玩家弹片范围里的那一发只按这个比例伤人，权重也降一档（先封缺口）。「退后墙！」是命令，不是陷阱。
    // 同警告弹：低于 BLAST.playerMinDamage，只压制不开伤口（2026-09-24 实测 0.2 时撤离途中两下擦伤叠出 3.6 HP/s 的流血）。
    // 车体机枪对带上限的目标这一串整串不伤人（机枪弹一中就是一道伤口）。
    retreatDamageScale: 0.04,
    retreatWeightScale: 0.5,
    // 打不死的剧情人物（scriptEssential：何有田、罗班长…血量托底到 1）：权重乘这个数。
    // 2026-09-24 审查实测：05 里主炮 11 发全打 60–80 m 外守左机枪的何有田，玩家那条攻击支路 3–10% 的时间被指着。
    essentialScale: 0.12,
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
    // 区域目标（阵位 / 缺口）看不见时照样打（打它前面那道掩体的沿），分数打这个折。
    unseenZoneScale: 0.8,
    // 保护：任何弹着点离 missionUntargetable / protect 的人至少这么远
    // （[旧] 弹片外沿 5 × BLAST.radiusScale 1.9 = 9.5 m，再留 0.3 m）。
    protectClearM: 9.8,
    // 上面那条量的是**真炸点**，不只是瞄点（Script_FirstLevelTankRuntime.SafeShellAim）：瞄点推到 9.8 m 外，
    // 弹道却先撞上半路的沟沿 / 墙，照样炸在人跟前。2026-09-24 Front 探针实测：05 封缺口的区域弹瞄在缺口北面
    // (−8, −145)，从东南的 Block 打过来先撞 z ≈ −149 的沟沿，离最后一道掩体后待撤的守军 5.8–8.6 m，
    // 一趟 6 发把他们磨到 17–45 血，另一趟六人全灭（guardBatchLost，任务失败）。
    // 真炸点不够远：瞄点往炮口方向收 protectPullM 再算，最多 protectPullSteps 次；还不够这一发不打。
    protectPullM: 3,
    protectPullSteps: 4,
    // 同一个收瞄循环顺带管「打过头」：真炸点沿射向越过这一次试的瞄点超过 overshootMaxM，也往炮口收一步再算。
    // 2026-09-24 Front 包审查：缺口区的弹常越过缺口 8–12 m，落进我方后沟 (−16, −140) 一带 —— 05 玩家回撤、守军过缺口后
    // 走的就是那里。只有保护够了而过头收不回来时，照打保护够的那一发（不因过头少打）。
    overshootMaxM: 6,
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
    restMinS: 2.4,
    restMaxS: 3.4,
    // [需] 首次接触「走进来」：第一串从目标前 walkInStartM 处起，扫到目标，零伤害。
    walkInStartM: 9,
    // 之后的点射：散布（米）= spreadM + spreadPerM × 距离（车体机枪从观察窗里打，远了打不准）。
    spreadM: 1.0,
    spreadPerM: 0.025,
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
    // 车还在远处（03 从图外开进来）时，护兵照旧打自己的仗；车开到离他这么近才接过来跟车。
    joinRangeM: 30,
    // 路点自带的绝对护兵槽（Block/Squeeze → FRONT_TANK_ESCORT_SLOTS，弹坑）：守区半径与掩体余量都小 ——
    // 余量一大 AI 会挑坑外的掩体，从那儿顺土坎南坡看得见缺口（Space 包 09-24 实测）。[几]
    slotRadiusM: 1.2,
    slotSlackM: 0.8,
    // 车彻底哑火以后护兵沿来路（倒着走战车路点）撤回路线起点：到一个路点算 retreatArrivalM，跑步速度。[需]
    retreatArrivalM: 4,
    retreatSpeedMps: 3.2,
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
      // 后甲板：模型里的甲板在 1.2–1.75 m；但车的碰撞盒是一整只 2.56 m 高的盒子（MissionView.tankCollider），
      // 扔上车顶的那捆停在盒顶 2.56 m 上 —— 顶到 2.62 才认得出「落在后甲板上」。[几]
      Object.freeze({ id: "engineDeck", min: [-0.75, 1.2, 0.4], max: [0.75, 2.62, 2.1], kind: "engine" }),
      Object.freeze({ id: "engineGrille", min: [-0.8, 0.3, 2.0], max: [0.8, 1.5, 2.2], kind: "engine" }),
      Object.freeze({ id: "turretRing", min: [-0.75, 1.55, -1.47], max: [0.75, 1.95, 0.03], kind: "ring" }),
    ]),
    // 熄火：发动机咳嗽到停的时长（音频与排气读 rpm）。
    stallS: 1.8,
    // 罗班长补刀（契约 §2 第 7 条「必须再投或罗班长补一枚」）：断了履带、玩家手里一捆集束弹都没有了，
    // 这样僵了这么久，由他往舱盖里塞一颗（Disabled，zone "luoHatch"）。兜底卡关，不是常规路线：
    // 常规是回弹药屋再领（MobilityKill 以后弹药屋照样开）。
    luoFinishS: 30,
  }),

  // --- 声音（Script_TankAudio 读；Step 2 · 2026-09-23） -------------------------------
  // 素材与许可见 Data_SfxSources.TANK_SFX。烘焙时每条都对齐到有声段 −25 dBFS，层与层之间原本的
  // 响度差（怠速比高转轻多少）在这里还原 —— 不烘进文件，调手感不用重烘。
  audio: Object.freeze({
    // 声源尺寸（Play 的 sourceSizeM → panner refDistance）：[史] 车长 5.7 m，一台 118 hp 汽油机 + 两条钢履带
    // 不是一个点，也不是一个人那么响。给 10 m：130 m 外（03 夺点处到路线起点）比 5 m 口径亮 8 dB，
    // 仍按距离衰减（先闻其声、听得出方向，但不盖过身边的枪）。2026-09-23 实测：5 m 时 196 m 外有效电平 0.031。
    sourceSizeM: 10,
    // 挂点高度（车体局部 y，米）：发动机 / 履带在车体中部偏下，手摇在炮塔里。
    engineY: 1.1,
    turretY: 1.8,
    // 发动机两层等功率交叉：x = (rpm − 怠速) / (满转 − 怠速)。
    // [素] 四号 G 型原录音里怠速段比稳态高转段轻约 9.5 dB（−24.3 vs −14.9 dBFS 有声段），烘焙对齐之后在这里还原。
    idleGain: 0.34,
    loadGain: 1.0,
    // 负载（踩油门、挤压、原地转）再抬一点：同样的转速，吃力的时候更「闷」更响。[需] 手感值。
    loadBoostDb: 3,
    // [需] 任务书：发动机 ±12% 变速。怠速层与负载层各自在自己的转速区间里变。
    rateMin: 0.88,
    rateMax: 1.12,
    // 次低频点火脉冲：[史] 八九式甲为直列六缸四冲程，点火频率 = rpm × 6 / 120 = rpm / 20
    //（600 rpm → 30 Hz）。[需] 夹在 30–70 Hz。
    subHzPerRpm: 1 / 20,
    subMinHz: 30,
    subMaxHz: 70,
    subGain: 0.28,
    subLoadGain: 0.22,
    // 引擎还「活着」的门槛：rpm 低于这个就当熄火了（大脑熄火时 rpm 在 stallS 里掉到 0）。
    runningRpm: 60,
    // 履带：增益 = (|车速| / 巡航)^0.7 + 原地转向项；变速随车速。
    tracksGain: 0.9,
    tracksPivotGain: 0.6,
    tracksRateMin: 0.7,
    tracksRateMax: 1.15,
    // 手摇炮塔：摇的时候响、停摇就停（「棘轮声停了 = 要开炮了」，任务书）。
    // 变速随转速：0.22–0.30 rad/s 手摇在 0.9–1.1 之间，甩炮塔（0.42）到 1.25。
    crankGain: 0.85,
    crankRateRefRad: 0.26,
    crankRateMin: 0.8,
    crankRateMax: 1.25,
    // 起 / 停的时间常数（秒）：停要快，预兆才读得出来。
    crankAttackS: 0.03,
    crankReleaseS: 0.05,
    // 一般参数的平滑（秒）。
    smoothS: 0.12,
    // 03「先闻其声」：车还没开进图（阵位没夺下）时，引擎已在路线起点怠速，音量从零渐起。
    offstageFadeInS: 5,
    // 主炮三层按距离等功率交叉（米）：≤ nearM 只有近层；nearM–midM 近→中；midM–farM 中→远；≥ farM 只有远层。
    // [素] 近层是近距离设计音，中 / 远层录于林地远处（估计 100 m 上下）。
    cannonNearM: 25,
    cannonMidM: 60,
    cannonFarM: 110,
    cannonVolume: 1,
    // 区域尾音：借枪尾那套（按声源所在区挑），降调当炮用。
    tailGain: 0.6,
    tailPitch: 0.62,
    // 低速炮弹掠过：弹道离听者最近处 ≤ passRadiusM、且落点在听者身后（沿弹道再往前 ≥ passBeyondM）才算「飞过去了」。
    // 落在脚边的那发交给爆炸本身。
    passRadiusM: 7,
    passBeyondM: 3,
    passVolume: 0.9,
    // 一次性音节流（秒）。
    squealCooldownS: 2.5,
    pingCooldownS: 0.08,
    // 履带尖啸：起步 / 刹车 / 原地转 / 倒车各多响。
    squealVolume: Object.freeze({ start: 0.55, halt: 0.9, pivot: 0.7, reverse: 0.65 }),
    pingVolume: 0.7,
    slitVolume: 0.45,
    slitPitch: 1.25,
    hatchVolume: 0.8,
    stallVolume: 1,
    jamVolume: 0.8,
    // 车载机枪：[史] 九一式车载机枪（十一年式的车载版）→ 机枪类 cue；枪在车体里，隔着钢板与观察孔，
    // 车外听是闷的：低通 2.6 kHz。
    mgCue: "type11",
    mgAirCutHz: 2600,
    mgVolume: 0.8,
    // 熄火之后：冷却滴答（延迟、间隔、持续多久、渐弱）。
    coolDelayS: 4,
    coolEveryMinS: 1.8,
    coolEveryMaxS: 4.5,
    coolForS: 50,
    coolVolume: 0.8,
  }),

  // --- 事实判据（运行时读） -------------------------------------------------------
  // tankPositionPressured「炮弹实际命中右侧射位周边」：阵位四周的墙（东墙 6.5 m、北面残墙 5 m）
  // 挡下的炮弹落在 7.5–9.5 m 上（2026-09-23 实跑），旧的 8 m 让玩家在阵位上多挨三发才放行撤退。
  pressureRadiusM: 10,
  // 04 阵位区域目标的权重（× gunner.weights.zone 0.55）：高过玩家 / 机枪手，保证「先压阵位」一定兑现。
  nestZoneWeight: 6,

  // --- 表现（运行时读） ----------------------------------------------------------
  view: Object.freeze({
    // 炮管枢轴：炮塔局部坐标里的耳轴点（[几] Barrel 网格 z ∈ [−1.113, −0.579]，y ∈ [0.239, 0.394]）。
    trunnion: Object.freeze([0, 0.32, -0.6]),
    recoilM: 0.25,
    recoilReturnS: 0.45,
    // 履带贴图滚动：每米车速对应的 u 位移（[几] 履带网格 u 沿车长约 0.51 / m，贴图横向周期平铺）。
    trackUvPerM: 0.51,
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
    // 2026-09-24 审查：原 16 粒 / 不透明 0.34 / 终态 1.3–2.0 m 在截图里「只在车脚边一点土」，挡不住车前视线。
    // 两圈（外圈铺开、内圈堆高）、粒子数有下限（低画质 spawnScale 也减不没）、终态 2.4–3.4 m、不透明 0.55。
    groundRing: Object.freeze({ radiusM: 3.6, lifeS: 1.4, count: 34, minCount: 22, opacity: 0.55, sizeStart: 0.5,
      sizeEnd: Object.freeze([2.4, 3.4]), rise: Object.freeze([0.5, 1.2]), rings: 2 }),
    // 震屏：25 m 内隆隆（按负载）；30 m 内开炮一记俯仰冲击。
    rumbleRangeM: 25,
    fireKickRangeM: 30,
    fireKickPitchRad: -0.035,
  }),

  // --- 进场闸（运行时读） ---------------------------------------------------------
  // 03 阵位夺下（rightNestCaptured）那一刻车才开进图。2026-09-24 实测：临时路线起点离阵位 130 m、有视线，
  // 能不能看见全靠雾 —— 雾挡不住的机位下车会凭空冒出来。所以只在「起点不在玩家视野里」时才进场：
  // 没有视线，或者不在玩家朝向 ±offViewRad 以内（屏幕外）。等太久（maxWaitS）照样进，不卡流程。
  // fact：车开进图要等的事实（Front 包 09-24）。Notion 03「第一批撤退尾声，右前方道路远段传来发动机和履带声」——
  // 第一批开始撤（frontRifleDefense）时起步，路堑起点到 HullDown 75 m ≈ 36 s，正好撤退尾声露炮塔。
  entry: Object.freeze({ fact: "frontRifleDefense", offViewRad: 1.15, maxWaitS: 30, lookY: 2.2 }),

  // --- 运行时开销（契约 §6） -----------------------------------------------------------
  perf: Object.freeze({
    // 护兵锚点：模式没变时，锚点挪了这么远才重下一次 Defend（原 0.4 m ⇒ 巡航时每人约 5 Hz）。
    escortRecommandM: 1.5,
    // 停车推到路边掩体（AiCover）：在大脑给的锚点这么远以内找掩体点。
    escortCoverSearchM: 5,
    escortCoverRadiusM: 1.2,
  }),

  // --- 大脑喊话 → 战斗喊话（契约 §2 第 7 条「靠声音、炮塔指向和罗班长喊话传达窗口」） ------------------
  // 2026-09-24 Front 包：这些是**战斗喊话**，不是剧情对白 —— 走 Script_Audio.Bark 按 key 点名（让剧情对白、受
  // 节流闸管），中方是罗班长的本人版本（Data_FirstLevelVoiceCast 的 leader 一套，从他的位置喊），日方从车上喊。
  //   { key: Data_Voice 的 key, kind: 那一行的 kind, who?: 班组谁喊（从他的位置）, side?: "ija" = 从炮塔喊 }
  // null = 不喊（tankDisabled 由 05 的剧情对白「停了！口子能过！」交代；观察窗关上只有音效）。
  // 同一个 key 两次之间至少隔 barkCooldownS。数量克制：中方三句、日方一句新录，护兵散开借现成的「伏せろ」。
  barkCues: Object.freeze({
    turretTraverse: Object.freeze({ key: "tank_turret", kind: "tank", who: "luo" }),   // 预兆链前两次
    tankWindow: Object.freeze({ key: "tank_window", kind: "tank", who: "luo" }),       // 05：炮塔在打缺口、玩家在攻击支路上
    trackCut: Object.freeze({ key: "tank_track", kind: "tank", who: "luo" }),          // MobilityKill
    tankDisabled: null,
    hatchShout: Object.freeze({ key: "ija_tank_side", kind: "tank", side: "ija" }),    // 车长开舱盖喊护兵
    escortScatter: Object.freeze({ key: "ija_warn_down", kind: "warn", side: "ija" }), // 近处爆炸，护兵散开
    visionSlit: null,
  }),
  barkCooldownS: 8,
  // 被剧情对白让路（Audio.Bark 在 dialogueYield 下返回 null）的喊话在这么多秒内补喊，过期或不再成立就丢。
  // 2026-09-24 Front 包审查：「履带断了！还在打！再补一捆！」正落在投弹那一刻开播的 BundleRetreat 场景里，一次都没播出来；
  // 日军车长那句同理。trackCut 在车已 Disabled 后不再补（「再补一捆」已经不成立）。
  barkRetryS: Object.freeze({ trackCut: 12, hatchShout: 6, tankWindow: 4 }),
  // 补喊排着队、或刚喊出口的这么多秒里，下一场前沿对白先不开口（Script_FirstLevelFrontScenes 读 HoldsDialogue）：
  // 战车喊话最长一句 2.36 s（Data_Voice tank_track）。「回来！低头！」（BundleRetreat）还没开口时履带就断了，
  // 那一句直接让给「再补一捆」—— 两句意思相反。
  barkHoldS: 2.5,
  // 「它在打口子！就现在！」的时机（接线层判，不是大脑）：05 领了集束弹、车还没解决、玩家在攻击支路的沟线上，
  // 大脑正瞄着缺口（targetId "gapZone"）且炮塔偏离玩家方位超过 angleRad —— 这就是冲上去的空当。[需]
  window: Object.freeze({ angleRad: 1.0, laneRadiusM: 4, cooldownS: 14 }),
});

/** 大脑喊话 → 台词表（上面 TANK.barkCues 的只读别名，接线层用）。 */
export const TANK_BARK_CUES = TANK.barkCues;

// 可破坏掩体的数据在 Space 包的 Data_FirstLevelFrontBreakables.mjs（运行时经 Script_FirstLevelFrontBreakables.SpaceBreakableSpecs
// 换格式）；Tank 包在旧布局上的临时数据 FRONT_BREAKABLES_TEMP 已删（2026-09-24 Front 包）。

/**
 * 永远不可破坏（任务书：阵位后墙、支沟、守军安全区）。数据里写了也拒绝。
 *   ids   —— 按体块名：阵位后墙 / 东墙（挡战车直射的唯一实遮挡）、守军安全区的横墙。
 *   zones —— 按区域（MISSION_LAYOUT.zones 的语义 id）：可破坏物外廓的任何一点落在区里就拒绝。
 *            rightRear = 阵位后墙南侧的支沟岔口（后交通壕安全区）；withdrawalGap = 缺口与守军撤离安全区。
 *            Space 重排后只要 zone 语义 id 不变，这条保护就跟着新布局走（不靠体块名对上）。
 */
export const NEVER_BREAKABLE_RULES = Object.freeze({
  // 2026-09-24：体块名取 Space 包的永不破坏表（阵位后墙两段、东山墙、西门高墙、最后遮挡、攻击支路掩护、横墙、旧院与弹药屋）。
  ids: Object.freeze([...FRONT_UNBREAKABLE]),
  zones: Object.freeze(["rightRear", "withdrawalGap"]),
});

// ---------------------------------------------------------------------------
// 战车路（Front 包 2026-09-24 接 Space 包的 FRONT_TANK_PATH，取代 Tank 包在旧布局上的临时路点 TANK_TEMP_PATH）。
// 空间事实（坐标、kind、faceTo/turretTo、holdS、可见性）全在 Data_FirstLevelFrontRoute.FRONT_TANK_PATH 与
// docs/Data_FirstLevelSpace0106_20260923.md §6；这里只加大脑要的**节奏**字段：
//   stage      最早哪一步能到（大脑按步骤拴住：03 停在路弯后 Bend 等 04，04 停在 Block 等 05）；
//   holdUntil  到了这个点要等哪个事实才继续（"stage:<Id>" 表示等进入那一步）；
//   preview    03 的露面点（HullDown 折返顶，停 holdS=15 s 记 tankPreviewed）；
//   escortSlots 停在这儿时护兵去的绝对位置（FRONT_TANK_ESCORT_SLOTS）。
// faceTo 按 FRONT_SPACE.tankTargets 的名字换成坐标。HullDown 是折返顶：停完原地掉头约 160° 驶向 Descent
// （drive.reversalRad，大脑不跨折返点磨圆切线）。开进图的时机见 entry.fact。
// ---------------------------------------------------------------------------
const TankTarget = (name) => name ? Object.freeze({ x: FRONT_SPACE.tankTargets[name].x, z: FRONT_SPACE.tankTargets[name].z }) : undefined;
const TANK_PACE = Object.freeze({
  Start: { stage: "Support" }, Cutting: { stage: "Support" }, CrestEast: { stage: "Support" }, Shadow: { stage: "Support" },
  HullDown: { stage: "Support", preview: true },
  Descent: { stage: "Support" },
  // 03 露面以后退回北残院后面，在路弯里等 04（从机枪座看不见）。
  Bend: { stage: "Support" },
  BendExit: { stage: "MachineGun" },
  // 04：驶出路弯 → 压阵位，压住了（tankPositionPressured）才往前封口。
  Pressure: { stage: "MachineGun", holdUntil: "tankPositionPressured" },
  Approach: { stage: "MachineGun" },
  // 05 也停在 Block，不再往 Squeeze 挤：Squeeze 离攻击位 11 m，后甲板（发动机舱，车顶 2.56 m）要初速 13.2 m/s 才够得着，
  // 集束弹上限 13 —— 两段毁伤的第二颗扔不上去（09-24 战车探针：第二颗落在近侧履带边，Disabled 记成 trackL；
  // 05 车体机枪也一串没打）。Block 离攻击位 9.7 m，后甲板要 12.6 m/s。车断了履带（tankImmobilized）也就走不了了。
  Block: { stage: "MachineGun", holdUntil: "tankImmobilized", escortSlots: FRONT_TANK_ESCORT_SLOTS },
  // Squeeze 现在到不了（Block 一直等到 tankImmobilized，断了履带也就走不了）：Space 的语义路点照留、大脑不再走到这里；
  // Space 文档 §6「05 前挤到 Squeeze」与此不符，删不删这个路点由 Space 包 / 集成负责人定（2026-09-25 Front 包审查）。
  Squeeze: { stage: "Tank", escortSlots: FRONT_TANK_ESCORT_SLOTS },
});
const Seg = (a, b, stage) => Object.freeze({ x: a.x, z: a.z, stage });
export const FRONT_TANK_BRAIN_PATH = Object.freeze({
  id: "FrontTankPath20260923",
  waypoints: Object.freeze(FRONT_TANK_PATH.map((w) => {
    const pace = TANK_PACE[w.id];
    if (!pace) throw new Error(`Data_Tuning_Tank: no pace for tank waypoint ${w.id}`);
    return Object.freeze({ id: w.id, x: w.x, z: w.z, kind: w.kind, ...(w.faceTo ? { faceTo: TankTarget(w.faceTo) } : {}),
      ...(w.turretTo ? { turretTo: TankTarget(w.turretTo) } : {}), ...(w.holdS ? { holdS: w.holdS } : {}), ...pace });
  })),
  // 关注扫描点（05 才看）：取弹沟受损沟沿、后墙岔口、攻击支路中段。
  scan: Object.freeze([Seg(FRONT_SORTIE.damagedLip, null, "Tank"), Seg(FRONT_SORTIE.rear, null, "Tank"),
    Seg(FRONT_SORTIE.attackRoute[3], null, "Tank")]),
  // 区域火力（05）：攻击支路（FRONT_SORTIE.attackRoute，后墙岔口 → 路边攻击位）。玩家进了沟线 radiusM 以内，
  // 沿线离他最近、按 stepM 取整的那一点就是区域目标；领了集束弹、人在 watch.rangeM 以内（取弹沟回程）先盯沟口。
  lanes: Object.freeze([
    Object.freeze({ id: "attackLane", stage: "Tank", requireFact: "bundleTaken", radiusM: 3.5, stepM: 3, weight: 2.5,
      scatterM: Object.freeze([1.2, 2.6]), watch: Object.freeze({ rangeM: 30, weight: 1.6 }),
      points: Object.freeze(FRONT_SORTIE.attackRoute.map((p) => Object.freeze({ x: p.x, z: p.z }))) }),
  ]),
  stageOrder: Object.freeze(["Support", "MachineGun", "Tank", "Orders"]),
});
