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
  // 木架响后等日兵真的走近门口再记 doorSearchStarted；1.4 m 是近身到门垛的一步距离。
  bunkerDoorArriveM: 1.4,
  // 全段兜底：killAt 之后这么久还没走到「转向门内」就直接推到那一步
  // （trappedMaxS 40 秒只防失控；正常路径等两名搜索兵实际到门再进入 02 并显式还权）。
  bunkerShowFallbackS: 16,
  // 后侧同伴清理坍塌物的声音：从踢枪那一刻起，每这么久响一记 debrisFall。
  bunkerRearDigIntervalS: 1.9,
  bunkerRearDigVolume: 0.55,
  // 受困期间把视野收窄（「卡着只能盯着看」）。基准 FOV 是 CAMERA.baseFovDeg=55；
  // 收到 50 之后门外 8.5 m 处一个站着的人在 720p 里有约 150 像素高（55° 时约 134）。
  // 取的是 min(玩家的 FOV, 50)：把 FOV 调得更窄的玩家不会反被拉宽。
  trappedFovDeg: 50,
  // 收窄/还原的指数追赶系数（1/s）。1.6 → 约 1.9 秒走完九成，镜头不「啵」一下。
  trappedFovLerpRate: 1.6,

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
  // Browser driver survival discipline: leave the exposed gun when a bleeding
  // wound has crossed this line, dress behind its wall, and do not remount until
  // the ordinary bandage regeneration has restored a viable firing state.
  machineGunDriverHealHealth: 78,
  machineGunDriverRemountHealth: 76,

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
  // With the real 19.6 m/s² world gravity, a 13 m/s bundle from the ditch floor
  // has roughly nine metres of useful covered reach. The tank stop must enter
  // this radius; the driver waits in the ditch and never chases onto the road.
  bundleCoveredThrowRangeM: 9,
  // 「停了！」在履带断掉之后这么久说（先让爆炸声过去）。
  tankStoppedAfterS: 1.4,

  // =========================================================================
  // 06 回到伤员集结处 · 借火
  // =========================================================================
  // 集结处的摆位人数由 MISSION_PLACEMENT.collection 决定（担架 4 / 伤员 5 / 搬运 4）。
  // 02 路过时就已经在了；传令兵 06 才到。
  collectionDressStep: "RearTrench",
  collectionRunnerStep: "Orders",
  // 借火戏的触发（2026-09-20 演出打磨）。Notion：老周靠在土壁边等担架、摸兜找火，
  // 「**看见顺子经过**」才开口 —— 所以这一段不再随 ordersReached 自动开播，
  // 要玩家真的走到他跟前、脸朝着他。
  borrowTriggerM: 3.2,
  // 「大致面向他」：视线与「玩家→老周」的夹角在这个弧度以内（±40°）。
  borrowFacingRad: 0.7,
  // 对白期间抬老周那两个担架员等在这么远外，不挤进两人中间。
  borrowClearRadiusM: 4,
  // 担架员从等待位走上来那一段的时长（ZhouLift 催的时候起步）。
  bearerCloseMoveS: 2.2,
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
  // 06 老周坐在土壁边的那副活人身体（有脸、会说话）换回担架上的烘焙躺姿：玩家闭一下眼盖住这一下替换。
  // 合眼 / 全黑停留 / 睁眼，秒。[需] 集成负责人 2026-09-24 第 9 条（NotifyCameraCut 或淡入淡出盖住切换）；
  // 数值按一次正常眨眼放慢到读得出「顺子眨了下眼」的量级（眨眼 0.1–0.4 s）。
  zhouSeatSwapCloseS: 0.22,
  zhouSeatSwapHoldS: 0.12,
  zhouSeatSwapOpenS: 0.3,
  // 他坐的那只弹药箱（宽 × 高 × 深，米）。Actor 的 sit 是凳面坐姿：胯落到「大腿长 + 0.045 身高」≈ 0.5 m，
  // 箱面比它低 5 cm 让胯坐实。[几] 木制子弹箱量级。
  zhouSeatBoxM: Object.freeze([0.56, 0.44, 0.36]),

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
  trappedFovDeg: "CAMERA.baseFovDeg 55 收一档；8.5 m 处站着的人在 720p 里约 150 px 高",
  borrowTriggerM: "Notion 06「看见顺子经过」；R.contactRadiusM 同量级的搭话距离",
  borrowClearRadiusM: "两人对话的取景余量：担架员退到画面外",
  bunkerButtStrikeS: "Data_MeleeCombat 的近战 windup 同量级",
  bunkerRearDigIntervalS: "一记 debrisFall 的间隔，按旁边有人在扒土的频率",
  rescueGatherMaxS: "bunkerRescueSeconds（4.4 s）之前两个人要到位",
  bundleProneRangeM: "Data_Tuning_AiShooting 的 CLOSE_RANGE 同一档",
  bundleCoveredThrowRangeM: "19.6 m/s² 世界重力与 GrenadeBundle 13 m/s 满蓄力弹道",
  machineGunDriverHealHealth: "WOUNDS.bandageRegenCap 80 以下留两点受击余量",
  southMarchSpeedMps: "Notion 采用稿 07 的配速要求（2.2–2.6 m/s）",
  southTargetSecondsMin: "契约 §2：07 目标时长 45–75 秒",
  zhouLiftMoveS: "litterSpeedMps（1.4 m/s）量级",
});

// Notion 2026-09-22 front whitebox calibration: proximity is physical, all deaths are observed.
// assaultIds (03 withdrawal window, "指定进攻组击杀阈值"): the six bounders FrontRifleA-F, threshold 3 -
// the 2026-09-23 space rebuild makes the bounding group the attack wave: Zhou's left gun enfilades its west
// half, the captured nest its east half. The fire base (FrontGunner...) holds 43 m north and never rushes, so
// it is not part of the wave (Space package 03->06 cold starts, docs/Data_FirstLevelSpace0106_20260923.md §10.3).
export const FRONT_BATTLE_TUNING=Object.freeze({
  arrivalM:1.0,leaderLeadM:3,captureRadiusM:4,rearArrivalM:3.5,attackArrivalM:3,
  firstBatch:2,assaultKills:3,assaultIds:["FrontRifleA","FrontRifleB","FrontRifleC","FrontRifleD","FrontRifleE","FrontRifleF"],
  guardHeightM:1.2,blockadeRangeM:85,gatherSpacingM:1.35,zhouHealth:80,
  // Zhou's age on the crosshair card (both bodies: 03-05 at the gun, 06 seated). The random identity pool gave him
  // 17 / 29 / 32 across runs ("老周 17 岁"); the cast note says 三十多岁 (Data_FirstLevelMissionDialogue MISSION_VOICE_CAST.zhou).
  zhouAge:34,
  // Waiting guards kneel (1), they are not forced prone (2): prone they show 0.3 m above the scrape and the K3
  // observation step cannot read them; kneeling they show 0.75-1.0 m (Space FrontTopologyTest K3, docs §10.2).
  guardWaitStance:1,
  // ---- 03-06 pacing (contract §2.6, 2026-09-24 Front package step 2) ----
  // 03 ends when He has the left gun and Zhou is this far off it (was: Zhou back at the collection, ~100 s of waiting).
  zhouLeftGunM:10,
  // 05/03 crossing: the next guard leaves cover once the man ahead is this far past the gap point (the gap sap
  // behind it is 0.5 m deep for ~5 m, then the full trench: GuardWithdrawal -> gap junction).
  gapClearM:6,
  // Zhou lets go of the gun only once He stands this close to the seat (the gun is never left empty).
  handoverReadyM:3,
  // FrontBlockade (Zhou/Luo shouting across) fires when the player is this close to the observation spur mouth or the fold (K3).
  observationCallM:6,
  // FrontApproach ("贴这道墙！前头有人！") fires 5 m around this FRONT_SORTIE.approach point: (13,-144.2) in the right
  // low trench, 13 m short of the nest's west door (the old index 3 now sits at the observation step).
  frontApproachCallIndex:10,
  // 05->06: at the safe zone (FRONT_SPACE.returnMeet) Luo waits for FrontRelief at most this long before going on.
  returnMeetMaxWaitS:20,
  // Posts on the support sap floor around returnMeet (probed: 2.0 m deep, >= 1.25 m from the sap wall). The relief
  // NCO receives the batch there; He comes down from the left gun to it; Liu holds the sap mouth there from 03 on
  // ("文财，看住沟口！") - his old post (-18,-123) was on open ground beside the sap.
  reliefLeadPost:Object.freeze({x:-21.2,z:-126}),
  heMeetPost:Object.freeze({x:-24.8,z:-125.6}),
  liuMeetPost:Object.freeze({x:-19.5,z:-129}),
  // The relief gunner stops this far short of the left gun's seat (back along FRONT_SORTIE.leftRoute's last leg) and
  // steps in only after He has left it. Walking onto the occupied seat, the two bodies pushed each other 1.4 m apart
  // and neither came within arrivalM (1.0): reliefInPosition never fired and 05 hung before Orders (09-24 Step 3
  // chain Q, Ideal2, relief walk 7/8 at t 370-600 s).
  reliefGunStandbyM:2,
  // ---- stall fallbacks (2026-09-24 Front package review: two cold starts hung on one unreachable waypoint) ----
  // FrontBattle.Walk: a walker who has not come walkStallProgressM closer to his current point for walkStallS
  // (and is not waiting for the player) skips an intermediate point, or counts a final point reached within
  // arrivalM x walkStallArrivalScale. Seen: Luo held 200 s beside the captured gun's seat (the gun block between
  // him and rearRoute[0], rightRearReached never came), the relief gunner held 70 s on the leftRoute leg.
  // 6 s is about three times the longest grenade evade and crowd shove seen in the 03-06 drives.
  walkStallS:6,walkStallProgressM:.3,walkStallArrivalScale:2,
  // 04: the player has held the rear junction this long out of the tank's sight and Luo is still not there ->
  // rightRearReached anyway (Luo walks on behind him). Two stall skips plus the 5 m walk from his cover.
  rearLeaderGraceS:15,
  // 03-05: no hand grenade is thrown at a point this close to a protected waiting guard (missionUntargetable,
  // contract §2.9): Grenade radiusM 6.5 (Data_Weapons) + ~3.5 m of throw scatter and roll. 09-24 review: one
  // Japanese grenade killed three of the gathered second batch, the next one two more -> guardBatchLost.
  guardGrenadeShieldM:10,
  // 03 preview / 04 before the pressure the guide points at the tank (brief item 5), but beside it on the ground:
  // guideTankLeadM toward the player and guideTankSideM to the player's right of it. On the tank itself the diamond
  // and its distance label (1.15 m above the ground, Script_FirstLevelLeaderGuide) sat right on the ~11 px turret
  // 56 m out (09-24 review, TankProbe Scene_TankPreview); moved only toward the player (10 m) it still projected onto
  // the turret (09-25 retake). 6 m to the side at 50 m is ~80 px on a 1280 px frame.
  guideTankLeadM:4,guideTankSideM:6,
  // After rightNestCaptured an assault man's close-contact circle (his line, tacticalRadiusM) is cut so it stays this far
  // from the captured gun's seat (FRONT_SORTIE.seat): brief item 11 ④, and 09-25 idle-probe drives where bound man F and
  // the flank group came up to the nest's north wall in contact and shot the player on the gun from 1-4 m, twice in a row.
  capturedGunKeepOutM:6,
  // ---- 03-06 lines: the speaker is in the picture when he talks (2026-09-25 relay r2 Front step 1) ----
  // Script_FirstLevelFrontScenes.HoldLine: a line whose speaker stands within speakerViewNearM of the player but is not
  // in the picture waits up to speakerViewHoldS while he steps into view (StepSpot), then plays anyway - only when he
  // can step (the player stands and does not aim, a clear spot exists); otherwise it plays at once from where he is.
  // Never turns the player's camera. Measured 09-25 (03->06 drive, 48 lines): every near line that missed the picture had its speaker
  // 0.7-2.8 m from the player (beside or behind him); every far one was a shout across the front from 32-76 m (left
  // gun, the pinned guards, the trench mouth). 15 m splits the two with room on both sides.
  speakerViewNearM:15,
  // How long a line may wait for its speaker (s): the longest step (speakerStepMaxM at speakerStepSpeedMps) is 1.1 s,
  // plus about 0.5 s to start and stop. Chosen by this package, not tuned by feel yet; a longer wait makes an order late.
  speakerViewHoldS:1.6,
  // "In the picture" for the hold: the head projects inside this share of the frame (NDC), not just onto its edge.
  // The acceptance sample (CheckFrontActing) counts 0.95; the hold asks for more so the head is not cut by the border.
  speakerViewNdc:.8,
  // ... and at least this far from the eye (m): nearer, the first-person camera sits in his shoulder and clips him.
  speakerViewMinM:1.2,
  // StepSpot: where the speaker may step to be seen - on the player's floor (|dy| <= speakerStepDyM) at one of these
  // distances (m) and bearings off the view axis (deg, both sides; 0 would put him across the player's aim), no
  // farther than speakerStepMaxM from where he stands, reached on a straight walk nothing blocks. 2.2-3.4 m frames a
  // standing man's head and shoulders at the game's 55 deg vertical field of view (Data_Tuning_Main baseFovDeg,
  // about 90 deg across at 16:9); 16-30 deg keeps him clear of the sights.
  speakerStepDistancesM:Object.freeze([2.6,3.4,2.2]),speakerStepBearingsDeg:Object.freeze([22,16,30]),
  speakerStepMaxM:5,speakerStepDyM:.45,
  // Stepping in is a quick shuffle, not a march: R.squadCatchupMps (4.5, the 07 catch-up) covers speakerStepMaxM in
  // about the hold.
  speakerStepSpeedMps:4.5,
  // Stepping in is for a player who stands still (horizontal speed <= speakerStepPlayerStillMps: below a crouch walk,
  // above the sway of aiming); the speaker goes back to his own orders once the player has moved speakerStepReleaseM
  // from where he stood when the line was held.
  speakerStepPlayerStillMps:.8,speakerStepReleaseM:2.5,
  // Closest the stepping walk may pass the player (m): the 03-05 staging checks keep Luo 1.5 m clear of the player and
  // of the captured gun's seat (Script_FirstLevelCampaignFrontBattle "Luo occupies his own firing post").
  speakerStepPassM:1.5,
  // BackOff: a line that plays at once (the player walks or aims, or no framed spot) while its speaker stands nearer
  // than speakerViewMinM: he steps back from the player to one of these distances (m), straight away from him or up to
  // these bearings off that line (deg, both sides), at a walk (m/s), and the line is not delayed. 1.7-2.4 m is outside
  // speakerViewMinM with room for the player's own step; the walk is about the NPC walk pace (Data_Tuning_FirstLevel MISSION_TUNING.walkSpeedMps 1.7).
  // 09-25 03->06 drive: Luo tailing the player at 0.7 m (FrontBlockade.02, FrontApproach.01, BundleSupply.02,
  // Volunteer.02) and the relief NCO at 1.0 m (FrontRelief.02) talked from inside the camera.
  // Not to a spot within speakerBackOffAheadDeg of where a walking player is heading (he would walk into it again: Luo
  // backed into the ammo house ahead of the player going in and stayed 0.7 m from him, 09-25 drive).
  speakerBackOffDistancesM:Object.freeze([2,1.7,2.4]),speakerBackOffBearingsDeg:Object.freeze([0,30,60,90]),speakerBackOffSpeedMps:1.8,
  speakerBackOffAheadDeg:50,
  // ClearView: a squadmate (speakerAsideCast) whose body stands between the player's eye and a talking speaker's head
  // (a speakerAsideBodyRadiusM column from 0.2 m over his feet to his head top: the line gate's test) steps aside,
  // square to that line of sight, to one of these offsets (m) on his own side first, never nearer the player than
  // speakerAsidePlayerM, then holds there until the line ends. 09-25 03->06 drives: Luo's 06 order to Yaowa
  // (Volunteer.05) was said behind Yaowa's back in 2 of 7 drives (245 of 268 frames hidden by her).
  speakerAsideCast:Object.freeze(["yaowa","heyoutian","liuwencai","luo"]),speakerAsideOffsetsM:Object.freeze([1.0,1.4,1.8]),
  speakerAsideBodyRadiusM:.28,speakerAsidePlayerM:1.0,
  bandage:{radius:.087,height:.2,y:-.19,color:0xb6ac8b},
});
