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

  /**
   * **现役掩体的保留分**（2026-09-23）。调用方把当前占着的那个点的 id 传进
   * `Query` 的 `opts.keepCoverId`，它在最终排序之前拿到这么多分。
   *
   * 病根：重选每 `COVER_CYCLE.reselectMinS`（2.5 s）一次、威胁点挪过
   * `BRAIN.threatMoveM`（4 m）就重算，而现役掩体在打分里**没有任何优势** ——
   * 于是人刚跑到位（coverPhase 才从 approach 转 hide）就被 8–10 m 外一个分数高
   * 一点点的新点挖走，整场仗都在两堵墙之间跑，探头周期一次都跑不完。
   *
   * 8 分 ≈ 8 m 路程（距离项是 1 分/米）：差得比这还少就留在原地把这一轮打完，
   * 真的差出一段（对面绕到侧面、这堵墙被炸没、新点验证过挡得住而旧点挡不住 ——
   * 光验证那一项就值 18–26 分）仍然会换。紧急重选那一档另有 `urgentReselectS`，
   * 与这条不冲突：那是「现在这个点已经废了」，这条是「还没废就别乱动」。
   */
  incumbent: 8,
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

  /** 硬下限：队友已经占着（或正走向）的隐蔽位，这么近的候选直接不要。
   *  上面那条只是扣分，窄壕里只剩一个合格掩体时两个人照样挑中同一个点，
   *  跪在一起叠成一个人（2026-09-16「侧沟有日军」实拍）。两个跪姿胶囊半径 0.34，
   *  0.9 m 再给枪和肩膀留出余量。 */
  claimedHideClearanceM: 0.9,

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
  /** 连续这么多次探头都没看见目标，这个掩体就按失败处理（failedRetryS 内不再选）、换点。 */
  blindPeeksBeforeMove: 3,
  /** 任务侧开关（`AiDirector.missionCoverRules`，第一关 01–06）打开时，「白探头」也算瞎探：
   *  探出去看见了人、可一发都没打出去（弹道被他那道胸墙挡死、枪口转不过去）—— 连着
   *  blindPeeksBeforeMove 次就换点。09-24 探针：03 的掩体里有人看得见左前枪位的老周、
   *  36 m 外一发打不过去，缩头探头一整个相位。07 以后开关关着，仍只认「没看见」。 */
  missionWastedPeekIsBlind: true,
  /** 任务侧开关下、手上有关卡授权点（`ambientFirePoints`）的人：missionOpenWindowS 秒内因为瞎探 /
   *  白探头连换 missionOpenAfterMoves 次掩体，说明身边的掩体探头位都打不出去 —— 接下来
   *  missionOpenGroundS 秒不选掩体，就地跪着打（空地上的探头位对授权点大多是通的）。
   *  2026-09-24 实机挑点侦察：03 待命区掩体里的人对任何授权点都不通，同一片空地上的人全通。 */
  missionOpenAfterMoves: 2,
  missionOpenWindowS: 30,
  missionOpenGroundS: 12,
  /** 当前掩体被判侧翼要**持续**这么久才紧急换点：目标在两侧敌人间来回切时单拍判定会翻。 */
  flankGraceS: 1.5,
  /** blindPeeksBeforeMove / flankGraceS / 按隐蔽位判侧翼这三条只对这些阵营生效。
   *  2026-09-16 只给国军：日军的屋内伏击、开场追兵按原掩体周期调过节奏，
   *  三条一起对日军生效时 `--stage-from=8` 的伏击拍失序（改回原判定即通过）。 */
  refinedSides: ["nra"],
  /** 任务侧开关（`AiDirector.missionCoverRules`）打开时改用这一份。2026-09-23 起第一关 01–06 的
   *  任务相位打开它（`Script_FirstLevelFrontPressure`）：日军连探三次没看见人就换点、
   *  被抄侧翼要持续 flankGraceS 才紧急换点。07 以后开关是关的，仍按 refinedSides。 */
  missionRefinedSides: ["nra", "ija"],
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

/**
 * 从实体碰撞盒派生掩体点（`Script_AiCover.DeriveCoversFromColliders`）。
 *
 * 2026-09-16 取证（`_shots/SquadContact`）：第一关全关只有 351 个手工登记点，村口、转运区、
 * 撤退路上的院墙与土墙一个都没登记 —— 转运区队友 15 m 内 0 个点、撤退段 14 m 外才 1 个，
 * 「看见敌人不找掩体」一半是规则、一半是这张表空着。派生只认**真的挡得住人**的薄实体：
 * 贴地、够高、够长、不太厚（厚块的中线点算出来的隐蔽位会落进实体里）。
 */
export const DERIVED_COVER = Freeze({
  /** 离地高度下限。蹲姿眼高 1.0 m，验证要求「蹲着挡得住」，再矮的点只会白烧验证名额。 */
  minHeightM: 0.95,
  /** 盒底离地超过它就不是墙（门楣、屋檐、平台）。 */
  maxBaseRiseM: 0.35,
  /** 长边下限：柱子、栅栏桩藏不住人。 */
  minLengthM: 0.9,
  /** 薄墙厚度上限。隐蔽位离登记点 standoffM（0.65），半厚 0.35 时离墙面还有 0.3 m。
   *  更厚的盒子（箱垛、土坯垛）改成四面各登记一个**单面**点（`oneSided`）。 */
  maxThicknessM: 0.7,
  /** 厚盒子的单面点放在面内这么深：与薄墙「点在中线、离面 0.2–0.35 m」一致。 */
  faceInsetM: 0.25,
  /** 厚盒子最长边上限：再大就不是垛子，是地形块或整栋房子。 */
  maxBlockM: 8,
  /** 矮墙（< COVER.tallM）沿墙每隔多少米一个点。 */
  lowSpacingM: 2.5,
  /** 高墙只在墙头登记：离端点这么远，侧步 sideStepM 正好探出墙角。 */
  tallEndInsetM: 0.35,
  /** 端点外这么远处若还有同高的实体（墙接着墙），这一头不是墙角。 */
  endProbeM: 0.45,
  /** 离手工登记点这么近就不再派生（手工点的法线与位置优先）。 */
  dedupeM: 1.2,
  /** 叠起来的沙袋/土坯：底盒顶面与上盒底面差在这个量以内算同一垛。 */
  stackGapM: 0.08,
  /** 哪些阵营的人会用派生点。只给国军：日军的开场追兵、屋内伏击等剧本拍按手工点调过，
   *  让他们也躲进派生点会把人藏到玩家找不到的地方（合入样条交通壕后开场卡在遮蔽点折角）。 */
  usableBy: ["nra"],
  /** 任务侧开关（`AiDirector.missionCoverRules`）打开时改用这一份：第一关 01–06 的日军
   *  也能躲进派生点（土坎、残墙没有手工登记点的那一大片）。当初排除日军的两条理由
   *（开场追兵的遮蔽点折角、屋内伏击拍）都已下线；07 以后开关关着，行为不变。 */
  missionUsableBy: ["nra", "ija"],
});
