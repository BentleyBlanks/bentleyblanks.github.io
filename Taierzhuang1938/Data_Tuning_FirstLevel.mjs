// Opening sensory reconstruction, 2026-09-12. COD's published concussion/flash
// and tinnitus separation informs the layered response; these are our authored
// values, not claimed COD engine parameters. See docs/Data_OpeningShellshock.md.
export const OPENING_PERCEPTION = Object.freeze({
  onsetS:.3,
  intensity:[[0,0],[.15,0],[.3,1],[2.8,1],[4.1,.72],[6.5,.42],[10.5,0]],
  focus:[[0,0],[.15,0],[.3,1],[2.8,1],[3.4,.58],[3.85,.72],[4.8,.36],[6.5,.14],[8.5,0]],
  // Finite, irregular settling poses (radians), with no periodic horizon roll.
  pitch:[[0,0],[.3,.014],[1.1,-.008],[2.8,.011],[4.2,-.005],[6.1,.002],[8.5,0]],
  roll:[[0,0],[.3,-.018],[1.4,.008],[3.1,-.01],[4.9,.004],[6.8,-.001],[8.5,0]],
  blurPx:5.5, ghostPx:5, ghostMix:.13, desaturation:.32, vignette:.24,
  referenceHeight:900,
  lidFeather:.065, lidCurve:.18, lidTilt:.012, lidUpperShare:.64,
});

// First-level whitebox pacing and handling. Notion 2026-09-07: calm walk 1–2 min, transfer 2–4 min, dive 2 s, death 8–12 s.
export const MISSION_TUNING = Object.freeze({
  // Local casualty reactions must not interrupt mission dialogue or pile up.
  casualtyWitnessM:18,
  casualtyReactionGapS:12,
  casualtyReactionS:3,
  // User 2026-09-11: double post-impact sensory recovery, without slowing the roll or rescue.
  openingRecoveryScale:2,
  intrusionTacticalRadiusM:10,
  infantryTacticalRadiusM:14,
  friendlyTacticalRadiusM:5,
  assaultContactRangeM:14,
  // Route followers stop to fight a visible local threat, then resume the saved route.
  // Only immediate contact interrupts the escape. Distant covering fire must
  // not make the escort halt on the exposed apron instead of reaching the trench.
  contactRangeM:12,
  contactHoldS:2.5,
  contactMaxHoldS:3.5,
  contactResumeS:4.5,
  contactRadiusM:.5,
  contactCoverSlackM:.9,
  // User 2026-09-16: 敌人一出现，队友该先就地找掩体节节抗击，而不是顺着任务路线往前走。
  // 上面那组「12 m / 停 3.5 s 就走」只留给开场冲过开阔地、进沟到遮蔽点集合、村口到屋内伏击（contactEscapeStages：遮蔽点对白要全班到位才触发；伏击开拍前三人要在灶屋埋伏位、幺娃要跟着担架，开拍后全班要站在屋里）；
  // 其余阶段走交战规则：看见（或刚看见过）50 m 内的敌人就停下，10 m 内找掩体还击；
  // 身边的弟兄已经在打、他也知道敌人在哪，就一起停。要继续前进时一次最多两人跃进一段、
  // 其余人原地掩护（跃进前至少在接敌点打满 contactBoundAfterS），不再整队沿路线走。
  contactEscapeStages:["Trapped","BunkerRescue","RearTrench","Village","Melee"],
  contactEngageRangeM:50,
  contactMemoryS:6,
  contactSquadShareM:18,
  contactEngageCoverSlackM:10,
  contactBoundAfterS:6,
  contactBoundM:7,
  contactBoundMaxS:4.5,
  contactBoundStaggerS:1.2,
  contactBoundersMax:2,
  // Incoming fire overrides the short contact/resume timer. Shelter is local,
  // physically reachable and no higher than the protected trench floor.
  companionDangerSuppression:.18,
  companionHideSuppression:.5,
  // Heavy fire commits to shelter; a lower release threshold prevents flicker.
  // A brief lull permits deliberate return fire even at the narrative HP floor.
  companionReturnFireSuppression:.3,
  companionShelterHoldS:2.2,
  companionDangerHoldS:4,
  companionCoverSlackM:6,
  companionCoverMaxRiseM:.4,
  companionProneSuppression:.65,
  companionWoundedHealth:40,
  companionGrenadeMarginM:1.5,
  companionGrenadeSpeedMps:4.5,
  companionGrenadeDirections:8,
  companionGrenadeFractions:[1,.5,.25,.125,.0625],
  companionGrenadeReplanS:.25,
  openingContactStages:["BunkerRescue","RearTrench","Support","MachineGun","Tank","Orders","Village","Melee","Courtyard","TransferApproach","Transfer","Regroup","WallPath","ReceptionGate","BridgeOrders","BridgeCover","BridgeWithdraw"],
  // 03/04 老周指「右边破墙」（FrontBlockade）的时机。看见被压住的守军半秒就说；
  // 一直没看见的，到第 10 秒也说一次。2026.09.19 起这一段只剩这一条 cue，
  // 原来配「提醒」那一档（frontDialogueReminderS）随之下线。
  frontDialogueFallbackS: 10,
  frontDialogueSeenS: .5,
  transferApproachSeconds: 45,
  transferSeconds: 150,
  vehicleLoadSeconds: 16,
  cartApproachSpeedMps: 1.6,
  boltedTeamSpeedMps: 5,
  tankDust: {kind:"dust",rate:4,radius:.8,rise:.3,sizeStart:.12,sizeEnd:.9,life:1.6,opacity:.16},
  cartClearanceM: 8,
  triageSeconds: 2.5,
  bearerApproachMps: 2.2,
  bearerReachM: 0.05,
  // User 2026-09-09: one squad escorts at most ten litters, with two bearers per litter.
  // Only four unarmed support people remain for triage and casualty replacement.
  // User 2026-09-16: cut three more litter teams (10 → 7) and drop every uniformed escort
  // other than the squad — the two medics walking beside the column go; the two rescue
  // civilians stay (they are the bearer replacements, and they are not soldiers).
  // Death-stage care and final-defence medic checks already fall back to the squad / vacuous truth.
  litterCount: 7,
  walkingWoundedCount: 0,
  medicCount: 0,
  civilianCount: 2,
  litterSpeedMps: 1.4,
  // 少一个抬架员又没有替补时，剩下那个人拖着担架走的步速比例（见 Column.BearerShort）。
  litterDragScale: 0.55,
  litterBearerOffsetM: 1.28,
  walkSpeedMps: 1.7,
  squadSpeedMps: 3.05,
  diveSeconds: 2,
  // 17 老周牺牲那一段的接管时长。旧的 8–12 s 是采用稿之前的短版；现在 ZhouDeath
  // 是七句 + 第一句之后那段「……」，强制对齐量出来 13.52 s
  //（Data_FirstLevelMissionVoiceAlignment.ZhouDeath 末句结束时刻），留半秒收尾。
  deathSeconds: 14,
  deathLookSeconds: .65,
  deathLookHeightM: .44,
  // Commit the finite front force at the last approach bend, not while the
  // player is still crossing the long communication trench behind the line.
  frontEngageDistanceM:26,
  frontRifleDefenseSeconds:40,
  // 04 机枪点位的关中过场《空地上的三个人》（CS_MachineGunCaptives）的触发半径：
  // 进了 04 阶段、人在机枪座 (0,-127.4) 这么近就播一次。原来是 4 m（站到枪位上才算），
  // 可 04 的机枪是可选的 —— 拿步枪守前沿的人根本不往枪上走，过场就整段没了。
  // 12 m 盖住整条前沿：03 要求走到前沿点 (0,-124) 9 m 内，离枪座最远约 12.4 m。
  captivesCutsceneRadiusM:12,
  frontAccuracyScale:.28,
  frontFireIntervalScale:.95,
  defenderAccuracyScale:.3,
  defenderFireIntervalScale:1.05,
  tankRevealDistanceM:70,
  // Bounding assault (2026-09-08): rush between FRONT_ASSAULT lines, kneel and fire at each, pinned men go prone
  // and crawl back a bound after assaultPinnedS; at the last line a man holds assaultFinalHoldS then falls back to
  // assaultRegroupLine and comes again (assaultRegroupCycles times) so the field is never static.
  assaultRushMps:3.4,
  assaultHoldS:3.5,
  // 2026-09-09 (docs/Data_EnemyAi.md §15): the last line was an eleven second stand - live capture showed
  // 21 of the 31 men in the 46-74 m band sitting in assault "hold" and 23 of them not moving at all over
  // four seconds. It is now a volley/hold rhythm: fire assaultVolleyShots rounds or hold
  // assaultFinalHoldS seconds and that round is over. 4.5 s is one bolt-rifle volley plus the walk.
  // 2026-09-23: the end of a round no longer slides him 3-6 m along the line - `FrontLateralBound` and
  // its assaultLateralMinM / assaultLateralMaxM are deleted. Displacement has exactly one owner now, the
  // combat brain (hide/peek cover cycle plus WATCH.displace* in Data_Tuning_Ai); the script only counts.
  assaultFinalHoldS:4.5,
  assaultVolleyShots:4,
  // 到线之后走进掩体的那一趟不算守线时间（`UpdateAssault`）：一条线只给这一趟，封顶到这里。
  // 上限按大脑自己的接近速度算：走的最远是 defendHoldRadiusM + assaultCoverSearchM = 11 m，
  // 速度是 Data_Tuning_Ai.BRAIN.coverApproachMps = 2.4 m/s，11 / 2.4 ≈ 4.6 s，取 5 s。
  // 不封顶的后果实测过：反复改选掩体的人一轮也打不完、永远不退回 assaultRegroupLine，
  // 前沿就一直压在撤退口上，03–06 的 lastGuardsWithdrawn 等不到（2026-09-23 A/B）。
  assaultCoverWalkS:5,
  // A round on a line lasts until he has fired from it (an ambient shot counts), but at most assaultSilentHoldS
  // longer than the hold above: a man with nothing to shoot from there still moves on. 4 s is one cover cycle
  // (hide 0.9-2.2 s + peek) and the aim-in. 09-25 relay r2 Front step 3 idle probes: in 04 the bound groups ran line
  // to line 40-60 m in 30 s and never fired (UpdateAssault).
  assaultSilentHoldS:4,
  // How many rounds a man plays out on the last line before falling back to assaultRegroupLine and coming
  // again. One round = assaultVolleyShots rounds fired or assaultFinalHoldS seconds held (the old name is
  // kept because it is the same beat count that used to pace the lateral bounds).
  assaultLateralShifts:2,
  assaultRegroupLine:1,
  assaultRegroupCycles:3,
  assaultArrivalM:.9,
  // 冲刺段卡死（2026-09-24，docs/Data_EnemyAi.md §20.7）：MoveActor 是直线目标 + 锁走廊（不绕），
  // 线点被墙 / 胸墙 / 别人挡住时人会站着原地跑到天荒地老 —— 01→06 探针里中路一人以站姿在 ADVANCE
  // 里停了 88 s。assaultRushStallS 秒内离这条线没近 assaultRushProgressM，就在原地转守（Defend），
  // 这条线算到了；下一轮照常由 AssaultRoundEnd 决定进退。
  assaultRushStallS:4,
  assaultRushProgressM:.5,
  assaultPinnedS:7,
  // Enemy AI integration (2026-09-08, docs/Data_EnemyAi.md §6). Defend() no longer means "pinned to a point with no
  // cover": it is an anchor plus a radius. The soldier may take any cover whose hide position falls inside
  // holdZone.radius + defendCoverSlackM, then run the hide/peek cycle there; he still never chases, flanks or bounds
  // out of the zone (scriptDefensive keeps blocking every manoeuvre task).
  defendHoldRadiusM:2,
  defendCoverSlackM:6,
  // Emplaced machine gunners (spec.hold) keep their firing position: only the side step of a peek is allowed,
  // never a relocation. 0.9 m covers COVER.sideStepM (0.55) plus the standoff jitter.
  defendHoldFixedSlackM:.9,
  // After a bound the man looks for cover this far from the line before settling for a kneeling position in the open.
  assaultCoverSearchM:9,
  // Japanese infantry carried two Type 91/97 fragmentation grenades apiece (the Type 91 doubled as the grenade
  // discharger round, so a squad's stock was pooled with the launcher man). Two per rifleman is the conservative
  // reading and it is also what the pacing wants: a man who has thrown twice is out, so grenades stay an event.
  enemyGrenades:2,
  // 2026.09.19 重构后的开场/前沿名单：掩蔽部门外 4 ＋ 十二人接近屏 ＋ 十二人前沿 ＋
  // 十二人冲机枪位 ＋ 四名战车护卫 = 44。每一份名单只投一次、不复活、不补波。
  // （旧口径 67 里的 12 名车站地面 + 4 名进沟 + 5 名追到掩蔽处随军列开场一起下线。）
  // 2026-09-23 01–06 space rebuild: bunkerAssault 4 + front 10 (fire base 4, bounding 6) + machineGun 4 +
  // approach 4 + tank escorts 4 = 26. The other 01–05 groups (backdrop, pursuit, flank, officer, reserve,
  // cut-in) are counted against contract §6 (<= 55 cumulative, <= 30 alive) in Script_FirstLevelFrontTopologyTest.
  openingEnemyBudget:26,
  // approachFireSector（开火扇区）2026-09-23 删掉：从来没有人把它写进 scriptFireSector（docs/Data_EnemyAi.md §20）。
  approachAccuracyScale:.35,
  approachTacticalRadiusM:24,
  approachContactM:18,
  approachContactRadiusM:6,
  approachAdvanceMps:2.8,
  approachBoundHoldS:2.8,
  // 右侧阵位的三名步枪守卫（2026-09-23，docs/Data_EnemyAi.md §20）：不再是 hold 炮塔。局部战区 6–8 m
  // 里找掩体、换位；玩家贴进 7 m（TACTICS.chargeContactM）就自发冲锋；每人一枚手榴弹 —— 右侧阵位
  // 就三个人守，一人两枚会让 03 夺点变成吃弹比赛。固定机枪手仍 hold（离了枪那挺枪就哑了）。
  nestGuardTacticalRadiusM:7,
  nestGuardGrenades:1,
  // 阵位守卫伤亡 2 人后退到后撤锚点时的掩体余量（米）：普通守区的 defendCoverSlackM（6 m）会让退下来的人
  // 挑到枪位旁边的掩体（09-24 实测离枪 1.5 m，玩家上枪被贴身刺刀）；退就是退，只在锚点身边找遮挡。
  // 还得留在看得见、打得着的地方 —— 03 的 rightNestCaptured 要三名守卫都死（FrontBattle.UpdateCapture）。
  nestFallbackCoverSlackM:1,
  frontReserveCount:0,
  frontReserveReleaseGapS:9,
  frontReservePlatoonSize:22,
  frontReserveAccuracyScale:.16,
  frontReserveAdvanceM:14,
  frontCrowdCellM:.045,
  guardPairSize:2,
  guardCrossingGapS:2,
  guardSafeRouteIndex:5,
  // Finite casualty replacements count successful spawns and include queued men in the live cap.
  waveFirstDelayS:18,
  waveIntervalS:26,
  waveSquadSize:6,
  waveBudget:0,
  waveAliveCap:32,
  // Warm rigs behind the loading screen, then place a few per frame.
  spawnPerFrame:4,
  tankSpeedMps: 1.55,
  tankAdvanceSeconds: 11,
  tankFiringHaltSeconds: 5,
  bundleSupplyCount: 2,
  // September 15 stability fix: the northern depot supports the return leg's
  // wound budget. Actual pickup caps dressings.
  bundleSupplyBandages: 3,
  // Linear checkpoint campaigns such as Call of Duty restore the player to a
  // viable combat state instead of replaying an exposed autosave with the same
  // near-fatal wound. Player.Spawn currently restores 100 health; this floor
  // preserves that stronger result and one dressing while keeping the authored
  // position and battle state.
  checkpointRetryHealthMin:65,
  checkpointRetryBandagesMin:1,
  // An autosave below this line waits while a live enemy has direct sight. The
  // previous safe point remains valid; once sight is broken, the same caller can
  // replace it normally.
  checkpointUnsafeSaveHealth:45,
  tankStopZ: -146,
  tankShellIntervalS: 13,
  tankShellScatterM: 2.6,
  tankCannonMinRangeM:12,
  tankFirstFireZ:-153,
  tankNestAimOffsetZ:-1,
  tankNestAimRiseM:.3,
  tankShellSpeedMps:180,
  tankMgDownRad:.18,
  tankMgUpRad:.25,
  tankHullTurnRad: .45,
  tankHullMgArcRad: .45,
  tankMachineGunIntervalS: .14,
  tankMgBurstSeconds:1.2,
  tankMgRestSeconds:2.3,
  tankMgSpreadM:1.15,
  tankMgDamageScale:.65,
  tankMgAcquireS:1.2,
  tankMgTrackingS:.8,
  tankMgSweepM:2.7,
  tankTargetMemoryS:7,
  tankTurretSpeedRad:.75,
  tankPursuitBounds:{minX:28,maxX:43},
  tankTrackRadiusM: 5,
  tankTrackMinDamage: 35,
  // Blender-authored mobility kill: engine smoke, no secondary ammunition blast.
  tankDamage: {smokeDelayS:.32,debrisClearanceM:.04,engineOutlet:[0,1.56,.64],
    smoke:{kind:"black",rate:7,radius:.18,rise:1.05,sizeStart:.22,sizeEnd:1.5,
      life:4.8,opacity:.48,turbulence:.32,fire:0}},
  threatSuppression: 0.5,
  passageRangeM: 36,
  interactionRangeM: 2.5,
  litterSpacingM: 3.4,
  queueSpacingM: 3.4,
  walkerSpacingM: 1.6,
  cartCapacity: 2,
  zhouQueueIndex: 5,
  cartSpeedMps: 3.2,
  loadingReachM: 0.2,
  boardingWitnessM: 2,
  rescueSeconds: 4,
  rescueReachM: 3,
  guardCount: 8,
  guardSpeedMps: 2.7,
  finalEvacSpeedMps: 1.5,
  finalHandoffRouteIndex:5,
  // 走到这个半径里就算「进了内院」（innerCourtReached），伏击紧跟着起。
  // 旧的近战教学（MeleeTutor）那四条数值随 2026-09-15 的屋内伏击一起删掉了。
  meleeTriggerRadiusM: 2.7,
  // 到这个距离就算够得着了；与共用 MELEE_RULES.bindReachM 同一个数。
  ambushBindReachM: 1.15,
  squadWatchStages: ["Courtyard","Transfer","Regroup","ReceptionGate","BridgeCover"],
  squadWatchRadiusM: .85,
  squadWatchSpeedMps: .9,
  squadWatchArrivalM: .3,
  squadWatchPauseS: 7,
  squadWatchTimeoutS: 3,
  squadPostLateralM:1.15,
  squadPostRearM:1.4,
  columnCornerM: .55,
  crowdRestSeconds:1.8,
  crowdDepartureGapS:3.1,
  crowdDepartureLimit:3,
  crowdTransferApproachLimit:3,
  crowdWalkerDepartureGapS:.65,
  crowdWatchYawRad:.18,
  crowdTurnSpeedRad:.38,
  crowdWalkerRoamM:.45,
  crowdWalkerRoamMps:.55,
  crowdWalkerPauseS:7.5,
  crowdWalkerClearanceM:1.08,
  crowdWalkerReservationM:1.15,
  crowdLitterClearanceM:1.9,
  squadSpacingM: 1.8,
  squadRouteCornerM: 2.4,
  squadRouteSampleM: 2,
  squadRouteCornerFraction: .3,
  squadRouteCornerSamples: 4,
  squadRouteExitBlendM: 3,
  squadLaneClearanceM: .85,
  squadRouteLanesM: [-0.62, 0.6, -0.3, 0.32],
  squadStrideScales: [1, 0.94, 1.06, 0.97],
  squadTurnSpeedFloor: 0.62,
  squadSpeedBlendS: 0.35,
  squadGapEaseM: 1.2,
  squadCatchupDistanceM: 18,
  squadWaitDistanceM:26,
  squadCatchupMps: 4.5,
  reliefDelaySeconds: 1.6,
  reliefSpeedMps: 2.8,
  tacticalMoveMps: 1.85,
  tacticalHoldSeconds: 4.5,
  tacticalSuppression: 0.55,
  tacticalArrivalM: 0.9,
  guideLookaheadM: 12,
  guideHideDistanceM: 3,
  interactionSeconds: 0.55,
  // Extra opening contacts consume roughly forty more rifle rounds before the rear ward.
  frontSupplyClips:12,
  supplyCooldownS: 15,
  limitedLookRadians: 0.28,
  diveTravelM: 3.8,
  medicApproachMps: 2.5,
  rescuerApproachMps: 2.6,
  rescuerLateralM: 1.1,
  rescuerArrivalM: .7,
  airPassSeconds: 8,
  secondAirLeadS: 4.58,
  bridgeBombAtS: 3,
  cartBombAtS: 3.3,
  zhouStrafeAtS: 2.6,
  // Air passes (2026-09-16): the Ki-30 flies at a low-level attack speed instead of 25 m/s (below its stall speed).
  // Event times above stay put; each pass is anchored so the aircraft is where the old path had it at that moment:
  // first pass at bridgeBombAtS over airFirstAnchorZ, second pass at zhouStrafeAtS over airSecondAnchorZ.
  airSpeedMps: 60,
  // The first pass enters this early (≈290 m out) so it does not pop in 140 m from the player; events keep their times.
  firstAirLeadS: 2.5,
  airFirstAnchorZ: 140,
  airSecondAnchorZ: 130,
  // Gun impacts run airStrafeLeadM ahead of the aircraft (30 m up / 45 m ≈ 34° dive) and only inside this road band.
  airStrafeLeadM: 45,
  airStrafeFromZ: 80,
  airStrafeToZ: 160,
  airShotIntervalS: 0.1,
  // Pull up once the aircraft is airPullUpAfterM past its anchor.
  airPullUpAfterM: 30,
  airPullUpRad: 0.14,
  // The recorded dive pass peaks 3.5 s in; start it that long before the anchor.
  airDiveSoundLeadS: 3.5,

  // =========================================================================
  // 2026.09.19 重构（docs/Data_FirstLevelRebuild20260919Contract.md）。
  // 出处：Notion 采用稿的「通过条件」与既有同类数值；没有实拍以前一律取同族的既有值，
  // 不新造手感（第二波 Front/Mid/End 玩法包再按实拍调）。
  // =========================================================================
  // —— 01 受困。黑屏对白 BunkerBanter 的末句被近爆打断；没有音频时按这个兜底期限炸。
  // 6 句短对白，按 MissionVoiceTimeline 的 1.1 s/句下限约 7 s，取 8 留一点余量。
  bunkerBanterFallbackS: 8,
  // 被压住之后能转头的幅度。limitedLookRadians(0.28) 是「受控镜头」的通用夹取；
  // 压在木架下只能「小幅转头」，取它的一半。
  trappedLookRadians: 0.14,
  // 受困段验收/驾驶预算：炸 → 看清门外 → 两名川军被刺杀 → 日兵转向门内。
  // 四条真实录音串行约 37 s 才到 doorSearchStarted；48 s 留足走位与低帧余量。
  // 控制权本身只随 Trapped → BunkerRescue 的真实阶段交接释放，不再由这个预算提前还权。
  trappedMaxS: 48,
  bunkerKillingAtS: 4.6,
  bunkerSearchAtS: 8,
  // 行刑那一拍两名川军的血量与倒下时刻（相对 bunkerKillingAtS）。
  bunkerCaptiveHealth: 20,
  bunkerCaptiveStabGapS: 1.4,
  // 掩蔽部门外破口能看清的距离（契约 §3：8–12 m）。
  bunkerSightM: 12,
  // 剧情台词压环境声的深度（storyDuck）。0.68 这个数来自旧军列开场逃出车厢那一段
  // （Data_FirstLevelCarriageSound.escapeSpeechBedGain）：环境压到 68%，人声出得来，
  // 外头的动静还在。军列开场下线之后这个数留在这里，播放器不再依赖车厢声音表。
  storyVoiceBedGain: 0.68,
  // —— 02 获救。罗班长掀木架＋幺娃拉背包那一段（沿用开场救人的 LuoHelpUp 时长）。
  bunkerRescueSeconds: 4.4,
  // —— 05/06 战车压口与接防。战车推到 tankStopZ 这么近就算堵住退路。
  tankBlockRadiusM: 6,
  // —— 12 转运。第一处威胁解除后第二处最早出现的间隔（沿用旧四拍的 restS 12 s）。
  transferThreatGapS: 12,
  // 每解除一处威胁真实装走的批次数（cartCapacity 2 × 2 车）。
  transferBatchLoads: 2,
  // —— 13 牛车。抬着人的牛车（litterSpeedMps 1.4）比空车慢一档。
  cartRideSpeedMps: 1.2,
  cartRideMaxS: 60,
  // 车真的离开装载位这么远才记 zhouCartDeparted（与 boardingWitnessM 同一把尺）。
  cartDepartedM: 6,
  // —— 18 铁路桥。尾队沿 bridgeCrossing 过桥的人数与步速（走路 walkSpeedMps 1.7 略慢）。
  bridgeColumnCount: 6,
  bridgeColumnSpeedMps: 1.9,
  bridgeColumnSpacingM: 3.4,
  bridgeBlastRadiusM: 12,
  // —— 18 夜行军黑屏字幕（沿用旧南行转场的 1/4/1）。
  nightTransition: Object.freeze({ fadeOutS: 1, holdS: 4, fadeInS: 1 }),
  // 夜景段：淡入点到北门的行军速度（队列小跑不上，按 walkSpeedMps）。
  nightMarchSpeedMps: 1.7,
});

// Aftermath tiers (2026-09-08 frame probe: 87 full bodies inside 30 m cost 0.9 M triangles per pass): full mesh only to
// aftermathTiers[0].exitM, 5 cm clusters to aftermathTiers[1].exitM, 14 cm clusters beyond. Live corpses keep ACTOR_DETAIL.
// 2026-09-09: 试过在中间再插一档 2 cm，交替 A/B 量到 draw call +109 而帧时间不变 —— 一具尸体 7 个材质，
// 每加一档就是 8 姿势 x 7 = 56 只网格。档数在这里是 draw call，不是三角形；账在 Script_FirstLevelMissionAftermath 抬头。
// Tables are recompacted only after the focus moves aftermathRefreshM or the view turns (1-|q·q'| > aftermathRefreshDot).
// Static casualty contact at scene construction: 8 cm lower envelope / 6 cm
// occupied support cells, then a full-mesh clearance pass. No per-frame solver.
export const MISSION_BODY_SUPPORT=Object.freeze({sampleCellM:.08,stackCellM:.06,
  clearanceM:.006,maxTiltRad:.55,angleStepsRad:Object.freeze([.24,.12,.06,.03,.015])});
export const MISSION_PEOPLE_TUNING=Object.freeze({aftermathTiers:Object.freeze([
  Object.freeze({cellM:0,enterM:12,exitM:15}),
  Object.freeze({cellM:.05,enterM:70,exitM:80}),
  Object.freeze({cellM:.14}),
]),aftermathRefreshM:.35,aftermathRefreshDot:.00012,closeAnimationM:8,nearAnimationM:45,farAnimationM:90,nearAnimationS:1/20,idleAnimationS:1/10,midAnimationS:1/15,farAnimationS:1/8,walkThresholdMps:.08,gaitSpeedMps:3.6,carrySourceMps:1.4,loadSinkM:.08,loadLeanRad:.045,breathRate:1.7,watchYawRad:.18});

// 老周身上的血（用户 2026-09-16：「应该是伤痕累累，血迹斑斑」）。担架上的两条画法共用这一张表：
// 带骨架的伤员走 CharacterWounds.Add（沿世界竖直向下投到外层表面），实例化的烘焙姿势直接在烘焙空间摆球。
// 他躺平、脸朝天，所以「正面」就是世界 +Y：
//   from/to/t  锚点 = 两根语义骨（boneRoles 的键）之间的插值；to 为空就是 from 本身
//   liftM      从骨轴往正面抬多少米（烘焙路径的球心就在这里；骨架路径只当投射起点，落点由射线定）
//   part       CharacterWounds 的区域过滤（torso / head / arm / leg），挡在上面的手不会抢走肚子上的血
//              脸上不放：低模脸上一团深色读出来是胡子/脏块，不是伤口（2026-09-16 实拍）
//   radiusM    渗开的半径；ageS 是开局时已经淌了多久（BLOOD_WOUND.drySeconds=48：几十秒偏湿亮，几百秒干成褐黑）
//   stabbed    true 的几处只在屋内伏击那一刀（litter.stabbed）之后才有；骨架版从挨刀那一刻起算年龄（会渗开、慢慢变干），
//              ageS 只给烘焙版用（它不走时间，挨刀后、牺牲后看到的都是半干的）
// 原本是腿伤（Data_FirstLevelMissionDialogue 的 zhou 人设），裤腿泡透、顺小腿往下淌；
// 其余是一路上抬过来的擦伤和别人的血。一个网格 BLOOD_WOUND.slots(12) 个槽，这里 11 处。
export const ZHOU_WOUNDS=Object.freeze([
  Object.freeze({id:"thighR",from:"thighR",to:"calfR",t:.45,liftM:.07,part:"leg",radiusM:.19,ageS:24}),
  Object.freeze({id:"shinR",from:"calfR",to:"footR",t:.3,liftM:.05,part:"leg",radiusM:.11,ageS:70}),
  Object.freeze({id:"kneeL",from:"thighL",to:"calfL",t:.92,liftM:.06,part:"leg",radiusM:.075,ageS:220}),
  Object.freeze({id:"forearmR",from:"forearmR",to:"handR",t:.55,liftM:.04,part:"arm",radiusM:.085,ageS:140}),
  Object.freeze({id:"upperArmL",from:"upperArmL",to:"forearmL",t:.45,liftM:.05,part:"arm",radiusM:.07,ageS:420}),
  Object.freeze({id:"chestL",from:"chest",to:"upperArmL",t:.55,liftM:.1,part:"torso",radiusM:.1,ageS:300}),
  Object.freeze({id:"ribsR",from:"chest",to:"upperArmR",t:.3,liftM:.1,part:"torso",radiusM:.065,ageS:160}),
  Object.freeze({id:"collar",from:"chest",to:"neck",t:.75,liftM:.08,part:"torso",radiusM:.06,ageS:260}),
  Object.freeze({id:"belly",from:"pelvis",to:"chest",t:.5,liftM:.12,part:"torso",radiusM:.2,ageS:36,stabbed:true}),
  Object.freeze({id:"handL",from:"handL",to:null,t:0,liftM:.03,part:"arm",radiusM:.07,ageS:36,stabbed:true}),
  Object.freeze({id:"handR",from:"handR",to:null,t:0,liftM:.03,part:"arm",radiusM:.07,ageS:36,stabbed:true}),
]);

// User 2026-09-14: authored soft return warning, with room for combat detours.
// Values are local design choices, not claimed COD engine constants.
export const MISSION_RETURN = Object.freeze({
  corridorM:36,hysteresisM:7,targetSafeM:22,squadM:78,personM:48,personUrgentM:72,
  urgentM:58,squadUrgentM:105,edgeM:14,edgeUrgentM:6,edgeHysteresisM:3,
  enterDelayS:1.25,stageGraceS:3,
});

// 公开阶段 15–18（End 玩法包）的数值与摆位另立一张表，入口仍是本文件
// （契约 docs/Data_FirstLevelRebuild20260919Contract.md §8）。
export { END_TUNING, END_ROUTES } from "./Data_Tuning_FirstLevelEnd.mjs";
// 第二波 Front 玩法包（公开阶段 1–7）的数值另起一张表，减少三包并行时的同文件冲突。
// 这一行让「数值只有一个入口」的口径保持不变：import Data_Tuning_FirstLevel 就拿得到。
export { FRONT_TUNING, FRONT_TUNING_SOURCES, BUNKER_KILL_BEATS, BORROW_LIGHT_BEATS,
  SouthWalkLengthM, SouthWalkSeconds } from "./Data_Tuning_FirstLevelFront.mjs";
