// ===========================================================================
// Data_Tuning_FirstLevelFront.mjs —— 第一关公开阶段 1–7（Front 玩法包）的数值
//
// 2026.09.19 重构第二波（docs/Data_FirstLevelRebuild20260919Contract.md §8）：
// 数值另建一张表减少同文件冲突。每一条都写出处：要么来自 Notion 采用稿的
// 「通过条件」，要么沿用同族既有值，要么是本包按几何算出来的（写清楚怎么算的）。
// 没有实拍以前不新造手感。
//
// 纯数据、零副作用、零 three：Node 里 import 即可读。
// ===========================================================================
// 这张表**不许 import 任何第一关的其它表**：入口 Data_Tuning_FirstLevel 会 re-export 它，
// 反过来再引它就成了循环（Data_Tuning_FirstLevel → 本表 → Layout → … → Tuning，实测炸在
// Data_FirstLevelMissionTrain 的 "Cannot access R before initialization"）。
// 需要路线或别处的数值时由调用方传进来。

export const FRONT_TUNING = Object.freeze({
  // =========================================================================
  // 01 受困 · 门外的行刑
  //
  // 整拍靠 BunkerKilling 的逐句 Line 事件驱动（契约 §8：播放器对每句发 Line）。
  // 下面这些是「没有音频 / Line 迟到」时的兜底偏移（相对 killAt，秒）。
  // 取值按 MissionVoiceTimeline 对 BunkerKilling 的估时（4 句 7.84 秒）分摊，
  // 每句约 1.96 秒，兜底比估时略慢一点，免得抢在 Line 前面。
  // =========================================================================
  bunkerKillFallbackS: Object.freeze([0, 2.1, 4.2, 6.3]),
  // 枪托砸下去到扶人川军倒地：一记动作，取近战 windup 同量级（Data_MeleeCombat 的 0.35–0.5）。
  bunkerButtStrikeS: 0.45,
  // 被砸倒 / 往后缩的位移。腿伤的人「本能往后缩」，一次缩这么远（半个身位）。
  bunkerRecoilM: 0.55,
  // 扶人川军伸手去抓枪身：往 captiveRifles[0] 挪这么远（够不着，随即被踹开）。
  bunkerGrabM: 0.9,
  // 被踹开：沿日兵→俘虏方向推这么远（一脚的量）。
  bunkerKickBackM: 0.7,
  // 侧面补刺：第二个日兵绕到腿伤者旁边这么远下刀（不挡玩家视线）。
  bunkerFlankOffsetM: 1.1,
  // 踢开步枪：末句之后这么久（让刺杀先落定）。
  bunkerRifleKickAtS: 1.6,
  // 踢开的步枪滑出去多远（一脚踢地上的长枪）。
  bunkerRifleSlideM: 1.8,
  // 木架轻响 → 日兵转向门内。ShunziCurse（3.94 秒）播完之后这么久响一声。
  bunkerCreakAfterS: 0.7,
  // 全段兜底：killAt 之后这么久还没走到「转向门内」就直接推到那一步
  // （trappedMaxS 20 秒是控制接管的上限，留 4 秒余量）。
  bunkerShowFallbackS: 16,
  // 后侧同伴清理坍塌物的声音：从踢枪那一刻起，每这么久响一记 debrisFall。
  bunkerRearDigIntervalS: 1.9,
  bunkerRearDigVolume: 0.55,

  // =========================================================================
  // 02 班长救人 · 撤入后交通壕
  // =========================================================================
  // 幺娃走到 yaowaLift 拉背包：两个人都到位（或等满 rescueGatherMaxS）才起掀架那一拍。
  rescueGatherMaxS: 6,
  // 何有田在后侧交通壕开火逼日兵转身：他压着门外这一片。
  rescueSuppressIntervalS: 0.8,
  // 「枪拿到！从后头走！」在还权之后这么久说（让玩家先站起来）。
  rescueOutAfterS: 0.6,
  // 玩家在后交通壕里站直＝探头挨骂（TrenchCurse）。站够这么久才算探头，
  // 免得走两步碰一下 C 键就触发。
  trenchPeekS: 1.1,
  // 一直趴着走的人也得听到这一段：进沟之后这么久还没探头就补一次。
  trenchCurseFallbackS: 26,

  // =========================================================================
  // 04 接替火力 · 守军指出北头弹药屋
  // =========================================================================
  // 说 BundleOrder 的那个守军：从还活着的撤退守军里挑离玩家最近的，朝北指。
  bundleOrderPointS: 3.2,
  // 何有田接枪、文财看沟口：听完命令之后这么久各就各位。
  bundleHandoverS: 1.2,
  // 文财看沟口站在前沿交通壕口（MISSION_ROUTES.support 的末点）。
  trenchMouthWatch: Object.freeze({ x: 6, z: -124 }),

  // =========================================================================
  // 05 取弹炸车
  // =========================================================================
  // 「趴下！它转过来了！」：战车在这么近、炮塔又朝着玩家这么小的夹角里，就喊一次。
  // 40 m 是 Data_Tuning_AiShooting 那一档的「看得清人」距离；0.5 rad ≈ 29°，
  // 比 tankHullMgArcRad 宽一点 —— 喊的是「它正在转过来」，不是「已经瞄准了」。
  bundleProneRangeM: 40,
  bundleProneArcRad: 0.5,
  // 「班长！它往沟口挤了！」：取到弹之后，战车比取弹时又往南压了这么多米就喊。
  bundleReturnTankGainM: 12,
  // 一直没压过来也要喊（返程压力靠对白交代）：取到弹之后这么久兜底。
  bundleReturnFallbackS: 22,
  // 「停了！」在履带断掉之后这么久说（先让爆炸声过去）。
  tankStoppedAfterS: 1.4,

  // =========================================================================
  // 06 回到伤员集结处 · 借火
  // =========================================================================
  // 集结处的摆位人数由 MISSION_PLACEMENT.collection 决定（担架 4 / 伤员 5 / 搬运 4）。
  // 02 路过时就已经在了；传令兵 06 才到。
  collectionDressStep: "RearTrench",
  collectionRunnerStep: "Orders",
  // 摸兜找火那两下的间隔（一次「摸」）。
  borrowPatIntervalS: 0.9,
  // 顺子把火柴往兜里一收 / 老周递烟：事件到了之后这一小段动作时长。
  borrowPocketS: 1.0,
  borrowOfferS: 1.2,
  // 点烟：划火柴到烟头亮起来。
  borrowLightS: 1.4,
  // 老周挪身牵到伤腿皱眉：递完烟之后这么久（一次吸气）。
  borrowWinceS: 0.8,
  // 担架员把老周抬上担架（ZhouLift 播完 → zhouOnLitter）之后，
  // 他从土壁挪回队列那一小段的时长，走 litterSpeedMps 的量级。
  zhouLiftMoveS: 2.6,

  // =========================================================================
  // 07 沿沟南行
  //
  // 目标时长 45–75 秒（契约 §2）。southWalk 全长 135.4 m。
  // 行军速度 2.2–2.6 m/s（需求原文的配速）→ 52–62 秒；再加抵达村口之后
  // VillagePointer（7.94 秒）播完，落在 60–70 秒。下限 45 秒留给一路小跑的玩家。
  // =========================================================================
  southTargetSecondsMin: 45,
  southTargetSecondsMax: 75,
  southMarchSpeedMps: Object.freeze({ min: 2.2, max: 2.6 }),
  // 幺娃靠近玩家才说私语（不是一进 07 就自动播）。6 m 是「并排走着说悄悄话」的距离。
  southWhisperRangeM: 6,
  // 幺娃一直没靠过来也要说（他会被接触反应留在后头）：进 07 这么久兜底。
  southWhisperFallbackS: 20,
  // 幺娃靠上来时贴玩家这么近走（并排，不挡路）。
  southWhisperSideM: 1.6,
  // 路边指路的人站在村口以北这么远的路边（VillagePointer 从他那儿发声）。
  southPointerBackM: 14,
  southPointerSideM: 3.2,
});

/** 07 南行的路线全长（m）。传 `MISSION_ROUTES.southWalk`（它与 `south` 是同一个数组）。 */
export function SouthWalkLengthM(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++)
    total += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  return total;
}

/**
 * 07 在给定行军速度下的纯行走秒数（不含抵达村口后 VillagePointer 播完那一段）。
 * 时长闸的算式只有这一处，测试与文档共用。
 */
export function SouthWalkSeconds(speedMps, route) {
  return SouthWalkLengthM(route) / speedMps;
}

/**
 * 01 行刑那一拍的节拍表：`BunkerKilling` 的第 i 句对应做什么。
 * 纯数据 —— 运行时按 `Line` 事件查这张表，没有音频时按 `at` 兜底。
 *
 *   butt    日兵甲用枪托猛砸扶人川军，把他打倒
 *   recoil  腿伤士兵本能往后缩
 *   rise    扶人川军挣扎着要起身
 *   stab    日兵甲挺刺刀逼上去：抓枪 → 被踹开 → 遭刺杀；随后日兵乙从侧面补刺
 */
export const BUNKER_KILL_BEATS = Object.freeze([
  Object.freeze({ line: 0, action: "butt", at: FRONT_TUNING.bunkerKillFallbackS[0] }),
  Object.freeze({ line: 1, action: "recoil", at: FRONT_TUNING.bunkerKillFallbackS[1] }),
  Object.freeze({ line: 2, action: "rise", at: FRONT_TUNING.bunkerKillFallbackS[2] }),
  Object.freeze({ line: 3, action: "stab", at: FRONT_TUNING.bunkerKillFallbackS[3] }),
]);

/**
 * 06 借火那一段的节拍表：`BorrowLight` 的第 i 句对应的姿态，
 * 以及两处动作空当（具名事件 BorrowLightMatchesPocketed / BorrowLightCigaretteOffered）。
 *
 *   ask      老周靠土壁叼烟，看见顺子经过，开口要火
 *   pat      摸了两遍衣兜，没找到火
 *   pocket   顺子把火柴往兜里一收（事件）
 *   offer    老周摸出压扁的纸烟包，抽一根递过去（事件）
 *   light    顺子先划火给自己点上
 *   share    再把火递近一点让老周借火；老周挪身牵到伤腿皱眉
 */
export const BORROW_LIGHT_BEATS = Object.freeze([
  Object.freeze({ line: 0, action: "ask" }),
  Object.freeze({ line: 4, action: "pat" }),
  Object.freeze({ event: "BorrowLightMatchesPocketed", action: "pocket" }),
  Object.freeze({ event: "BorrowLightCigaretteOffered", action: "offer" }),
  Object.freeze({ line: 7, action: "light" }),
  Object.freeze({ line: 8, action: "share" }),
]);

export const FRONT_TUNING_SOURCES = Object.freeze({
  bunkerKillFallbackS: "MissionVoiceTimeline 对 BunkerKilling 的 7.84 秒 / 4 句",
  bunkerButtStrikeS: "Data_MeleeCombat 的近战 windup 同量级",
  bunkerRearDigIntervalS: "一记 debrisFall 的间隔，按旁边有人在扒土的频率",
  rescueGatherMaxS: "bunkerRescueSeconds（4.4 s）之前两个人要到位",
  bundleProneRangeM: "Data_Tuning_AiShooting 的 CLOSE_RANGE 同一档",
  southMarchSpeedMps: "Notion 采用稿 07 的配速要求（2.2–2.6 m/s）",
  southTargetSecondsMin: "契约 §2：07 目标时长 45–75 秒",
  zhouLiftMoveS: "litterSpeedMps（1.4 m/s）量级",
});
