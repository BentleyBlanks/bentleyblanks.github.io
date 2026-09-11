// Data_Tuning_Combat.mjs — 投掷物、爆炸、白刃、间接火力的手感 / 平衡 / 节奏数。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。规则在 `Script_Combat.mjs`。
//
// **不在这张表里的**：
//   · 每件武器的伤害 / 半径 / 引信 / 投掷初速 → `Data_Weapons.WEAPONS`；
//   · 支援兵器（掷弹筒 / 联队炮 / 迫击炮）的伤害、半径、间隔、冷却 → `Data_Battle.SUPPORT`；
//   · 玩家吃爆炸的倍率与上限 → `Data_Battle.COMBAT.player`（docs/Data_PlayerDamage.md）；
//   · 掷回手榴弹的够得着判据 → `Data_Explosives.GRENADE_RETURN`；
//   · 集束/普通弹的外壳几何 → 留在 Script_Combat 的池化构造里（那是模型不是手感）。

/** 投掷。手榴弹是**抛**出去的，不是打出去的 —— arcLift 就是那条抛物线的仰角来源。 */
export const THROW = Object.freeze({
  arcLift: 0.26,              // 竖直分量 = 初速 × 这个数
  muzzleAheadM: 0.4,          // 出手点比眼位往前多少
  muzzleRiseM: 0.1,
  fuseFallbackS: 4.2,         // 武器表没写 fuseS 时的引信
  // 攥着数几秒再扔（cook）：老兵的做法，落地即炸不给对面时间踢回来。
  // 但引信不许被 cook 到 0 —— 那样就成了「手里炸」而玩家没有任何提示。
  cookedFuseMinS: 0.35,
  // 掷回时那枚弹贴在手上的位置（相对眼位）。
  returnAheadM: 0.42,
  returnDropM: 0.23,
});

/**
 * 投掷物的刚体。木柄手榴弹在地上是**滚**的，而「射线撞到就按法线反射 + 落地衰减」
 * 滚不起来：弹到墙角会原地抖，落地之后水平速度每帧乘 0.62，十几帧就钉死。
 * 换成真刚体之后墙角、台阶、坡面这些地方的行为都不用再各写一条规则。
 *
 * 半径 0.055 m —— 木柄弹的弹体直径约 5 cm，滚起来的手感由它决定。
 */
export const GRENADE_BODY = Object.freeze({
  radiusM: 0.055,
  massKg: 0.6,
  bundleMassKg: 3.2,
  restitution: 0.24,
  friction: 0.68,
  // 没有物理世界时的兜底（编辑器在切片重建的空档里也会跑这条路）。
  fallbackBounce: 0.34,
  fallbackGroundBounce: 0.26,
  fallbackGroundDrag: 0.62,
  fallbackSkinM: 0.03,
  fallbackSpinRadPerS: 9,
});

/** 白刃扇形。招式表（伤害 / 距离 / 扇面）在 Data_Weapons.GUN_MELEE 与 Data_MeleeCombat。 */
export const MELEE = Object.freeze({
  bladeReachFallbackM: 2.0,
  bladeArcDot: 0.5,
  bloodStrengthHit: 0.6,
  bloodStrengthKill: 1,
  hitHeightM: 1.0,
});

/**
 * 一次爆炸的结算。
 *
 * 伤害按距离平方衰减，并且**被墙挡住就不吃伤害** —— 隔一堵墙互相扔手榴弹是
 * 台儿庄巷战的标准打法，如果墙不挡弹片，那堵墙就白存在了。
 *
 * radiusScale：真实伤害外沿 = 武器半径 × 这个数。HUD 的手榴弹威胁提示直接取
 * 同一个数，不另造一套「看着危险、其实炸不到」的显示半径。
 */
export const BLAST = Object.freeze({
  radiusScale: 1.9,
  // 2026-09-12 玩家要求近身手榴弹产生明显毁伤。约两米内的敌军承受致死级创伤；
  // 这是伤害规则，关闭断肢表现不改变战斗结果；友军和炮击仍用原衰减。
  grenadeCloseMinFalloff: 0.80, grenadeCloseDamage: 100,
  originRiseM: 0.35,          // 爆心抬高一点再射线，免得贴地那一发被地面自遮
  wallMarginM: 0.5,           // 射线打到东西且比目标近这么多以上 = 有墙挡着
  friendlyRadiusScale: 0.75,  // 自己的弹也能伤自己人，但只在很近的时候
  soldierHitRiseM: 0.9,
  playerHitRiseM: 1.0,
  soldierSuppression: 0.8,
  playerSuppression: 0.9,     // 再乘距离衰减
  playerMinDamage: 4,         // 低于这个数只吃压制不掉血
  // 近/远两条**不同的录音**（城区爆炸 vs 远处爆炸），按**听者的距离**挑，
  // 不按爆炸半径挑：两百米外的一颗手榴弹不该拿贴脸那条 2.4 秒的城区爆炸播。
  nearAudioM: 60,
  audioVolumeRadiusDiv: 8,
  audioVolumeMin: 0.5,
  audioVolumeMax: 1.2,
});

/** 可见弹道（迫击炮 / 掷弹筒 / 联队炮共用的那一发）。 */
export const SHELL = Object.freeze({
  flightFallbackS: 1.2,
  radiusFallbackM: 6,
  damageFallback: 120,
  substepsPerS: 120,          // 一秒切多少步做射线积分
  expireAfterFlightS: 3,      // 打空了就在半空过期，绝不把爆炸瞬移到地上

  /**
   * 一发炮弹该发出的两声（落地那一声是 Blast 的事，不在这儿）。
   *
   * 【2026-09-09】在此之前，`FireShell` 是**哑的**：全场只有序章那两处调用点
   * 自己补了一句 `Play("shellIncoming")`，第一关的军列炮击、前沿弹着点、
   * 战车主炮一律只有炮口火光与落地的爆炸 —— 用户报的「炮弹还是没有声音」。
   * 声音属于「打出了一发炮弹」这件事，不属于某一个调用点，所以搬进这儿。
   *
   * 炮口那一声是**逐调用点报名**（FireShell 的 report 选项），不是按距离猜：
   * 曲射的 from 多半是个假原点（脚本在头顶三四十米外造一个点让弹道好看），
   * 给它配一声真的炮口就等于告诉玩家「有门炮架在你侧面三十米」。
   * 只有看得见炮的那些（战车主炮）才报名。
   * incomingMinFlightS：平射弹道（战车 0.2 s 就到）配不上两秒的啸声。
   */
  incomingCue: "shellIncoming",
  incomingSeconds: 1.9,       // 素材长度：啸声要正好压在落地之前
  incomingMinFlightS: 1.0,
  incomingVolume: 0.85,
  reportCue: "explosionMid",
  reportVolume: 0.7,
});

/**
 * 日军间接火力与中方迫击炮的节奏。
 *
 * 日军的火力优势是史实：掷弹筒、九二式重机、联队炮与师团炮兵。中方这边只有两发
 * 迫击炮。这个不对称不是难度设计，是这场仗本来的样子。
 *
 * stillSpeedMps：只在玩家不在开阔奔跑时才打过来 —— 贴着掩体待久了才吃曲射，
 * 这样它是「逼你动起来」的压力，而不是随机惩罚。
 */
export const INDIRECT = Object.freeze({
  launcherFirstS: 8,          // 开局第一发掷弹筒的等待
  artilleryFirstS: 26,
  launcherJitterMin: 0.7,     // 下一发间隔 = 兵器表 intervalS × (min + rand × span)
  launcherJitterSpan: 0.8,
  artilleryJitterMin: 0.8,
  artilleryJitterSpan: 0.6,
  stillSpeedMps: 1.4,
  artilleryPressure: 1.5,     // 章节压力超过它，即使没点名也会来重炮
  launcherSpreadM: 3.2,       // 落点抖动（正负半宽）
  artillerySpreadM: 7,
  mortarSpreadM: 5,
  launcherFlightS: 1.6,       // 啸声与地面标记的提前量就是它
  artilleryFlightS: 2.6,
  incomingOriginM: 120,       // 来弹从这么远、这么高的地方飞过来（只为画弹道）
  incomingOriginHeightM: 24,
  mortarOrigin: Object.freeze({ x: -90, y: 10, z: 100 }),
  launcherAudioVolume: 0.7,
  artilleryAudioVolume: 1,
});

/** 手榴弹威胁提示（HUD 读 GrenadeThreats）。 */
export const THREAT = Object.freeze({
  // 刚脱手的己方弹会在镜头前掠过；给它一点离手宽限，避免每次正常投掷都闪一下警告。
  // 如果弹落回脚边，宽限结束后仍会按真实杀伤范围报警。敌方弹不吃这条宽限。
  ownGraceS: 0.35,
});
