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
  // Two covering teams: ordinary weapon cadence and a usable rifle cover radius.
  openingSurfaceAccuracyScale:.95,
  openingSurfaceFireIntervalScale:1,
  openingSurfaceRifleRadiusM:3,
  openingSurfaceRifleCoverSlackM:4,
  openingSurfaceGrenades:2,
  // Mobile rifles may search and counterattack inside their assigned area.
  surfaceTacticalRadiusM:12,
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
  openingContactStages:["Unloading","TrenchEntry","Shelter","Support","MachineGun","Tank","Orders","Village","Melee","Courtyard","TransferApproach","Transfer","RetreatFirst","RetreatWall","RetreatYard","Reception","FinalDefense","Exit"],
  // Cruise at 21.6 km/h; the remaining physical approach determines smooth braking after impact.
  // Meal (25.331s including pauses) + overlapping exchange (14.132s),
  // then roughly nine seconds braking from the first ranging impact.
  trainTravelM: 603,
  frontDialogueReminderS: 5,
  frontDialogueFallbackS: 10,
  frontDialogueSeenS: .5,
  trainCruiseSpeedMps: 6,
  trainShellLeadM: 18,
  trainFirstShellFlightS: 1.4,
  unloadStaggerSeconds: 0.8,
  quietSouthSeconds: 75,
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
  deathSeconds: 12,
  deathLookSeconds: .65,
  deathLookHeightM: .44,
  // Commit the finite front force at the last approach bend, not while the
  // player is still crossing the long communication trench behind the line.
  frontEngageDistanceM:26,
  frontRifleDefenseSeconds:40,
  // 04 机枪点位的关中过场《空地上的三个人》（CS_MachineGunCaptives）的触发半径：
  // 玩家第一次走进机枪座 (0,-127.4) 这么近就播一次。4 m 是「已经站在枪位上」而不是
  // 「路过阵地」—— 机枪的交互半径是 3 m（EmplacementInteraction.reachM），
  // 半径比它大一点，玩家还没按 F 就已经看见了，接枪那一下不被打断。
  captivesCutsceneRadiusM:4,
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
  // four seconds. It is now the same volley/hold rhythm as the other bounds: fire assaultVolleyShots
  // rounds or hold assaultFinalHoldS seconds, then slide 3-6 m along the line to a fresh firing position
  // (assaultLateralShifts of them, cover columns avoided by ClearLaneX), and only then fall back to
  // assaultRegroupLine and come again. 4.5 s is one bolt-rifle volley plus the walk.
  assaultFinalHoldS:4.5,
  assaultVolleyShots:4,
  assaultLateralShifts:2,
  assaultLateralMinM:3,
  assaultLateralMaxM:6,
  assaultRegroupLine:1,
  assaultRegroupCycles:3,
  assaultArrivalM:.9,
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
  // User 2026-09-11: sustained multi-direction contact during the approach.
  // Twelve surface + four intruders + eighteen approach + twelve rifle-front +
  // twelve machine-gun attackers + four escorts; each roster commits once, no respawn.
  // User 2026-09-15: + five pursuers who follow the wounded man to the shelter corner.
  openingEnemyBudget:67,
  // Route attackers cover the approach; the separate front force owns the gun line.
  approachFireSector:{minX:-80,maxX:35,minZ:-118,maxZ:-18,selfDefenseM:3},
  approachAccuracyScale:.35,
  approachTacticalRadiusM:24,
  approachContactM:18,
  approachContactRadiusM:6,
  approachAdvanceMps:2.8,
  approachBoundHoldS:2.8,
  frontReserveCount:0,
  frontReserveReleaseGapS:9,
  frontReservePlatoonSize:22,
  frontReserveAccuracyScale:.16,
  frontReserveAdvanceM:14,
  frontCrowdCellM:.045,
  guardPairSize:2,
  guardCrossingGapS:2,
  guardSafeRouteIndex:3,
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
  // wound budget. Actual pickup caps dressings; checkpoint retry grants none.
  bundleSupplyBandages: 3,
  tankStopZ: -123,
  tankShellIntervalS: 13,
  tankShellScatterM: 2.6,
  tankCannonMinRangeM:12,
  tankFirstFireZ:-150,
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
  // —— 屋内伏击（内部步骤 Melee，公开阶段 9）。
  // 用户 2026-09-15：顺子刚进右手那间屋，屋里藏着的日军一刺刀顶上来，连按 F 挣脱；
  // 背景里老周和两个抬担架的挨刀。拍表、每一条的出处与验收见 docs/Data_FirstLevelRoomAmbush.md。
  // 冲上来的速度取跃进冲刺同一档（assaultRushMps 3.4）：屋里三米的距离约 0.9 秒到位。
  ambushLungeMps: 3.4,
  // 这一刀按 kind "qte" 结算（绕开 COMBAT.player.meleeScale），控制锁期间必须真的掉血。
  // 契约的起始建议是 30；实拍下调到 24：挣脱之后屋里是三个上刺刀的，一记轻刺 21、
  // 重刺 46（MELEE_WEAPONS.Bayonet × COMBAT.player.meleeScale 0.42），
  // 从 70 血开打在班里人赶到之前必死。24 让顺子带着 76 血进这一场。
  // 挣脱失败仍然活得下来：24 + 12（共用 standingFailureDamage）+ 18 = 54。
  ambushStabDamage: 24,
  // 顶住但还不给连按的那一段：刺刀已经进去了，两个人摆成僵持姿势，F 这会儿不算数。
  // 这几秒是留给背景的 —— 前抬者(1.5)、幺娃(2.4)、后抬者(3.2) 都落在这里面，
  // 玩家在锁住的视锥里看着他们倒下，手上没有该按的键。连按窗口随后才开。
  // 取 2.4：顶住 + 窗口 + 结算（1.2 + 2.4 + 3.2 + 0.6 = 7.4 秒）必须在老周那一声
  // （对齐表 7.50 秒 / 兜底 ambushZhouStabAtS 7.6）之前收尾，Script_FirstLevelMissionTest 守着这条。
  ambushPinHoldS: 2.4,
  // 比共用 MELEE_QTE_RULES.windowS(4.8) 短：这是被顶住的一瞬，不是久持。
  // 运行时按 min(MELEE_QTE_RULES.windowS, 本值) 传给共用规则 —— 共用上限只会更宽，不改它。
  ambushQteWindowS: 3.2,
  // 对手力度，进 MeleeQte 的 decay 乘子（0.8–1.25 夹取）；比旧近战教学那一场（0.6）狠。
  ambushQteStrength: 0.75,
  // 视线甩到刺刀上的时间。与 deathLookSeconds(.65) 同一条曲线，短一半：这是被撞的一下。
  ambushLookSeconds: 0.35,
  // 罗班长他们从灶屋冲进来的延迟与速度（squadCatchupMps 4.5 之下，比行军 3.05 快）。
  // 契约建议 2.5；实拍下调到 1.5：晚一秒他们就赶不上第二个伏击兵放出来的时刻。
  ambushSquadDelayS: 1.5,
  ambushSquadSpeedMps: 3.6,
  // 老周挨这一刀之后的血量。他必须活到第 17 阶段才死：Orders 给 65，这里降到 45，
  // 后面 RetreatWall 12 / RetreatYard 6 / 空袭 18 的既有台阶不变。
  ambushZhouHealthAfter: 45,
  // 挣脱失败的额外伤害，叠在共用 standingFailureDamage(12) 之上。
  ambushFailureExtraDamage: 18,
  // 担架跟进：目标 = 玩家的路线进度减这个间距；南行转场时把老周这副提到队首前一个车距。
  ambushLitterFollowGapM: 4,
  ambushLitterLeadM: 3.4,
  // 抬着人小跑（litterSpeedMps 1.4 是行军速度）。触发前那几秒再快一档把担架拉进门。
  ambushLitterLeadMps: 3.2,
  ambushLitterRushMps: 4.2,
  // 担架停在屋子北门口（ConnectedHouse 北墙 z=0.5），不进屋。
  ambushLitterDoorZ: 1.4,
  ambushLitterWaitS: 3,
  // 刚重生／检查点重试／调试跳转都会给 3.2 秒出生保护（Data_Tuning_Player.SPAWN.graceS）。
  // 这一拍要等它过去再起，不然那一刀会被无敌吃掉；这里是等待上限。
  ambushProtectedWaitS: 4,
  // 控制锁的兜底上限。正常路径由挣脱那一拍显式还控制权，不靠这个计时器。
  // 整段锁住 ≈ ambushZhouStabAtS(7.6) + ambushWitnessTailS(0.9) = 8.5 秒，留 1 秒余量。
  ambushLockMaxS: 9.5,
  // 扑上来的最长时间：超时也照样捅，不许因为卡住就没有这一刀。
  ambushLungeMaxS: 1.2,
  // 到这个距离就算顶上了；与共用 MELEE_RULES.bindReachM 同一个数。
  ambushBindReachM: 1.15,
  // 顶住的最短可见时间：QTE 没能开起来时也不许同一帧就松开。
  ambushBindMinS: 0.4,
  // 背景拍表（相对触发）：前抬者 → 幺娃被撞倒 → 后抬者，全部落在顶住那一段
  //（约 1.1–3.5 秒）里，玩家在锁住的视锥里看得到、手上没有该按的键。
  // 老周挨的那一刀由配音事件 AmbushZhouLine 触发（RoomAmbush 第三句「啊！肚子……」
  // 起播的那一瞬，见 Data_FirstLevelMissionVoiceTiming），下面这个 7.6 秒是**没有配音时的
  // 兜底期限**，取自该句的对齐时刻 7.50 s。所以刀与那一声永远是对上的。
  // 这一刀**落在控制锁里面**：连按结算完之后 witness 那一段把视线拉到担架上继续锁着，
  // 刀落下才记 ambushBroken 还控制权（口径见 docs/Data_FirstLevelRoomAmbush.md §拍表）。
  ambushRiseSeconds: 0.7,
  ambushBearerStabAtS: 1.5,
  ambushZhouStabAtS: 7.6,
  ambushYaowaDownAtS: 2.4,
  ambushRearBearerStabAtS: 3.2,
  // 刺击动作的前摇：伤害落点之前这么久起播 clip（BayonetStabStanding 全长 1.2 s）。
  ambushClipLeadS: 0.55,
  ambushYaowaDownS: 6,
  // 锁住的视线落在刺刀那个人的胸口高度上。
  ambushLookHeightM: 1.4,
  // 连按结算完到挣脱之间的那一段（witness），视线从刺刀拉到担架上：
  // 老周挨的那一刀必须真的被看见。担架床面 0.86 m，落地之后更低，取 0.7 m 对着肚子。
  ambushLitterLookHeightM: .7,
  // 那一刀落下之后再锁这么久才还控制权：BayonetStabDown 全长 1.4 s、在刀落之前
  // ambushClipLeadS(0.55) 起播，所以刀落之后还有 0.85 s 的拧刀与拔刀。取 0.9 s：
  // 挣脱那一瞬玩家看见的是刀已经拔出来、老周捂着肚子，而不是刀还插在人身上就还权。
  ambushWitnessTailS: .9,
  // 演这一拍的人身上挂的「空射界」：InFireSector 对任何候选都返回 false，
  // 所以他们能走位、能演，但一枪都不开。挣脱之后这条就摘掉。
  ambushSilentSector: Object.freeze({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, selfDefenseM: 0 }),
  // 担架算不算「已经到门口」。
  ambushLitterDoorRadiusM: 2.5,
  // 挣脱之后四个人的守点半径（以 A.melee 为心，正好罩住整间屋）。
  ambushRoomHoldRadiusM: 8,
  ambushBreakHintS: 4,
  // 挣脱之后四个人不是同一瞬间一起扑上来：顶住玩家那个就在眼前（0），
  // 刚从第二个抬担架的身上把刺刀拔出来的那个晚 ambushReleaseDelayS，
  // 东南角那个还要绕过货箱堆（ambushFlankReleaseS），捅老周的那个等自己那一刀落完。
  // 这是这一拍能不能打的关键：实拍里三个人同时压上来，70 血的顺子在班里人赶到之前必死。
  ambushReleaseDelayS: 4.5,
  ambushFlankReleaseS: 7,
  squadWatchStages: ["Courtyard","Transfer","Reception","FinalDefense"],
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
  flankSpeedMps: 2.8,
  reliefDelaySeconds: 1.6,
  reliefSpeedMps: 2.8,
  tacticalMoveMps: 1.85,
  tacticalHoldSeconds: 4.5,
  tacticalSuppression: 0.55,
  tacticalArrivalM: 0.9,
  guideLookaheadM: 12,
  guideHideDistanceM: 3,
  southVehiclesAtS: 18,
  southHopeAtS: 43,
  followVehicleLeadS: 12,
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
  pursuerSpeedMps: 1.65,
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

// User 2026-09-14: authored soft return warning, with room for combat detours.
// Values are local design choices, not claimed COD engine constants.
export const MISSION_RETURN = Object.freeze({
  corridorM:36,hysteresisM:7,targetSafeM:22,squadM:78,personM:48,personUrgentM:72,
  urgentM:58,squadUrgentM:105,edgeM:14,edgeUrgentM:6,edgeHysteresisM:3,
  enterDelayS:1.25,stageGraceS:3,
});
