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
  // User 2026-09-16: 敌人一出现，队友该先就地找掩体节节抗击，而不是顺着任务路线往前走。
  // 上面那组「12 m / 停 3.5 s 就走」只留给开场冲过开阔地、进沟到遮蔽点集合、村口到屋内伏击（contactEscapeStages：遮蔽点对白要全班到位才触发；伏击开拍前三人要在灶屋埋伏位、幺娃要跟着担架，开拍后全班要站在屋里）；
  // 其余阶段走交战规则：看见（或刚看见过）50 m 内的敌人就停下，10 m 内找掩体还击；
  // 身边的弟兄已经在打、他也知道敌人在哪，就一起停。要继续前进时一次最多两人跃进一段、
  // 其余人原地掩护（跃进前至少在接敌点打满 contactBoundAfterS），不再整队沿路线走。
  contactEscapeStages:["Unloading","TrenchEntry","Shelter","Village","Melee"],
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
  // 用户 2026-09-16（对标《使命召唤：二战》诺曼底地堡那一段）：顺子刚进右手那间屋，
  // 藏在壁龛里的日军一枪托把他砸翻在地；他躺在地上、眼前发黑发糊，看着老周和两个
  // 抬担架的挨刀；那个人随后扑上来用刺刀压他的胸口 —— 抓枪、推刀、反手捅回去。
  // 拍表、每一条的出处与验收见 docs/Data_FirstLevelRoomAmbush.md。
  // 冲上来的速度取跃进冲刺同一档（assaultRushMps 3.4）：屋里三米的距离约 0.7 秒到位。
  ambushLungeMps: 3.4,
  // 扑到接触距离之后再抡这么久才砸到：RifleButtStrike 全长 1.0 s，
  // 抡到头顶那一下大约在 0.45 s。玩家看得见枪托抡起来，才谈得上「被砸」。
  ambushButtImpactS: .45,
  // 枪托这一下按 kind "qte" 结算（绕开 COMBAT.player.meleeScale），控制锁期间必须真的掉血。
  // 取 20：挨完这一下顺子是 80 血；后面地面僵持输掉是 72（共用 groundFailureDamage）
  // + 18（ambushFailureExtraDamage）= 110，满血进来也会死 —— 推刀输了就是被捅穿，
  // 走正常阵亡与检查点重试，不留「输了也没事」的后门。
  ambushButtDamage: 20,
  // 地面僵持（推刀）的连按窗口。共用上限 MELEE_QTE_RULES.windowS 4.8 一个字不动，
  // 运行时按 min(共用, 本值) 传进去 —— 这一拍只会更短。
  ambushQteWindowS: 3.6,
  // 对手力度，进 MeleeQte 的 decay 乘子（0.8–1.25 夹取）。
  ambushQteStrength: 0.75,
  // 抓枪那一下的提示窗口：环上的弧在这么久里漏完，漏完＝刀捅进来。
  // 1.2 s 是「看见提示、按一下」的时间，不是反应力测验。
  ambushGrabWindowS: 1.2,
  // 推赢之后那一下反捅的提示窗口。没按也会在窗口末尾自动补上（共用 QTE 已经判赢，
  // 这一下只是把胜负演出来）—— 所以它是节奏，不是第二道生死闸。
  ambushFinisherWindowS: 2.4,
  // 反捅进去之后再锁这么久才起身：PressureStabbed 全长 1.3 s，
  // 取 1.1 让玩家看见对面软下去、滚到右边，而不是刀还在人身上就站起来了。
  ambushFinisherHoldS: 1.1,
  // 反捅这一刀的伤害。领头那个必须真的死（走共用伤害链，出血、断肢、尸体照常）。
  ambushFinisherDamage: 140,
  // 视线甩到刺刀／担架上的时间。与 deathLookSeconds(.65) 同一条曲线，短一半。
  ambushLookSeconds: 0.35,
  // 罗班长他们从灶屋冲进来的延迟与速度（squadCatchupMps 4.5 之下，比行军 3.05 快）。
  // 契约建议 2.5；实拍下调到 1.5：晚一秒他们就赶不上第二个伏击兵放出来的时刻。
  ambushSquadDelayS: 1.5,
  ambushSquadSpeedMps: 3.6,
  // 老周挨这一刀之后的血量。他必须活到第 17 阶段才死：Orders 给 65，这里降到 45，
  // 后面 RetreatWall 12 / RetreatYard 6 / 空袭 18 的既有台阶不变。
  ambushZhouHealthAfter: 45,
  // 推刀输掉时叠在共用 groundFailureDamage(72) 之上的额外伤害。
  // 20 + 72 + 18 = 110：满血也死。这一拍没有「输了继续打」的中间态。
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
  // 这一拍要等它过去再起，不然那一下会被无敌吃掉；这里是等待上限。
  ambushProtectedWaitS: 4,
  // 控制锁的兜底上限。正常路径由起身那一拍显式还控制权，不靠这个计时器。
  // 最慢的一条路（Script_FirstLevelMissionTest 逐项加出来守着）：
  // 扑上来 1.2 + 砸 0.45 + 躺着看到 ambushPounceAtS 8.8 + 抓枪窗口 1.2
  // + 连按 3.6 + 共用结算 0.6 + 反捅窗口 2.4 + 反捅演完 1.1 = 19.35 秒，留一点余量。
  ambushLockMaxS: 20.5,
  // 扑上来的最长时间：超时也照样砸，不许因为卡住就没有这一下。
  ambushLungeMaxS: 1.2,
  // 到这个距离就算够得着了；与共用 MELEE_RULES.bindReachM 同一个数。
  ambushBindReachM: 1.15,
  // 背景拍表（相对触发，秒）。玩家这时候躺在地上，视线被拉到北门口的担架上：
  //   前抬者 → 老周（配音事件 AmbushZhouLine，RoomAmbush 第三句「啊！肚子……」）→
  //   后抬者 → 幺娃被撞倒 → 领头那个扑上来压住。
  // ambushZhouStabAtS 7.6 是**没有配音时的兜底期限**，取自对齐表的 7.50 s，
  // 所以关掉音频跑出来的节奏一样。
  ambushBearerStabAtS: 5.4,
  ambushZhouStabAtS: 7.6,
  ambushRearBearerStabAtS: 8.3,
  ambushYaowaDownAtS: 8.7,
  // 领头那个扑到身上压刺刀的时刻：老周那一刀（7.5）演完之后才轮到玩家自己这条线。
  ambushPounceAtS: 8.8,
  // 躺着的视线什么时候从压住自己的那个人拉到北门口的担架上。
  ambushLookLitterAtS: 4.6,
  // 这几秒他站在玩家东侧多远。扑过来的落点在「玩家 → 北门口担架」那条视线上，
  // 站着不动就把担架队被捅穿的整场背景挡死了；1.1 m 让开视线，又还在扑得回来的距离上。
  ambushDazeStandM: 1.1,
  // 刺击动作的前摇：伤害落点之前这么久起播 clip（BayonetStabStanding 全长 1.2 s）。
  ambushClipLeadS: 0.55,
  ambushYaowaDownS: 6,
  ambushRiseSeconds: 0.7,
  // 锁住的视线落在扑上来那个人的胸口高度上。
  ambushLookHeightM: 1.4,
  // 抡枪托砸下来那一下看的是**脸**，不是胸口：参考图①那一帧他的脸与肩膀撑满画面。
  // 这一段（lunge/butt）每帧重新瞄一次他的头骨世界位置，所以这个高度只是取不到骨头时的兜底。
  ambushButtLookHeightM: 1.52,
  // 砸中之后镜头往后仰、躺在地上看屋梁（参考图②）。落点取在自己正前方
  // ambushDazeLookAheadM 处、ambushDazeLookRiseM 高的地方：只抬头不转头，
  // 抬起来正好是这间屋的檩条与望板（墙顶 2.9 m，见 §3.2 Rafters）。
  // 这一段跟着倒地那半秒一起走完（ambushDazeLookS），4.6 s 再从屋梁摇到北门口的担架。
  // 不写这一条会怎样：镜头停在「瞄着他胸口 ± limitedLookRadians」那条带子上，
  // 躺下之后读到的是地板（2026-09-16 出图实拍）。
  ambushDazeLookAheadM: 2.2,
  ambushDazeLookRiseM: 2.3,
  ambushDazeLookS: 1.1,
  // 躺在地上看北门口那副担架：担架床面 0.86 m，落地之后更低，取 0.7 m 对着肚子。
  ambushLitterLookHeightM: .7,
  // 捅老周的那个站在担架西侧多远。原来沿用 ambushBindReachM(1.15)，而且共用走位的到达
  // 半径（0.45 m）还要在这上面再加一截 —— 实拍逐帧量刀尖：它落在担架北边 1.3 m 的地板上。
  // BayonetStabDown 的刀尖在他身前约 1.3 m（刀线下倾 7°、俯身进 0.24 m），所以站位取 1.25 m，
  // 并且走位改走 DriveAmbusherOnto（把到达半径那一截先扣掉），刀尖才真的落在老周肚子上。
  ambushZhouStabStandM: 1.25,
  // 同一件事的第二个数：站位沿担架**长边**往脚端错开多少。BayonetStabDown 的刀尖
  // 在他身前 1.25 m、又偏左手边 0.79 m（clip 自带的侧身），不错开的话那一刀正好扎在
  // 老周的脖子外侧、担架头端的空气里。0.7 m 让刀尖落在床面正中略偏头端 —— 肚子。
  ambushZhouStabLateralM: 0.7,
  // 倒地较劲那几拍（grab/mash/finish）把第一人称那把枪连同两只手整体挪开多少米。
  // 镜头就架在胸口上方，共用地面姿势把枪与右小臂摆在视线正中，压上来那个人的脸
  // 与他那把上了刺刀的三八式全被挡死。往下 0.28、往前 0.38 之后：他的脸与那把刺刀
  // 在上半屏、一点不挡，手里这把枪连同两只手落到下半屏（推远了小臂在画面里也细一圈）——
  // 就是参考图④⑤的读法（2026-09-16 十档对比出图选的值）。
  ambushGrappleHandM: Object.freeze({ x: 0.03, y: -0.28, z: -0.38 }),
  // —— 晕厥与恍惚。曲线的读法与开场出轨那一段完全一样（Curve 线性 + smoothstep），
  // 横轴是**枪托砸中那一瞬**起算的秒数，纵轴 0–1。开场那一套的形状照搬过来，
  // 只把「一次重击 → 黑 → 慢慢回来」压缩到这一拍的长度上（OPENING_PERCEPTION）。
  //   eyelids  眼皮（1 = 全黑）。砸中 0.45 s 后才全黑 —— 这半秒是留给「看见枪托抡过来、
  //            画面一歪、往地上倒」的，闭太快就只剩一块黑幕；按住 0.7 s，3.3 s 前睁开。
  //   intensity 恍惚总量（暗角、去色、二次像）；focus 失焦量（模糊像素）。
  //   hearing  耳鸣（1 = 低通压到 ambushDazeLowHz）。
  // 三条都拖到反捅之后才归零：人不是一站起来就好了。
  ambushDazeEyelids: [[0,0],[.45,1],[1.15,1],[1.9,.34],[2.6,.12],[3.3,0]],
  ambushDazeIntensity: [[0,1],[3.4,1],[5.2,.62],[7,.44],[12,.3],[16,.14],[18.5,0]],
  ambushDazeFocus: [[0,1],[3.2,1],[4.4,.74],[5.6,.42],[7,.3],[11,.22],[15,.1],[18.5,0]],
  ambushDazeHearing: [[0,0],[.2,1],[3.5,1],[6,.68],[9,.44],[14,.22],[18.5,0]],
  ambushDazeLowHz: 520,
  // 还控制权之后恍惚不是一刀切掉的：剩下的量在这么久里线性收干净。
  ambushDazeFadeS: 1.2,
  // 演这一拍的人身上挂的「空射界」：InFireSector 对任何候选都返回 false，
  // 所以他们能走位、能演，但一枪都不开。挣脱之后这条就摘掉。
  ambushSilentSector: Object.freeze({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, selfDefenseM: 0 }),
  // 担架算不算「已经到门口」。
  ambushLitterDoorRadiusM: 2.5,
  // 挣脱之后四个人的守点半径（以 A.melee 为心，正好罩住整间屋）。
  ambushRoomHoldRadiusM: 8,
  ambushBreakHintS: 4,
  // 挣脱之后剩下三个人不是同一瞬间一起扑上来：
  // 刚从第二个抬担架的身上把刺刀拔出来的那个晚 ambushReleaseDelayS，
  // 东南角那个还要绕过货箱堆（ambushFlankReleaseS），捅老周的那个等自己那一刀落完。
  // 这是这一拍能不能打的关键：实拍里三个人同时压上来，顺子在班里人赶到之前必死。
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
