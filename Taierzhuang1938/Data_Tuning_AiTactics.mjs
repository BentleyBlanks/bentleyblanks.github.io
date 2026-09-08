// Data_Tuning_AiTactics.mjs —— 班组战术层的调参表：黑板 / 攻击令牌 / 任务分配 /
// 侧翼 / 跃进 / 投弹 / 撤退 / 查看。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数（docs/Data_TextAndTuning.md §4）。
// 规则在 `Script_AiTactics.mjs`，它 import 这张表读值，**不复制成本地常量**
// （复制的后果是热改表不生效、测试与运行时读到两个真相）。
//
// 名字沿用 docs/Data_EnemyAi.md §4.4 的写法（`flankMinAngleRad` / `retreatCohesion` /
// `investigateMaxM` …）。分了组之后有几个名字看着冗余（`FLANK.flankRadiusM`），
// 但方案、代码、测试三处指的是同一个词比省几个字符重要得多。
//
// **不在这张表里的**：
//   · 同时打玩家的人数上限 → `Data_Battle.COMBAT.maxShootersOnPlayer`（TTK 账的一部分，
//     DamageTest 盯着它，这里只读不存第二份）；
//   · 手榴弹初速 / 引信 / 杀伤半径 → `Data_Weapons.WEAPONS.Grenade`（投掷距离上限由它算出来）；
//   · 掩体查询的打分与验证 → `Data_Tuning_AiCover`；感知与遗忘 → `Data_Tuning_AiPerception`；
//   · 队形、发现距离、交火距离 → `Data_Tuning_Ai`（`SQUAD` / `SIGHT_BY_STANCE` / `ENGAGE`）。

/**
 * 班组层的总闸与共用数。
 *
 * maxShootersPerTarget  同时以**同一个 AI 目标**为 ENGAGE 对象的人数上限。
 *                       玩家那一侧的上限走 `COMBAT.maxShootersOnPlayer`（3），不在这儿存第二份。
 *                       给 2：一个班六把枪全焊在同一个人身上，看起来既蠢又打不动别处；
 *                       两个人打一个、其余的压制或机动，才是「班在配合」。
 * tokenLeaseS           令牌租期。Think 是 1/6 分帧（60 fps 下每人约 0.1 s 一次）、
 *                       UpdateSquad 每秒续租一次，3 s 足够跨过一次卡顿，
 *                       又短到持有者死了 / 换目标 / 被剧本接管时能自动回收。
 * coverSearchM          普通交火时给集成者的掩体查询半径提示（写进 task.coverRadiusM）。
 * holdCoverSlackM       守区的人允许出圈找掩体的余量：查询半径 = holdZone.radius + 这个数。
 *                       方案 §6 的 `Defend` 从「钉死 + 禁掩体」改成「锚点 + 半径」靠的就是这一条。
 * boundCoverSearchM     跃进时朝队向找下一个掩体的半径（比原地对射小，一次别跳太远）。
 * engageConfidence      情报置信度低于它就不算「知道他在哪」，不发 ENGAGE（只压制）。
 * engageMaxAgeS         最后目击超过这么久，同上。
 * suppressConfidence    压制射击的门槛：比 ENGAGE 松，「他大概还在那堵墙后面」就够了。
 * suppressMaxAgeS       压制射击对最后目击时间的容忍上限。
 * taskLeaseS            任务的有效期。比 1 s 的更新周期长一点，中间掉一拍不会让人呆立。
 * fillFlankMinEngagers  队里至少有这么多人在正面咬住，才允许第二个人去绕。
 *                       没有这一条，六个人可以一起绕到侧面 —— 那不叫侧翼，叫集体转移。
 * steerPathProbe        估路是否走导航场（`host.Steer`）。**默认关**：
 *                       `Script_Navigation.Steer` 每换一个目标格就要建一张距离场，
 *                       侧翼点每秒抽十几个候选，全走 Steer 会把场缓存冲垮。
 *                       直线采样 + Walkable 便宜且够用；要精确估路时再单独打开。
 */
// 表在本地可编辑（docs/Data_EnemyAi.md §14.4）：index.html 在本机预览或 ?aiedit=1 时置起
// TAIERZHUANG_TUNING_EDITABLE，敌军 AI 编辑器才能就地改数；线上与纯 Node 测试里照旧冻结。
const Freeze = (typeof globalThis === "object" && globalThis.TAIERZHUANG_TUNING_EDITABLE) ? (value) => value : Object.freeze;

export const TACTICS = Freeze({
  maxShootersPerTarget: 2,
  tokenLeaseS: 3.0,
  coverSearchM: 22,
  holdCoverSlackM: 6,
  boundCoverSearchM: 18,
  engageConfidence: 0.45,
  engageMaxAgeS: 4.0,
  suppressConfidence: 0.22,
  suppressMaxAgeS: 9.0,
  taskLeaseS: 1.6,
  fillFlankMinEngagers: 1,
  steerPathProbe: false,
});

/**
 * 角色偏好：`soldier.tacticalRole`（Script_Ai 按 `SQUAD.slots` 发）→ 这个人想干什么。
 *
 * 六人班里只有一个 flank 位、一个 support 位，所以这张表决定了班的形状：
 * 组长咬住正面、突击手跃进、机枪手压制、侧翼手绕、步枪手填空缺。
 * "fill" = 没有偏好，谁缺人补谁。noncombatant（伙夫、担架队）不参与战术分配。
 */
export const ROLE_PREFERENCE = Freeze({
  leader: "engage",
  assault: "bound",
  support: "suppress",
  flank: "flank",
  rifleman: "fill",
  noncombatant: "none",
});

/**
 * 抢令牌的顺序。前面的人先要，要不到的往后转压制 / 机动。
 * 组长排第一是有意的：一个班的正面火力应该从组长身上起。
 */
export const ENGAGE_PRIORITY = Freeze(["leader", "rifleman", "assault", "flank", "support"]);

/**
 * 侧翼。
 *
 * flankers          每班最多几个人在绕。六人班给 2 是上限不是常态
 *                   （见 TACTICS.fillFlankMinEngagers：第二个人要正面有人咬住才放）。
 * flankRadiusM      候选点摆在目标周围这个半径的一圈上。18 m：
 *                   够远到不是「贴着正面挪两步」，又近到绕过去还打得着。
 * flankSamples      一圈抽几个候选（30° 一个）。抽样点越多越贵，12 个已经能找出巷口。
 * flankMinAngleRad  候选点相对**目标正面**至少要偏这么多弧度才算绕过去了。
 *                   60°（1.047）与验收标准第 5 条「玩家正面 ±60° 以外」是同一个数。
 * flankMaxPathM     估路超过这么长就放弃：绕半个街区去侧翼，等到的时候仗已经打完了。
 * coverNearbyM      侧翼点附近这个半径内必须有掩体（问 coverRegistry.Nearby）。
 *                   绕过去站在空地上等于送人头，那比不绕还糟。
 * pathStepM         估路的采样步长（直线采样与 Steer 逐步都用它）。
 * pathMaxSteps      走导航场估路时最多问几步。
 * pathDetourFactor  直线距离乘这个数当估路结果：直线永远低估真实路程，
 *                   不补一刀会把「其实要绕两条巷子」的点当成很近。
 * angleWeight       打分：越偏离正面越好（弧度 × 权重）。
 * pathWeight        打分：路越短越好（米 × 权重）。
 *                   两条权重的比例决定「宁可多走十米绕到背后」还是「就近侧一点」。
 * holdS             选定一个侧翼点之后至少认这么久，中途不重选。
 *                   没有这一条，人每秒被指到一个新点，画面上就是原地打转。
 * arriveM           离侧翼点这么近就算到了，转回 ENGAGE。
 * recycleS          绕完一圈之后隔这么久才允许再绕。
 *                   没有这一条，人一到位就转 ENGAGE，下一秒又被派去绕下一个点 ——
 *                   来回横跳比不绕还难看。
 */
export const FLANK = Freeze({
  flankers: 2,
  flankRadiusM: 18,
  flankSamples: 12,
  flankMinAngleRad: 1.047,
  flankMaxPathM: 60,
  coverNearbyM: 6.5,
  pathStepM: 3,
  pathMaxSteps: 24,
  pathDetourFactor: 1.15,
  angleWeight: 6.0,
  pathWeight: 0.12,
  holdS: 8,
  arriveM: 3.0,
  recycleS: 12,
});

/**
 * 跃进（一动一掩护）。
 *
 * maxPairs      每班最多配几对。六人班理论上三对，实跑里多数人已经有别的活。
 * maxPairDistM  超过这么远的两个人不算一对：掩护要看得见对方跑过的那段路。
 * phaseS        多久互换一次 mover / coverer。1 s 一换太碎（跑三步就趴下），
 *               4 s 够一个人从这个掩体跑到下一个掩体再进入射击。
 */
export const BOUND = Freeze({
  maxPairs: 3,
  maxPairDistM: 26,
  phaseS: 4.0,
});

/**
 * 投弹。**只给身上真有手榴弹的人**（见 Script_AiTactics 头注的携行字段约定）。
 *
 * holdS               对方在同一个位置 / 同一个掩体待够这么久才值得扔。
 *                     这条是玩法信号：蹲在一个掩体后面不动会挨手榴弹，逼玩家换位。
 * minM                比这更近不扔（自己也在杀伤半径里）。实际下限还会与
 *                     `WEAPONS.Grenade.radiusM + selfSafetyMarginM` 取大者。
 * maxM                比这更远不扔。上限还会与投掷初速算出的射程取小者。
 * maxRiseM            目标比自己高出这么多就放弃（抛物线粗验）。
 *                     4 m 里有一米六是眼高差，真正允许的高差约两米半 —— 扔得上矮墙、
 *                     扔不上城墙与二层窗，正是想要的分界。
 * squadCooldownS      每班的投弹间隔。没有它，六个人同一秒一起扔，
 *                     那不是战术是齐射（齐射另有剧本 `VolleyThrow` 走）。
 * personalCooldownS   每人的投弹间隔。
 * selfSafetyMarginM   自身安全余量，与手榴弹杀伤半径相加当最小投掷距离。
 * lkpMaxAgeS          情报比这更旧就不扔：往三秒前的影子上扔弹是纯浪费。
 * gravityMps2         抛物线粗验用的重力（与物理世界同一量级即可，这里只做量纲估算）。
 * rangeSafety         按初速算出的理论射程要打的折：真人不是 45° 满力抛。
 */
export const GRENADE = Freeze({
  // 【2026-09-08 验收调整】原 holdS 3.0 / squadCooldownS 12：正片前沿实拍 40 s 里日军投出 12 枚，
  // 玩家在空地上站定十来秒就有两枚落在脚边（1 m / 4 m）。手榴弹要保持「事件」的分量，
  // 不能变成 COD 式的雨点；每班 20 s 一枚、对方钉住 5 s 才值得扔，验收探针
  // （AiCombatBrowserTest ⑥：钉住 60 s 内 ≥ 1 枚）仍然成立。
  holdS: 5.0,
  minM: 8,
  maxM: 26,
  maxRiseM: 4.0,
  squadCooldownS: 20,
  personalCooldownS: 22,
  selfSafetyMarginM: 2.5,
  lkpMaxAgeS: 3.0,
  gravityMps2: 9.81,
  rangeSafety: 0.75,
});

/**
 * 撤退 / 散伙。这是**班组瓦解**的表现，不是士气条（cohesion 是密度不是士气，
 * 见 Script_Ai 里那条注释：永不出 UI）。
 *
 * 判据（Script_AiTactics.ShouldRetreat）：
 *   ① 本班存活比 < retreatSurvivorRatio —— 六个人剩两个，剩下的不该继续顶；
 *   ② 或者「二十米内一个友军都没有」已经持续 lonelyS 秒，**并且**
 *      （班组密度 cohesion 低于 retreatCohesion 或者压制高于 retreatSuppression）。
 * 第二条特意写成「孤立」与「散/被打狠」的合取：一个人在人堆里被压得抬不起头
 * 应该往掩体里缩（那是 SUPPRESSED 干的事），不是转身就跑。
 *
 * retreatCohesion      cohesion = 0.35 + 34 m 内友军数 / 8。0.45 ≈ 身边不到一个人。
 * retreatSuppression   压制超过它算被打散（0.85 已经是趴地上的量级）。
 * lonelyS              孤立要持续这么久才作数，避免队友短暂脱离视野就崩。
 * retreatSurvivorRatio 六人班剩两个（0.33）就低于它。
 * minSquadForRatio     少于这么多人的编组不看存活比（两人组死一个不算崩）。
 * peakWindowS          存活比的分母（峰值人数）只在这个时间窗内有效，
 *                      过窗重置成当前人数 —— 否则一个被合并 / 改编过的班会永远在撤退。
 * fallbackM            撤退点：全班重心背敌方向再退这么远。
 * holdS                一旦决定撤退，任务至少保持这么久，不许下一秒又转头。
 */
export const RETREAT = Freeze({
  retreatCohesion: 0.45,
  retreatSuppression: 0.85,
  lonelyS: 6,
  retreatSurvivorRatio: 0.34,
  minSquadForRatio: 3,
  peakWindowS: 60,
  fallbackM: 16,
  holdS: 6,
});

/**
 * 去查看（LKP 追踪）。「敌人会往你最后露头的地方摸过来」这条体感就靠它。
 *
 * investigateConfidence  最后目击位置的置信度门槛。
 * investigateMaxM        超过这么远不去（换成推进 / 掩体对射）。
 * minM                   已经站在最后目击点这么近了就别再"去查看"了。
 * maxAgeS                情报旧过这么久就当没有。
 * minAwareness           没有 alert 字符串时的兜底门槛（用 Perception 的 awareness 0..1）。
 * holdS                  任务有效期：走过去要时间，别每秒重下一次决心。
 * arriveM                到点判定半径。
 */
export const INVESTIGATE = Freeze({
  investigateConfidence: 0.35,
  investigateMaxM: 45,
  minM: 3.0,
  maxAgeS: 12,
  minAwareness: 0.5,
  holdS: 8,
  arriveM: 2.5,
});

/**
 * 班组黑板。
 *
 * blackboardMemoryS  一条敌情在黑板上留多久。12 s：够全班在一次交火里共享
 *                    「他刚才在东墙根」，又不至于把上一条街的旧情报当现况。
 * focusHoldS         队级焦点的迟滞窗口，与 `Script_Ai.UpdateSquads` 的 4 s 是同一个数
 *                    （那边写死在代码里，这里是新写的一份，接入时以本表为准）。
 * switchRatio        窗口过后也要新目标近到这个倍数以内才换（1.3 = 距离差不到三成不换）。
 *                    这两条一起消掉「两个距离相近的敌人让六把枪一起左右摆」。
 * maxEnemies         黑板最多记几个目标，超了丢最旧的一条。
 */
export const BLACKBOARD = Freeze({
  blackboardMemoryS: 12,
  focusHoldS: 4.0,
  switchRatio: 1.3,
  maxEnemies: 8,
});
