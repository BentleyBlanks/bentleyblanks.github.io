// Data_Tuning_Ai.mjs — 士兵 AI 的发现距离、班组队形、交火距离与人物 LOD 预算。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。规则在 `Script_Ai.mjs`，
// 它 import 这张表读并按原名 re-export（`SIGHT_BY_STANCE` / `SIGHT_SCALE_RANGE` /
// `CAPSULE` 是跨系统契约名，改名会同时打断照明弹、人物动作编辑器与三个测试）。
//
// **不在这张表里的**：
//   · 命中率、压制、部位倍率、AI 枪伤 → `Data_Battle.COMBAT`（docs/Data_PlayerDamage.md，
//     `aiAccuracyBase` 那一组数尤其不许在这里再存一份）；
//   · 难度档（aiAccuracy / suppressionScale / …）→ `Data_Battle.DIFFICULTY`；
//   · 通行阶梯（翻越 / 攀爬 / 自动抬腿）→ `Data_Traversal.TRAVERSAL`；
//   · 三种姿态的胶囊 `CAPSULE`：那是**移动碰撞体**，与 `Data_Tuning_Player.STANCE`
//     的 eye/radius 是同一套「人有多高多粗」的几何契约，留在 Script_Ai 与人物动作
//     编辑器手边（子弹判定另有一个球 `COMBAT.hitbox`，两者互不相干）。

/**
 * 被发现的距离，按**目标自己的姿态**缩放：站 120 / 蹲 80 / 卧 45 m。
 *
 * 这是 ER2 的 Covert Movements 那条机制里最便宜也最值钱的一半：姿态第一次真的
 * 影响「会不会被打」。原来两边一律 120 m 一刀切，趴下除了走得慢没有任何收益，
 * 于是玩家（和 AI）永远没有理由卧倒。
 *
 * 下标 0 站 / 1 蹲 / 2 卧，与 CAPSULE、Script_Identify 同一套。
 */
// 表在本地可编辑（docs/Data_EnemyAi.md §14.4）：index.html 在本机预览或 ?aiedit=1 时置起
// TAIERZHUANG_TUNING_EDITABLE，敌军 AI 编辑器才能就地改数；线上与纯 Node 测试里照旧冻结。
const Freeze = (typeof globalThis === "object" && globalThis.TAIERZHUANG_TUNING_EDITABLE) ? (value) => value : Object.freeze;

export const SIGHT_BY_STANCE = [120, 80, 45];

/**
 * 发现距离的**全局倍率**上下限（`AiDirector.SetSightScale`）。
 *
 * 谁在写它：第四关的照明弹（Script_Flare）—— 燃烧期把三档一起抬上去（敌我同时
 * 暴露），熄灭之后压到 1 以下几秒（暗适应），过完再还原成 1。
 *
 * 为什么是**乘一个数**而不是改上面那张表：三档的比例就是「姿态决定被发现的距离」
 * 那条机制本身。整表乘同一个数，站/蹲/卧的次序与比例一个都不变 ——
 * 照明弹底下趴着仍然比站着难被看见。谁要是改成「照明弹期间一律 200 m」，
 * 这条机制当场作废。
 */
export const SIGHT_SCALE_RANGE = Freeze({ min: 0.25, max: 4 });

/**
 * 六人战斗组。不是给 HUD 看的职业系统，而是让一群人不再对着同一个点做同一个动作：
 * 组长定方向，突击手靠前，机枪/掩护手压后，侧翼手走最外侧，步枪手填中间。
 * Spawn 顺序固定，所以这张表也固定；同一种子重跑不会换队形。
 *
 * size            一组几个人
 * enemyFocusM     组长把「敌人在哪个方向」算进推进方向的搜索半径
 * lookaheadM      推进方向往前投多远当作组目标
 * turnPerUpdate   组方向每次决策最多转多少弧度（不许一帧掉头）
 * slots           每个位置相对组方向的横向 / 纵深偏移（米）
 */
export const SQUAD = Freeze({
  size: 6,
  enemyFocusM: 92,
  lookaheadM: 22,
  turnPerUpdate: 0.72,
  slots: Freeze([
    Freeze({ role: "leader", lateral: 0, depth: 1 }),
    Freeze({ role: "assault", lateral: -2.5, depth: -4 }),
    Freeze({ role: "rifleman", lateral: 4, depth: 1 }),
    Freeze({ role: "support", lateral: -3, depth: 9 }),
    Freeze({ role: "rifleman", lateral: -6, depth: 3 }),
    Freeze({ role: "flank", lateral: 9, depth: -1 }),
  ]),
});

/**
 * 交火距离。超过它就不再把目标当「现在要打的人」，转回推进 / 找掩体。
 * 机枪 / 掷弹筒手（support）压后，射程也更远，所以单开一档。
 * hysteresisM 是已经在交火中的人多给的余量 —— 不给的话人会在边界上开一枪停一枪。
 */
export const ENGAGE = Freeze({
  defaultM: 74,
  supportM: 95,
  hysteresisM: 12,
});

/**
 * 人物 LOD 的距离预算。**这是性能账，不是玩法数** —— 改它只影响一帧多少提交，
 * 不影响谁看得见谁（那条在 SIGHT_BY_STANCE）。
 *
 * 【2026-08-20 可见性优先】不再给人物发「可见名额」。旧实现只让 13 个 Actor 走
 * 完整模型，镜头里第 14 个人若在 55 m 内就被直接设成 invisible。现在保留「视锥内
 * 每个人都必须看得见」，改为距离 LOD：近处是完整 Actor，远处是 ActorCrowd 烘焙
 * 出的同款模型实例 —— 不按人数发名额，不会隐藏第 N 个人。
 *
 * enterM / exitM 之间留迟滞，玩家在边界前后走动时不会反复切换。
 * 尸体没有步态、瞄准或足部 IK 可读，所以它的两档比活人近得多。
 */
export const ACTOR_DETAIL = Freeze({
  enterM: 46,
  exitM: 56,
  corpseEnterM: 24,
  corpseExitM: 30,
  // 【2026-09-08 验收】远景层里的尸体到这个距离就不画了。第一关走到院落回望前沿时，
  // 两百米外还躺着六七十具尸体、每具都按远景层的整模烘（一具约一万面），
  // 光尸体就吃掉一百多万面，整帧越过 SCENE_RENDER_LIMITS（master 自身在那一帧就已经贴线 8.16 M）。
  // 160 m 上一具卧倒的尸体在 900 px 高的画面里只剩三个像素高，看不见；
  // **活人不受这条限制**（视锥内每个活人都必须看得见，那是内容硬规则）。
  corpseCrowdMaxM: 160,
  animation60HzM: 20,
  animation30HzM: 32,
  footIkM: 18,
  shadowM: 24,
  // 视锥判定用的包围球：半径给到 1.6 m（人高 1.7 上下）再加一点余量，
  // 免得屏幕边缘上的人在转身时一格一格地闪出来。
  boundRadiusM: 1.6,

  // --- 远景层的姿势档（ActorCrowd，见 docs/Data_ActorCrowdLod.md）----------
  //
  // 【2026-09-09 实拍取证】前沿开战 20 s 按距离分档数人：46—74 m 那一档 31 个日军里
  // **20 个其实在跪射**，画面上却全是站着的 —— 远景层当时只烘了一个「端着枪站着」
  // 的姿势，卧倒是把那尊雕像绕 X 倒 80°，跑动的人是雕像在滑行。玩家说的
  // 「远处的敌人不会动、干站着」有一半是这一层的表现力，不是 AI。
  //
  // 现在每个 kind 烘一组：站 / 跪 / 卧 / 跑步翻页 N 帧 / 倒地。

  /**
   * 跑步翻页的帧数：一个步态周期（两步）等分成几档定格。
   * 0 = 整个关掉跑步桶（远景跑动的人退回站姿滑行，也就是 2026-09-09 之前的样子）。
   * 4 是取舍点：再多一帧要多付「材质桶数」个 draw call / kind，而 60 m 上一个人
   * 只有 26 px 高，四档已经能读出「腿在翻」；再细也只是让 26 px 里的腿多两个中间位。
   */
  crowdRunFrames: 4,
  /**
   * 翻页帧率（Hz）的**退路值**，**不是**动画帧率。
   *
   * 正常情况下 `ActorCrowd` 烘焙时会从资产量出跑步循环有多长
   * （`RunCycleSeconds`：蒙皮军人取当前 clip 的时长，2026-09-09 实测 `RifleRun`
   * = 1.467 s；程序化分件取 2 步 ÷ 4.5 步每秒 = 0.44 s），翻页速度照那个走，
   * 远景与近景同速。这个数只在「一个 kind 都还没烘」时顶一下，
   * 所以按当前资产给 4 ÷ 1.467 ≈ 2.7。
   *
   * 【别把它当"调快点更带感"的旋钮】翻快了远景的人就是在原地抽搐 ——
   * 46 m 外读得出「在跑」，读不出「跑多快」，翻页速度唯一该对齐的是近景那条 clip。
   */
  crowdRunFps: 2.7,
  /** 速度信号超过它才算「在跑」，进翻页桶。0.25 ≈ 1 m/s，刚好把走位与冲锋分开。 */
  crowdRunSignal: 0.25,
});

/**
 * 戒备与换位（docs/Data_EnemyAi.md §15）。**这一组管的是「不在交战中的那几十秒」** ——
 * 交火本身的数在 COVER / SHOOTING / TACTICS 四张表里，这里一个都不重复。
 *
 * 病根（2026-09-09 实拍，`_shots/EnemyAi/Script_FarEnemyProbe.mjs`）：
 *   · `Think` 的兜底分支一律 `state = ADVANCE; SetStance(0)` —— 有目标但超出交战距离
 *     （74 m）、或者只听见枪声没看见人的人**站得笔直**，一动不动；
 *   · 守点单位没有目标时是 `IDLE`，姿态根本没人管；
 *   · 前沿跪射的人打完一梭子还钉在同一块地上（实测 46–74 m 档 23/31 人四秒没挪窝）。
 * 三条的共同点是「不交战 ≠ 不做事」：真人这时候会蹲下、会面向枪声、会换个位置。
 *
 * minAlertIndex     进戒备的最低警戒级别下标（`Script_AiPerception.ALERT_ORDER`：
 *                   0 unaware / 1 suspicious / 2 alert / 3 engaged）。取 1 —— 听见几十米外
 *                   一声枪响就够蹲下了；听觉本身封顶在 0.72（进不了 engaged），那条红线不动。
 * stanceHoldS 2.6   戒备姿态的承诺期。比 `AiBehaviorTest` 的「12 秒最多 6 次切换」宽得多，
 *                   免得警戒在阈值两侧慢波时人跟着蹲起。
 * proneSuppressionAt 0.55  戒备中压制过它就卧倒（`SUPPRESSED` 的 0.50 是**交战**里的线，
 *                   两条问的不是同一件事：这条问「没在打的人要不要趴」）。
 * faceHoldS 1.5     `Act` 认这个朝向多久。Think 是 1/6 分帧（0.1 s 一次），1.5 s 的闩
 *                   足够跨过几拍掉帧，又不会让人对着早就没了的动静发呆。
 * scanIntervalS 3.2 / scanYawRad 0.5（≈29°）
 *                   每隔这么久换一次面向：**正对 → 偏一侧 → 正对 → 偏另一侧**
 *                   （起手正对着动静，不然刚听见枪声的人第一眼是斜着看的）。
 *                   「他在观察那个方向」要看得出来，但转速仍由 `Act` 的 turnRate 限着，不会瞬转。
 *
 * ── 换位（DISPLACE）：跪射之后别再钉在原地 ────────────────────────────────
 * displaceAfterS 4.5      站定这么久就该挪窝（用 `s.stationaryS`，一动就清零）。
 * displaceAfterShots 4    或者连续打了这么多发。两条谁先到算谁 —— 步枪按时间走，
 *                         机枪按发数走，但都还要过 `displaceMinDwellS`。
 * displaceMinDwellS 3.0   两次换位之间的最小间隔。没有它，机枪四发 0.5 秒就想挪一次。
 * displaceMinM 2 / displaceMaxM 4   侧向挪多远。少于 2 m 换不出新的射界，多于 4 m
 *                         就不是「换个射击位」而是「换阵地」了（守点纪律另有半径管着）。
 * displaceSpeedMps 1.9    猫腰挪过去，不是冲刺（冲向掩体是 2.4）。
 * displaceArriveM 0.6     到位半径。比掩体微走位（0.12 m）宽：这是换位不是探头。
 * displaceTimeoutS 5      走不到就放弃（被人堵住 / 被地形卡住），下一拍重新算。
 * displaceProneAt 0.35    压制过它就不站着横挪了：**匍匐**后退 `displaceBackM`。
 * displaceBackM 2         匍匐后退多远（背着威胁方向）。
 * displaceMinReachM 2.2   守区余量小于它的人一步都不挪 —— 机枪位（0.4 + 0.9 = 1.3 m）
 *                         是战位，挪了就不是那挺机枪了。
 * displaceTries 4         每次最多试几个落点（左右各两档），一条射线都不打：
 *                         只查导航可走 + 胶囊不撞（`Blocked` 走 AABB 空间散列）。
 */
export const WATCH = Freeze({
  minAlertIndex: 1,
  stanceHoldS: 2.6,
  proneSuppressionAt: 0.55,
  faceHoldS: 1.5,
  scanIntervalS: 3.2,
  scanYawRad: 0.5,
  displaceAfterS: 4.5,
  displaceAfterShots: 4,
  displaceMinDwellS: 3.0,
  displaceMinM: 2,
  displaceMaxM: 4,
  displaceSpeedMps: 1.9,
  displaceArriveM: 0.6,
  displaceTimeoutS: 5,
  displaceProneAt: 0.35,
  displaceBackM: 2,
  displaceMinReachM: 2.2,
  displaceTries: 4,
});

/**
 * 中弹踉跄（Actor 的 `hurt` 覆盖姿势）。
 *
 * 姿势代码与编辑器预览一直都在（Script_Actor 的「上身被顶得后仰、头往后甩、脚下错半步」），
 * 但 Script_Ai 的七处 actor.Update 从没传过 `hurt` —— 打中活着的人身上没有任何动作反馈，
 * 只有一团血。现在 Soldier.TakeHit 抬一下、Act 每帧按 decayS 衰减、Update 带过去。
 *
 * base        挨一下最少抬到多少（擦一下腿也得晃一下）
 * damageDiv   伤害 / 这个数 再叠上去（三八式 72 → +0.8，基本满幅）
 * decayS      从 1 衰减到 0 用几秒
 */
export const HURT_FLINCH = Freeze({ base: 0.45, damageDiv: 90, decayS: 0.45 });

/**
 * 大脑接线（docs/Data_EnemyAi.md §5）。
 *
 * 这一组不属于四个新模块中的任何一个 —— 它们是**适配层自己**要的阈值：
 * 「什么算在动」「什么算刚开过枪」「掩体微走位算到位没有」。
 * 放在这里而不是塞进 `Data_Tuning_Ai*.mjs`，是因为那四张表要跟着模块走，
 * 而模块在纯 Node 里不知道 Script_Ai 用什么信号喂它们。
 *
 * movingSignal    AI 的 `moveSpeed` 是 0..1 的**动作信号**（速度 / 3.6），
 *                 0.08 与 Act 里判「移动中转向」用的是同一条线。
 * movingMps       玩家侧只有 `velocity`（米/秒）：0.4 m/s 大约是「挪了半步」，
 *                 站着微调枪口不算动。
 * firingRecentS   枪口焰的有效窗口。0.35 s 略长于最快机枪的射击间隔（0.12 s），
 *                 短于步枪的一个循环（2.2 s）—— 「他刚才那一下开枪了」而不是
 *                 「他这一分钟里开过枪」。
 * coverArriveM    掩体隐蔽位 ↔ 射击位的侧步只有 sideStepM（0.55 m），
 *                 而 Act 的默认到位半径是 1.2 m：拿默认值判，人永远「已经到了」，
 *                 **探头一次都不会发生**。这条是这一轮最容易漏的一个坑。
 * coverMoveMps    在掩体边上挪半步的速度。比冲向掩体（2.4）慢得多：
 *                 探头是探出去，不是冲出去。
 * allyCorridorM   射击走廊要查多远之内的友军（超过它的人挡不住这一枪）。
 * grenadeDodgeM   敌方手榴弹落在隐蔽位这个半径内就换掩体 / 后撤。
 */
export const BRAIN = Freeze({
  movingSignal: 0.08,
  movingMps: 0.4,
  // 【2026-09-09 验收】投弹判据的「玩家钉在一处」改按**位移窗口**判，不按速度：
  // 站在空地挨打的玩家每两秒被击退一下，速度永远不归零，按速度算他永远不算钉住 ——
  // 一枚手榴弹都派不出去。锚点漂出这个半径才算挪窝（击退只挪 0.1–0.3 m）。
  stationaryDriftM: 0.75,
  firingRecentS: 0.35,
  coverArriveM: 0.12,
  coverMoveMps: 1.5,
  allyCorridorM: 26,
  /** 跑向掩体的速度（与旧 FIRE 分支冲掩体的 2.4 一致，别顺手改成散步）。 */
  coverApproachMps: 2.4,
  /** 侧翼 / 查看 / 后撤这三类走位的速度（跑，不是冲）。 */
  taskMoveMps: 2.8,
  /** 躯干中心在眼位下方多少米。射击走廊拿它摆友军的躯干点。 */
  torsoBelowEyeM: 0.25,
  grenadeDodgeM: 7,
  /**
   * 「枪口 / 手已经转到目标身上了」的角度闸。与 `TryFire` 里那道 0.34 同一条口径：
   * 转身—瞄准—开火要看得懂，不能身体原地转圈、东西照样四面飞。
   */
  faceTargetRad: 0.34,
  /**
   * 投弹三个数（走的是玩家那条 `Combat.Throw`）。
   * releaseY   动画没接上时的兜底脱手高度（与 VolleyThrow 的 1.2 同源）。
   * powerMin/Max  蓄力 0..1。别给满力：满力是「拼命扔出去」，
   *              日军步兵扔的是二十来米的战术投掷，不是掷远比赛。
   */
  grenadeReleaseY: 1.2,
  grenadePowerMin: 0.5,
  grenadePowerMax: 0.8,
  /** 掩体查询的重选闸之外，还要求跟上一次的威胁点差出这么远才值得重算。 */
  threatMoveM: 4,
  /**
   * actor.root 与 s.position 差出这么远就不信 Actor 的枪口。
   * 0.35 m 比一帧的位移大得多，比「人被瞬移到靶场」小得多。
   */
  muzzleSyncM: 0.35,
  // Visible soldiers must finish raising and pointing their actual barrel before firing.
  fireAimBlendMin: 0.95,
  fireBarrelAngleRad: 0.12,
});
