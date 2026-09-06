// Data_Tuning_Player.mjs — 玩家控制器的手感 / 平衡 / 节奏数。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。规则在 `Script_Player.mjs`，
// 它 import 这张表读，不复制成本地常量（口径见 docs/Data_TextAndTuning.md §4）。
// 派生量（跃起高度、滞空时间）由代码算，测试断言也从这里取，不抄数。
//
// **不在这张表里的**：
//   · 翻越 / 攀爬的通行阶梯 → `Data_Traversal.TRAVERSAL`（玩家、AI、物理层三边共用）；
//   · 难度档（自由瞄准角、体力秒数、受伤倍率、压制倍率）→ `Data_Battle.DIFFICULTY`；
//   · 部位倍率、单发上限、失血上限、爆炸倍率 → `Data_Battle.COMBAT.player`（口径见
//     docs/Data_PlayerDamage.md，那几个数不许在这里再存一份）；
//   · 阵亡镜头与白刃相机的演出曲线 → 留在 Script_Player.SyncDeathCamera / SyncCamera：
//     那是一段一次性的镜头表演，不是玩家每帧都在感觉的旋钮。

/**
 * 姿态参数。眼高按真人来：站 1.62，蹲 1.05，卧 0.42（趴下之后视线只比枪高一点）。
 *
 * eye/radius 与 `Script_Ai.CAPSULE` 是同一套「人有多高多粗」，改一边要对另一边；
 * sway/spread 是手感倍率（架枪多稳、散布多大），乘在武器自己的基数上。
 * labelKey 是姿态名的文本键，句子在 Data_Text_Gameplay 的 `gameplay.stance.*`。
 */
export const STANCE = Object.freeze({
  stand: Object.freeze({ eye: 1.62, speed: 3.05, radius: 0.34, sway: 1.0, spread: 1.0, labelKey: "gameplay.stance.stand" }),
  crouch: Object.freeze({ eye: 1.05, speed: 1.62, radius: 0.34, sway: 0.62, spread: 0.66, labelKey: "gameplay.stance.crouch" }),
  prone: Object.freeze({ eye: 0.42, speed: 0.72, radius: 0.42, sway: 0.30, spread: 0.34, labelKey: "gameplay.stance.prone" }),
});

/**
 * 跳跃不是跑酷动词，是越沟、上瓦砾、脱离低矮卡点的最后半步。
 * 4.65 m/s 配 19.6 m/s² 重力：净抬高约 0.55 m、完整滞空约 0.47 s。
 * 这个量级与 Easy Red 2 那种背着装备的步兵感一致，也低于 `TRAVERSAL.vaultMin`，
 * 所以按 Space 时仍然是「能翻就翻、能爬就爬，都不行才跳」——
 * 跳跃跳不上任何一件该走翻越/攀爬的东西，这是通行阶梯的地基。
 *
 * **助跑加成**：上面那组数是**站着起跳**的数。原先起跳只写死竖直速度，水平速度原样
 * 带走 —— 意味着跳跃对位移的净贡献是 0（跳 0.47 s 走过的距离，和不跳继续跑一模一样），
 * 而且弧线跟速度完全无关，跑得越快这个小驼峰在画面上越不起眼，实测「跑起来跳和站着跳
 * 看不出区别」就是这么来的。现在按助跑速度给一点竖直与水平加成：站着跳分毫不变，
 * 冲刺跳抬高约 0.68 m、滞空约 0.53 s、空中位移从 2.45 m 到约 3.1 m。
 * 加成的天花板是 `TRAVERSAL.jumpRiseMax`（0.72 m），仍压在 vaultMin 之下；
 * 兔子跳照旧由冷却、落地硬直与随助跑变贵的体力挡住。
 *
 * gravityMps2 是**世界重力**。Script_Combat 的弹道积分与 Script_ShellVisual 的
 * 弹道曲线各自还存着同一个 19.6 —— 三处合成一张世界表是待办（见集成请求）。
 */
export const JUMP = Object.freeze({
  gravityMps2: 19.6,
  speedMps: 4.65,
  runMinMps: 1.80,      // 助跑加成的起算速度：慢步以下当站着跳
  runFullMps: 5.25,     // 满加成速度：站姿冲刺（3.05 × 1.72）
  runRise: 0.11,        // 满助跑的竖直加成 → 抬高 0.55 → 0.68 m
  runPush: 0.16,        // 满助跑的蹬地水平加成
  stamina: 0.08,
  runStamina: 0.5,      // 满助跑再贵一半：0.08 → 0.12
  coyoteS: 0.10,
  bufferS: 0.12,
  cooldownS: 0.24,
  // 落地以后要把重心重新接住，不能在同一帧把缓冲输入变成下一跳。
  landCooldownS: 0.16,
  // 落地冲击强度 = (落速 − landImpactBaseMps) / landImpactSpanMps，夹在 0..1。
  landImpactBaseMps: 2.2,
  landImpactSpanMps: 6.8,
  // 起跳先把枪从照门上摘下来：开镜量压到这个上限。
  adsOnJump: 0.2,
});

/**
 * 移动的账**只有这一本**。速度是一条乘法链：姿态基速 × 冲刺 × 开镜 × 压制 ×
 * 下水 × 腿伤 × 失血 × 负重，任何系统要让人走慢都往这条链上加一个乘数，
 * 不许自己另算一套速度。
 */
export const MOVE = Object.freeze({
  // 卧姿按住 Shift = 快速匍匐（ER2 有匍匐速度档）。它不是冲刺：不进 sprint 弹簧，
  // 只把速度从 STANCE.prone.speed 提到这个数，并把脚步声放大 —— 快就得响。
  fastCrawlMps: 1.25,
  sprintBoost: 0.72,          // 冲刺满档时 ×(1 + 这个数)
  sprintRate: 6,              // 冲刺弹簧的收敛率
  adsSlow: 0.42,              // 开镜满档时 ×(1 − 这个数)
  // 被压制时腿会软，但这是个温和的惩罚（最多 −25%），不是把人按到蹲姿的 −47%。
  suppressionSlow: 0.25,
  waterSlow: 0.25,            // 齐腰的水里迈不开腿：整体乘这个数
  backwardScale: 0.72,        // 后退与横移比前进慢
  healthSlowDiv: 60,          // 速度 ×clamp(health/这个数, healthSlowMin, 1)
  healthSlowMin: 0.45,
  carryScaleMin: 0.05,        // 负重乘数的下夹（防止摆点写出 0 让人钉死）
  debugFastMoveScale: 3,      // Script_DebugOptions 的加速档
  accelGround: 14,            // 地面收敛率
  accelAir: 3,                // 空中只够小幅修正方向
  // 半空里比目标速度快的时候收敛慢一档，否则 0.5 s 的滞空会把 16% 的助跑加成
  // 磨掉近八成，加了等于没加。
  accelAirOverrun: 1,
  overrunMarginMps: 0.05,
  stanceLerpRate: 8.5,        // 眼高 / 胶囊半径 / 姿态混合的收敛率
  leanRate: 9,                // 侧身的收敛率
  diveSpeedCapMps: 1.2,       // 剧本「扑入路沟」那一下的位移上限
  // 撞上东西就把那一轴的速度吃掉，不然贴着墙走会一直攒速度。
  blockedVelocityKeep: 0.2,
});

/** 体力：只有冲刺、快速匍匐、屏息、下水与起跳会花它。 */
export const STAMINA = Object.freeze({
  regenPerS: 0.13,
  sprintMin: 0.05,            // 低于这个值冲刺 / 快速匍匐不成立
  breathHoldMin: 0.1,
  breathHoldAds: 0.6,         // 开镜到这个程度以上屏息才有意义
  breathHoldDrainPerS: 0.28,
  waterDrainPerS: 0.5,
});

/**
 * 自由瞄准：枪口方向可以偏离视线中心一小段，鼠标先推动枪、枪撞到边界才带动视线。
 * 这是 ER2「没有准星也打得准」的物理基础 —— 玩家看的是枪，不是屏幕中心。
 * 角度上限本身在 `DIFFICULTY.freeAimDeg`（滑条一拨就生效），这里只放它的形状。
 *
 * settleDelayS / settleSpanS：归位**只在手停下来之后**发生。每帧无条件归位等于
 * 给自由瞄准装了一个漏斗，慢推鼠标时枪口永远顶不到边界，屏幕上就是「鼠标动了，
 * 什么都没动」。手在动的时候不归位，于是总瞄准角与鼠标永远是 1:1。
 */
export const FREE_AIM = Object.freeze({
  sensitivityScale: 0.0022,   // input.sensitivity 到弧度的换算
  adsLookScale: 0.55,         // 开镜满档时转向 ×(1 − 这个数)
  // 架起两脚架之后转向只剩三成：机枪压在垛口上，横过来要连人带枪挪。
  bipodLookScale: 0.30,
  adsNarrow: 0.72,            // 开镜满档时自由瞄准锥收到 ×(1 − 这个数)
  pitchLimitRad: 1.35,
  walkThreshold: 0.05,        // 移动输入超过它就改「相机直跟鼠标」
  directRecentreRate: 18,     // 直跟态下枪口偏移的回收率（等量补给相机）
  settleDelayS: 0.10,
  settleSpanS: 0.12,
  recentreRate: 2.2,
  adsRecentreBoost: 5,        // 归位率 = recentreRate + ads × 这个数
});

/**
 * 后坐回落 —— 照战地的曲线，不是指数衰减。出处见 docs/Data_BattlefieldNumbers.md。
 *
 *   Decrease ∝ (|R| / R0)^exponent · (R0 / T) · K · **TimeSinceLastShot^0.5** · dt
 *
 * 两个要点，缺一个手感就不对：
 *   · **回到零，不留残留。** 战地的栓动步枪 0.25—0.5 s 收干净，而两发间隔
 *     1.0—2.4 s，**每一发都从同一个瞄准点开始**（所以 `keepFrac` 是 1.0）。
 *   · **重量感在 TimeSinceLastShot^0.5 上。** t=0 时该因子为 0，回落**从零速率
 *     起步再加速** —— 踢上去、悬住、加速归位。那一「悬」就是枪的重量。
 *
 * exponent 0.6 < 1 还有一个好处：dR/dt ∝ R^0.6 是**有限时间收敛到精确的零**的。
 * gain = 1.432 是解出来的：让回稳时间恒等于 1.9×T，与后坐大小无关。
 */
export const RECOIL = Object.freeze({
  exponent: 0.6,
  gain: 1.432,
  minRecoverS: 0.05,
  defaultRecoverS: 0.4,
  keepFrac: 1.0,
  epsilon: 1e-7,
});

/**
 * 压制。**压制不改玩家的姿态** —— 原来 suppression > 0.85 就把 stance 直接改成
 * crouch，玩家没按任何键、移速从 3.05 掉到 1.62，体感就是「WASD 时灵时不灵」。
 * 现在只做提示（suppressedUpright），是不是趴下由玩家自己决定。
 */
export const SUPPRESSION = Object.freeze({
  decayPerS: 0.55,
  uprightEnter: 0.85,
  uprightExit: 0.5,
  onHit: 0.5,                 // 中弹时叠多少
  onGraceHit: 0.35,           // 出生保护期内只吃压制不吃伤，叠这么多
  onBlast: 0.9,               // 爆炸按衰减比例叠这么多（Script_Combat 调 Suppress）
  shakeScale: 0.012,          // 受压制时画面抖动的幅度
});

/** 伤口与包扎。部位倍率与单发上限在 COMBAT.player，这里只放本层自己的数。 */
export const WOUNDS = Object.freeze({
  legPenalty: 0.72,           // 每处腿伤把移速乘这个数
  legFloor: 0.42,             // 腿伤惩罚的下夹
  armPenalty: 1.7,            // 每处臂伤把摇摆乘这个数
  armCap: 3.2,
  bleedHead: 6,               // 各部位的失血基数，再乘 COMBAT.player.bleedScale
  bleedTorso: 2.6,
  bleedLimb: 1.4,
  // 伤口自己会慢慢收一点，但收不干净 —— 不包扎就是慢性死亡。
  bleedDecayPerS: 0.05,
  bleedDecayFlatPerS: 0.02,
  maxBleedPerSFallback: 5.5,  // COMBAT.player.maxBleedPerS 缺位时的兜底
  bandages: 2,
  bandageHeal: 14,            // 包扎止血，不回满血
});

/**
 * 出生保护（秒）。ER2 的做法：重生后几秒无敌，防出生点秒杀。
 * 这不是「照顾玩家」，是修一个结构性问题：接替者必然出生在还在打的地方，
 * 没有这几秒，他睁眼那一刻就已经在九支枪的射界里了。
 */
export const SPAWN = Object.freeze({ graceS: 3.2 });

/**
 * 受击反馈。这三个量是给 HUD / 音频读的一次性事件：红闪按**这一发的伤害**定强度
 *（与剩余血量无关），来弹方位存世界方向，濒死心跳只在血很低时才开始 ——
 * 再高就成了背景噪音，那条线也就不再是信号了。
 */
export const HIT_FEEDBACK = Object.freeze({
  flashBase: 0.30,
  flashDamageDiv: 68,
  flashDecayPerS: 1.7,        // 红闪衰减比暗角快：它要读起来像「挨了一下」
  severityDiv: 55,
  markLifeS: 2.2,
  markMax: 5,
  eventQueueMax: 8,           // 过场/编辑器不取事件时队列的封顶
  heartbeatBelowHp: 45,
  heartbeatMinS: 0.42,
  heartbeatPerHp: 0.012,
  heartbeatMaxS: 1.0,
  knockbackMps: 1.2,
  // 中弹把视线打偏 —— 被打中还能稳稳瞄准是最假的一件事。
  aimKickYaw: 0.09,
  aimKickPitch: 0.07,
  aimKickPitchBias: 0.03,
});

/** 瞄准摇摆。视图模型与散布计算共用（Script_Player.SwayAmount）。 */
export const SWAY = Object.freeze({
  base: 1.0,
  adsDamp: 0.55,
  suppressionGain: 0.9,
  staminaGain: 0.6,
  breathHold: 0.28,
  bipod: 0.25,                // 架上去之后枪自己稳住了
});

/**
 * 散布（度）。**准心画的就是它**（Script_Hud.CrosshairGeometry），
 * 所以这里每改一个系数，屏幕上那个圈就跟着变 —— 两者不许再分家。
 *
 * 【2026-08-25 调走动那一项】原来是 ×2.8（`1 + min(1,v/3)×1.8`），而站姿速度
 * 就是 3.05 m/s，等于**一迈步就直接吃满**：汉阳造 3.0° → 8.4°，25 m 上落点散在
 * ±1.8 m。战地/COD 的腰射跑动惩罚大约是 +50%~90%，不是 +180%。现在收到 ×1.85。
 */
export const SPREAD = Object.freeze({
  noWeaponDeg: 4,
  adsThreshold: 0.5,
  adsFallbackDeg: 0.2,
  hipFallbackDeg: 3,
  suppressionGain: 1.3,
  armMix: 0.6,                // 臂伤按 ×(armPenalty × armMix + armBias) 折算
  armBias: 0.4,
  moveGain: 0.85,
  moveRefMps: 3,
  airborne: 2.4,              // 半空开火可以，但绝不是稳定射击姿态
  breathHold: 0.55,
  bipod: 0.35,
});

/** 步伐晃动与侧身。开镜压到 20%，卧倒几乎没有。 */
export const CAMERA = Object.freeze({
  bobAmp: 0.028,
  bobAdsDamp: 0.8,
  bobProneDamp: 0.7,
  bobRefMps: 3,
  bobYFreq: 6.8,
  bobXFreq: 3.4,
  bobXScale: 1.3,
  strideStand: 3.4,           // headBob 的步频（供脚步与视图模型读）
  strideProne: 5.5,
  // 侧身：身体横移 + 相机滚转，探头出去看的那一下必须有位移，
  // 不然只是画面歪了。
  leanOffsetM: 0.42,
  leanRollRad: 0.16,
});
