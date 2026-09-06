// Data_Tuning_Interact.mjs — 交互 / 负重 / 架设武器三台状态机的判据与节奏数。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。
// 规则分别在 Script_Interact / Script_Carry / Script_Emplacement，它们 import 这张表读。
// 「有哪些种类」是**档案表**不是调参：负重种类在 Data_Carry，架设武器在 Data_Emplacements。

/**
 * 交互判据。
 *
 * corpseReachM / mateReachM 比 ER2 短一点 —— 巷战里两米开外的东西本来就不该「顺手」拿到。
 * facingDot 是「大致朝着它」：0.20 约等于 ±78°，比准心宽得多；
 * 交互不是射击，不该要求玩家对准。
 */
export const INTERACT = Object.freeze({
  corpseReachM: 2.0,
  mateReachM: 2.5,
  pointReachM: 2.2,
  pointHeightM: 3.0,
  facingDot: 0.20,
  /** hold 型松手之后进度每秒退多少（按占总时长的比例算）。 */
  holdDecayPerS: 1.4,
  /** 注册点默认优先级：比内建的拾枪（0）高，同样距离下先提示「止血」而不是「捡枪」。 */
  pointPriority: 10,
  /** 内建分支（拾枪 / 分弹）的优先级，与注册点排在同一张榜上。 */
  builtinPriority: 0,
  /** 不给 seconds 时按住型手势要按多久，以及它的下夹。 */
  defaultSeconds: 1.2,
  minSeconds: 0.05,
  /** 单帧步长的封顶：卡一下不该让进度环一口气走完。 */
  maxStepS: 0.1,
  /** 完成提示与「F — …」提示条各显示多久。 */
  hintSeconds: 2.6,
  promptSeconds: 1.6,
  /** 自己只剩这么多桥夹就不再分给弟兄。 */
  spareClipsMin: 2,
  /** 拾枪成功后那两条缴获提示的时长。 */
  pickupMeleeHintS: 2.8,
  pickupClipsHintS: 3.2,
  ammoSayS: 2.0,
});

/** 负重状态机的节奏数（档案表在 Data_Carry.mjs）。 */
export const CARRY = Object.freeze({
  /** 摔下去之后再拿起来之前的空窗；没有它，一次左键会在同一帧摔完又捡起来。 */
  repickLockS: 0.45,
  /** `canDrop:false` 时那句吼的字幕时长。 */
  refuseSayS: 1.8,
});

/**
 * 架设武器状态机的节奏数（档案表在 Data_Emplacements.mjs）。
 *
 * 射速 / 伤害 / 有效射程 / 换弹时长来自 `Data_Weapons`，这里只放缺位时的兜底
 * 与「引擎自己的节奏」：干咔去重窗口、每帧最多打几发、每条提示显示多久。
 */
export const EMPLACEMENT = Object.freeze({
  /** 卸下之后再上枪位之前的空窗。没有它，一次 F 会在同一帧下枪又上枪。 */
  remountLockS: 0.40,
  /**
   * 空膛的「咔」只在**刚扣下**那一下响（借 fireCooldown 当去重窗口），
   * 不然按住左键会得到一串每 0.3 秒一次的干咔。
   */
  dryFireWindowS: 0.55,
  /**
   * 一帧可能跨过不止一个射击间隔（低帧率），但**每帧最多这么多发**：
   * 不封顶的话卡一下就会在同一帧喷十几发，热量与弹药一起瞬间见底。
   */
  maxShotsPerFrame: 2,
  maxStepS: 0.1,
  minFireIntervalS: 0.02,
  reloadFallbackS: 4.0,
  minReloadS: 0.2,
  damageFallback: 80,
  rangeFallbackM: 800,
  /** 各条提示 / 喊话的显示时长。 */
  hintRefuseS: 1.8,
  hintJamS: 2.6,
  hintDeadS: 3.4,
  hintPullAgainS: 1.4,
  hintCooledS: 2.0,
  hintClearedS: 1.6,
  hintReloadS: 2.0,
  hintOverheatS: 2.6,
  hintMinorJamS: 2.4,
  sayOverheatS: 1.8,
  /** 接管 / 补弹两个交互点的默认摆点参数。 */
  takeReachM: 1.9,
  takeFacingDot: 0.10,
  takePriority: 20,
  resupplyReachM: 2.2,
  resupplySeconds: 1.8,
  resupplyCooldownS: 1.2,
  /** 热条的「温」档门槛 = warnHeat × 这个数。 */
  warmHeatFrac: 0.5,
});
