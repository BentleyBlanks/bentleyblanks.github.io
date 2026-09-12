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
  trainTravelM: 268,
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
  litterCount: 10,
  walkingWoundedCount: 0,
  medicCount: 2,
  civilianCount: 2,
  litterSpeedMps: 1.4,
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
  // Twelve surface + four intruders + eighteen approach + twelve front + four escorts; finite, no respawn.
  openingEnemyBudget:50,
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
  meleeWindowS: 2.7,
  meleeStrength: 0.6,
  meleeApproachMps: 2.3,
  meleeTriggerRadiusM: 2.7,
  meleeBindRadiusM: 1.7,
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
