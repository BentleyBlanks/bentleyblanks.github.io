// Data_Tuning_AiCover.mjs — 战术位置系统（掩体）的几何、限额、打分权重与掩体周期节拍。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。规则在 `Script_AiCover.mjs`，
// 它 import 这张表按名读，不复制到本地常量（热改表要立刻生效，测试也从表里读期望值）。
// 设计依据：docs/Data_EnemyAi.md §4.2 / §7。
//
// **不在这张表里的**：
//   · 发现距离 `SIGHT_BY_STANCE` / 姿态胶囊 `CAPSULE` → `Data_Tuning_Ai.mjs`（跨系统契约名）；
//   · 命中率、压制、部位倍率 → `Data_Battle.COMBAT`（docs/Data_PlayerDamage.md）；
//   · 眼高 0 站 1.5 / 1 蹲 1.0 / 2 卧 0.5 → `AiDirector.StanceEye`（由 host 注入，
//     这里只在 host 没给回调时兜底，见 `Script_AiCover.FALLBACK_EYE`）；
//   · 第一关的 `defendCoverSlackM` / `assaultCoverSearchM` → `Data_Tuning_FirstLevel.mjs`。

/**
 * 打分权重。分数是**各项直接相加**（不归一），所以每一项的量纲写在这里：
 * 「一米距离 = 1 分」是标尺，别的项都按它折算。
 *
 * 单调性契约（`Script_AiCoverTest` 有断言，改数不许把这三条改反）：
 *   ① 其它条件相同，更近的分更高  → distanceM < 0；
 *   ② 其它条件相同，法线更正对威胁的分更高 → alignment > 0；
 *   ③ 其它条件相同，射线验证「真的挡住了」的分更高 → validatedCrouched > validatedFail。
 */
// 表在本地可编辑（docs/Data_EnemyAi.md §14.4）：index.html 在本机预览或 ?aiedit=1 时置起
// TAIERZHUANG_TUNING_EDITABLE，敌军 AI 编辑器才能就地改数；线上与纯 Node 测试里照旧冻结。
const Freeze = (typeof globalThis === "object" && globalThis.TAIERZHUANG_TUNING_EDITABLE) ? (value) => value : Object.freeze;

export const COVER_WEIGHTS = Freeze({
  /** 每米直线距离。旧 `FindCover` 是 -0.5/m，配 6 分的高度项 —— 于是二十米外
   *  高半米的墙能压过身边的墙。这里把标尺定成 1 分/米，别的项按它重新配。 */
  distanceM: -1.0,

  /** 法线与「掩体→威胁」方向的对齐度（0..1）满分。取 **|dot|**：
   *  生产方对法线正负没有统一约定（见 Script_AiCover 头注），能用的信息是
   *  「这堵墙的面**垂不垂直于**威胁方向」，不是「朝哪边」。
   *  14 分 ≈ 十四米距离，足以让人多跑一段去找一堵正对着敌人的墙。 */
  alignment: 14,

  /** 掩体没有朝向（生产方没给法线）时的对齐项。给 0：不吃朝向分，但也不倒扣 ——
   *  身边唯一一堵没登记法线的矮墙仍然选得上，只是排在有朝向的同类后面。 */
  noNormal: 0,

  /** 每米掩体高（封顶 heightCapM）。1.2 m 的墙比 0.6 m 的墙多 2.4 分 ≈ 两米路程。 */
  heightM: 4.0,

  /** 站得住人的高掩体（height ≥ tallM）的额外分：能站着装弹、能侧步探头。 */
  tallBonus: 3,

  /** 射线验证：威胁看不见蹲在隐蔽位的人。这是「会躲」的主奖励。 */
  validatedCrouched: 18,

  /** 额外：站着也看不见（高掩体常见）。与上一项叠加。 */
  validatedStanding: 8,

  /** 验证过、但两条线都通 —— 这个点根本挡不住这个威胁。扣到它排在
   *  「没验证过的邻居」后面（未验证是 0 分），但不至于比二十米外的点还差。 */
  validatedFail: -14,

  /** 点已被别的兵占。不是硬禁：全员被压在一堵墙后面时，宁可两个人挤也别站在空地上。 */
  occupiedOther: -60,

  /** 隐蔽位不可走（导航图里是墙/图外）。基本等于废点。 */
  notWalkable: -50,

  /** 直线路径上每一个不可走的采样点。三个采样全堵 = -36，足以让人换一个绕得过去的点。 */
  pathBlockedSample: -12,

  /** 友军离隐蔽位太近（minAllySpacingM 以内）的惩罚，按侵入深度线性给。
   *  这条防的是「六个人叠在同一堵墙的同一米上」。 */
  allySpacing: -8,

  /** 跃进：每往 `opts.toward` 方向推进一米的加分（前后都封顶 towardCapM）。
   *  3 分/米 > 1 分/米的距离项 —— 推进时愿意多跑一段去拿前面的墙。 */
  toward: 3.0,

  /** 威胁眼位高过掩体顶（超出 elevationSlackM 之后）每米的惩罚：
   *  站在土坡/楼上的敌人能俯射，矮墙在他眼里等于不存在。 */
  elevationM: -3.0,
});

/**
 * 掩体几何、空间散列与每次查询的限额。
 *
 * 性能口径（docs/Data_EnemyAi.md §7）：Query 走空间散列邻域，候选 ≤ maxCandidates，
 * 射线验证 ≤ maxValidate 个 × 2 条，结果按 validCacheS 缓存。
 */
export const COVER = Freeze({
  /** 「高掩体」阈值：站姿眼高 1.5 m（StanceEye(0)）+ 0.05 m 余量。
   *  ≥ 这个高度才藏得住一个站着的人，于是才谈得上「贴墙站 + 侧步探头」；
   *  以下的一律当矮掩体（蹲藏 / 跪射探头）。
   *  注意与 `Script_Ai.Act` 里那条旧启发式 `(c.height ?? 1) < 1.25 → 蹲` 不是同一个数：
   *  那条只管「到了掩体点要不要蹲」，这条管「这堵墙能怎么用」。 */
  tallM: 1.55,

  /** 低于这个高度的登记点直接丢：卧姿眼高 0.5 m，比它还矮的沿子谁也挡不住，
   *  留在表里只会稀释空间散列。生产方自己也有 coverMinH 过滤（Script_WallPlan）。 */
  minUsefulM: 0.45,

  /** 隐蔽位离**掩体登记点**的距离。登记点在墙体上（见 Script_AiCover 头注的约定），
   *  0.65 m ≈ 半个墙厚（0.2）+ 一个人贴墙站的余量（0.45）。
   *  与 hitSlackM 有几何依赖：0.65 - 0.2 = 0.45 > 0.30，验证射线的末端容差
   *  才不会把「墙就在眼前」误判成「没挡住」。两个数一起改。 */
  standoffM: 0.65,

  /** 高掩体侧步探头的横移量。0.55 m ≈ 半个肩宽 + 枪口伸出墙角，
   *  程序化位移就能演出来（docs/Data_EnemyAi.md §8：不做新 clip）。 */
  sideStepM: 0.55,

  /** 空间散列格边长。4 m：22 m 半径 → 12×12 = 144 格，城里最密的院墙区
   *  单格也就几个点，邻域扫描一次在百量级。 */
  cellM: 4,

  /** 默认查询半径。沿用旧 `FindCover` 的 22 m —— 这是「值得为它跑一趟的距离」，
   *  再远人还没跑到就被打死了。 */
  defaultRadiusM: 22,

  /** 每次查询保留的候选上限（打完便宜分后取前 N 做完整打分）。 */
  maxCandidates: 16,

  /** 每次查询做射线验证的候选数上限（每个 ≤ 2 条射线）。 */
  maxValidate: 3,

  /** 验证结果的缓存时长（秒）。Think 是 1/6 分帧（≈0.1 s），0.75 s ≈ 七次决策共用一次射线。 */
  validCacheS: 0.75,

  /** 威胁走出这个距离就作废缓存：三米外的敌人看到的已经是另一条线。 */
  validCacheMoveM: 1.5,

  /** 射线末端容差：命中点距离终点小于它就不算「挡住」（终点本来就贴着墙面）。
   *  比 `Script_Ai.HasLineOfSight` 的 0.4 小 —— 那条要的是「看得见就算看得见」，
   *  这条要的是「墙必须真的在两点之间」。 */
  hitSlackM: 0.30,

  /** 被抄侧翼的夹角：威胁方向偏离「掩体正对方向」超过它就算被绕。
   *  1.31 rad ≈ 75°，比 90° 早一点 —— 等敌人真绕到侧面再动就来不及了。 */
  flankAngleRad: 1.31,

  /** 同一时刻两个人的隐蔽位至少差这么远。 */
  minAllySpacingM: 2.0,

  /** 直线估路的采样点数（不含两端）。3 个：够识破「中间隔着一堵墙」，又不至于每候选十几次查询。 */
  pathSamples: 3,

  /** 「掩体在我与威胁之间」硬条件的松量：掩体到威胁比我到威胁近这么多才算数。 */
  betweenSlackM: 0.5,

  /** id 哈希的坐标量化（米）。5 cm：同一坐标重建后 id 不变，
   *  浮点噪音（BuildAll 重跑的最后一位）也不会换 id。 */
  hashQuantM: 0.05,

  /** 高度打分的封顶：再高的墙也不比 2.2 m 的墙更能藏人（多出来的只是屋顶）。 */
  heightCapM: 2.2,

  /** 威胁高过掩体顶多少米之内不算俯射（人站在墙后本来就比墙顶矮一点）。 */
  elevationSlackM: 0.4,

  /** 推进加分的前后封顶（米）。 */
  towardCapM: 12,

  /** 压制超过它，隐蔽姿态再降一档：矮掩体 蹲→卧，高掩体 站→蹲。
   *  0.55 落在 `Script_Ai.WantStance` 的两个阈值（0.35 蹲 / 0.75 停火）之间，
   *  于是「压得动不了」与「压得只能趴着」是两件事。 */
  suppressionProneAt: 0.55,

  weights: COVER_WEIGHTS,
});

/**
 * 掩体周期的节拍。**第二波大脑重排（docs/Data_EnemyAi.md §5 的 COVER_ENGAGE）消费**，
 * `Script_AiCover` 自己不读；放在同一张表里是因为「探头多久」和「侧步多远」是同一件事的两半，
 * 分到两个文件里改一半忘一半。
 */
export const COVER_CYCLE = Freeze({
  incomingMemoryS:4,
  grenadeStanceHoldS:.5,
  // 2026-09-11: stalled shelters must release ownership and allow normal obstacle recovery.
  selectedValidationBudget: 2,
  microMoveM: 2,
  traversalTurnRadPerS: 5,
  urgentReselectS: 0.4,
  stalledApproachS: 2.5,
  failedRetryS: 7,
  progressM: 0.35,
  /** 两次重选掩体的最小间隔（秒）。紧急失效改用 urgentReselectS，避免每次思考都重查。 */
  reselectMinS: 2.5,

  /** 到位判定：离 hidePos 小于它就算「进掩体了」。与验收标准 §9 第 1 条的 1.2 m 同一个数。 */
  arriveRadiusM: 1.2,

  /** 缩头停留时长（秒），实际值在区间里按 host.Rnd 取 —— 一排人不许同时探头。 */
  hideDwellMinS: 0.9,
  hideDwellMaxS: 2.2,

  /** 探头暴露时长（秒）。上限压在 1.6 s：再久玩家就该稳稳打中了（这正是我们要的）。 */
  peekMinS: 0.7,
  peekMaxS: 1.6,

  /** 隔多久重查一次「有没有被抄侧翼」（秒）。比 reselectMinS 短：先知道，再决定换不换。 */
  flankRecheckS: 1.0,
});
