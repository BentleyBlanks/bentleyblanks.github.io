// 士兵的组件表（docs/Data_EnemyAi.md §22）：Script_Ai 的 Soldier 身上的字段按职责分进哪个组件、谁该写它。
//
// 为什么要分：Soldier 原来是一个平铺 180 多个字段的大对象，AI、关卡、白刃、尸体、测试场都直接往上写，
// 改一处要先猜「还有谁也在写这个」。分组以后每组有一个主人，新字段必须先进这张表（SoldierComponentsTest 守着），
// 移植 UE 时一组对应一个 UActorComponent。
//
// 运行时：字段真正存在 `soldier.<组件>.<字段>` 里；Script_SoldierFields.mjs 按这张表生成同名存取器，
// 所以旧写法 `soldier.ammo` 照样读写同一个值，现有代码不用改。新代码直接写 `soldier.arms.ammo`。
// 改了这张表要重新生成：node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write
//
// 纯数据，零 three。

/** 留在士兵本身、不进组件的字段：身份与对外引用、兵种原型（Data_SoldierArchetypes）、标签位（SOLDIER_TAGS）。 */
export const SOLDIER_OWN_FIELDS = Object.freeze(["id", "side", "identity", "rnd", "actor", "director", "archetype", "tags"]);

/**
 * 组件 → { label, owner, owners, fields }。owner 是给人看的主人说明；owners 是机器认的主人文件（可带 * 通配），
 * 别的文件读可以，写要经过主人 —— 主人以外的直接写入登记在 SOLDIER_FOREIGN_WRITES，SoldierComponentsTest 拦新增的。
 * 字段顺序就是构造器里的初始化顺序。2026-11-02 起，关卡、开场分镜、AI 各处后挂在士兵身上的字段（浏览器普查 8 个入口、
 * 684 个士兵样本找出的 120 个）也全部进表：构造时初值 undefined，与「还没挂上」读起来一样。
 */
export const SOLDIER_COMPONENTS = Object.freeze({
  vitals: Object.freeze({
    label: "生命与状态",
    owner: "Script_Ai（AiDirector / Soldier.Kill）",
    owners: Object.freeze(["Script_Ai.mjs"]),
    fields: Object.freeze([
      "health", "state", "stateTime", "stateLog", "stateLogHead", "stateLogCount", "stateLogged", "hurtPose", "deadTime",
      // 2026-11-02 普查收进表的后挂字段
      "damageSequence", "woundedWalk", "frontWoundEstablished",
    ]),
  }),
  locomotion: Object.freeze({
    label: "移动、姿态与翻越",
    owner: "Script_Ai（Act / 物理胶囊）",
    owners: Object.freeze(["Script_Ai.mjs", "Script_SoldierView.mjs"]),
    fields: Object.freeze([
      "position", "velocity", "yaw", "moveSpeed", "body", "velocityY", "grounded",
      "stance", "crouchBlend", "proneBlend", "stanceUntil", "lastRiseAt",
      "stuckTime", "detourTime", "idleStepDt", "detourYaw", "detourSign", "detourGoalDist", "laneOffset",
      "vaultT", "vaultDuration", "vaultKind", "vaultFrom", "vaultTo", "vaultApexY",
      "moveOrder", "moveStore", "moveArriveM", "stationaryS",
      // 2026-11-02 普查收进表的后挂字段
      "crowdPushX", "crowdPushZ", "relaxedGait", "relaxedGaitPaceMps", "audioStepDist",
    ]),
  }),
  arms: Object.freeze({
    label: "武器、弹药与开火",
    owner: "Script_Ai（TryFire / ShootingModel）",
    owners: Object.freeze(["Script_Ai.mjs", "Script_AiShooting.mjs", "Script_AiTactics.mjs"]),
    fields: Object.freeze([
      "weaponId", "weapon", "ammo", "reloadTimer", "fireTimer", "heat", "coolUntil", "heatSmoke", "bayonetFixed",
      "muzzle", "lastFire", "muzzleWorld", "muzzleStore", "burstLeft", "burstIntervalS", "burstPauseS", "fireSequence",
      "grenades", "lastGrenadeAt", "triggerDrySince", "targetFireAt", "shooting",
      // 2026-11-02 普查收进表的后挂字段
      "muzzleAimYaw", "muzzleClipped",
    ]),
  }),
  aiming: Object.freeze({
    label: "瞄准与看向（喂给 Actor 的连续量）",
    owner: "Script_Ai（Act）",
    owners: Object.freeze(["Script_Ai.mjs"]),
    fields: Object.freeze(["aimBlend", "aimUntil", "lookYaw", "lookPitch", "lookPitchBlend", "aimTime", "playerLockAt"]),
  }),
  sense: Object.freeze({
    label: "感知、目标与记忆",
    owner: "Script_Ai（Think / PerceptionModel）",
    owners: Object.freeze(["Script_Ai.mjs", "Script_AiPerception.mjs", "Script_AiShooting.mjs"]),
    fields: Object.freeze([
      "target", "targetVisible", "targetLostTime", "targetLockUntil", "targetChanges", "losCache", "losSlot",
      "perception", "alert", "awareness", "lkp", "lkpTime", "lkpConfidence", "targetMoving", "targetFromMemory", "targetExposedS",
      "aimedAtSince", "threatWokenAt", "grenadeThreatAt",
      // 2026-11-02 普查收进表的后挂字段
      "grenadeThreat", "incomingFire", "peekSaw", "visualAimPart", "visualAimTargetId",
    ]),
  }),
  brain: Object.freeze({
    label: "决策：压制、掩体、冲锋、戒备、换位",
    owner: "Script_Ai（Think / TacticsDirector）",
    owners: Object.freeze(["Script_Ai.mjs", "Script_AiTactics.mjs", "Script_AiCover*.mjs"]),
    fields: Object.freeze([
      "combatModeUntil", "suppression", "suppressedAt", "chargeCooldownUntil",
      "cover", "coverUntil", "coverStore", "coverPhase", "coverPhaseUntil", "coverPickAt", "coverThreatX", "coverThreatZ", "peekCount", "peekFired",
      "goal", "regoalTime", "cohesion", "lonelyTime",
      "hesitateUntil", "groupChargeAt", "groupChargeUntil", "chargeFollowAt", "thinkEndState", "advanceBarkAt", "blindMoveAt", "blindMoves",
      "watchAlerted", "watchYaw", "watchUntil", "watchScanAt", "watchScanSign",
      "displaceX", "displaceZ", "displaceUntil", "displaceAt", "displaceFireSeq", "displaceProne",
      "grenadeEvade", "task",
      // 2026-11-02 普查收进表的后挂字段
      "coverFlankedAt", "blindPeeks", "coverMove", "coverProgressM", "coverProgressAt", "failedCoverId", "failedCoverUntil", "autoChargeTarget", "autoChargeUntil", "wakeOnThreat", "wakeDamageSeq", "tacticalRadiusM", "contactRadiusBaseM", "escortRadiusBaseM", "routeArrivalOwnsRadius",
    ]),
  }),
  meleeState: Object.freeze({
    label: "白刃",
    owner: "Script_MeleeCombat",
    owners: Object.freeze(["Script_MeleeCombat.mjs", "Script_Ai.mjs"]),
    fields: Object.freeze(["meleeCombat", "meleeTraining", "meleeStallAt", "meleeStallX", "meleeStallZ", "meleeStallDormantUntil"]),
  }),
  command: Object.freeze({
    label: "班组、命令与战位",
    owner: "Script_Ai（AiDirector.Spawn / 班组命令）",
    owners: Object.freeze(["Script_Ai.mjs", "Script_SquadMarchAi.mjs"]),
    fields: Object.freeze([
      "order", "chargeUntil", "flankUntil", "covertUntil",
      "squadId", "squadSlot", "tacticalRole", "squadMateCount", "squadForwardX", "squadForwardZ", "squadFocusKind", "squadFocusId",
      "manualGoalUntil", "holdZone", "emplacementId", "aiOfficer", "reactionGroup",
      // 2026-11-02 普查收进表的后挂字段
      "escortRole", "squadMarchCommand",
    ]),
  }),
  scripted: Object.freeze({
    label: "关卡与测试场挂的开关",
    owner: "关卡编排（Script_FirstLevel*）与测试场",
    owners: Object.freeze(["Script_FirstLevel*.mjs", "Script_Mission*.mjs", "Script_Opening*.mjs", "Script_SquadMarchAi.mjs", "Script_Ai.mjs", "Script_WeaponRangeRuntime.mjs", "Script_Main.mjs"]),
    fields: Object.freeze([
      "missionFireSuppressOnly", "missionOpenUntil",
      "ambientFirePoints", "ambientFirePoint", "ambientAim", "ambientUntil", "ambientPickAt", "ambientShots", "ambientBlockedId", "ambientBlockedUntil",
      // 2026-11-02 普查收进表的后挂字段
      "scriptAccuracyScale", "scriptFireIntervalScale", "scriptCoverSlackM", "scriptArrivalRadius", "scriptDefensive", "scriptSuppressible", "scriptMoveSpeedMps", "scriptCoverMaxRiseM", "scriptEscapeStance", "scriptTraversalStance", "scriptShelterUntil", "scriptProneUntil", "p012Guided", "p012ScoutDirected", "p012AwaitingWeapon", "p012RouteRejoining", "p012ScoutInitialHealth", "weaponRangeTargetId", "weaponRangeMoveSpeed",
    ]),
  }),
  mission: Object.freeze({
    label: "任务编排挂的状态（mission* 与压迫阶段）",
    owner: "关卡编排（Script_FirstLevel* / Script_Mission*）",
    owners: Object.freeze(["Script_FirstLevel*.mjs", "Script_Mission*.mjs", "Script_Ai.mjs", "Script_Main.mjs"]),
    fields: Object.freeze([
      "missionId",
      "missionEncounter",
      "missionReserve",
      "missionReleaseDelayS",
      "missionFrontStandby",
      "missionAccuracyScale",
      "missionFireIntervalScale",
      "missionFireHold",
      "missionSurfaceRest",
      "missionDormant",
      "missionTrainReady",
      "missionCombatAlert",
      "pressurePhaseId",
      "missionFireGroup",
      "missionTactic",
      "missionAssault",
      "missionGrenadeEvade",
      "missionGrenadeGoal",
      "missionCoverWaiting",
      "missionRearGapM",
      "missionNaturalMarch",
      "missionCoverApproach",
      "missionWatch",
      "missionCoverBounds",
      "missionCoverPassed",
      "missionContactPost",
      "missionGuideWaiting",
      "missionDamageSequence",
      "missionLastHealth",
      "missionGuideGesture",
      "missionNestGuardInit",
      "missionContactAt",
      "missionContactUntil",
      "missionEndCast",
      "missionContactBound",
      "missionGeng",
      "missionSortie",
      "missionContactResumeAt",
      "missionGrenadeReplanAt",
      "missionIncomingAt",
      "missionDangerUntil",
      "missionHideWeapon",
      "missionReach",
      "missionCarriageAction",
    ]),
  }),
  opening: Object.freeze({
    label: "开场分镜导演（opening*）",
    owner: "Script_OpeningStoryboards 与开场段编排",
    owners: Object.freeze(["Script_Opening*.mjs", "Script_FirstLevel*.mjs", "Script_EditorBlockoutPuppets.mjs"]),
    fields: Object.freeze([
      "openingShown",
      "openingNotShown",
      "openingStoryboardPose",
      "openingStoryboardLast",
      "openingStoryboardTravel",
      "openingStoryboardHidden",
      "openingStoryboardYaw",
      "openingStoryboardAim",
      "openingStoryboardCrouch",
      "openingPace",
      "openingTurnRate",
      "openingRerooted",
      "openingNoBlend",
      "openingActorPerformance",
      "openingAdopted",
      "openingPlay",
      "openingWalk",
      "openingDoomed",
    ]),
  }),
  cast: Object.freeze({
    label: "演员与说话身份",
    owner: "Script_Ai（AiDirector.Spawn）与关卡选角",
    owners: Object.freeze(["Script_Ai.mjs", "Script_FirstLevel*.mjs", "Script_Mission*.mjs", "Script_Main.mjs"]),
    fields: Object.freeze([
      "actorKind",
      "actorVariant",
      "castId",
      "speakerRole",
    ]),
  }),
  presentation: Object.freeze({
    label: "表现层回写的状态",
    owner: "Script_SoldierView",
    owners: Object.freeze(["Script_SoldierView.mjs", "Script_Ai.mjs"]),
    fields: Object.freeze([
      "renderLod",
    ]),
  }),
  remains: Object.freeze({
    label: "尸体、遗物与断肢",
    owner: "Script_Ai（AiDirector.StepCorpse）与 GoreSystem",
    owners: Object.freeze(["Script_Ai.mjs", "Script_CharacterGore.mjs", "Script_Dismemberment.mjs"]),
    fields: Object.freeze([
      "corpse", "deathPush", "corpseSettled", "corpseTiltX", "corpseTiltZ", "corpseDroopBody", "corpseDroopArms",
      "corpseSlidePX", "corpseSlidePZ", "corpseStallT", "corpseDetourX", "corpseDetourZ", "corpseDetourT", "corpseSlideT",
      "drop", "gore",
      // 2026-11-02 普查收进表的后挂字段
      "goreRnd",
    ]),
  }),
});

/**
 * 标签：身份类的真 / 假开关，存成 soldier.tags 一个整数里的位（对应 UE 的 GameplayTag）。
 * 旧字段名照样读写（存取器转到位上）；新代码用 soldier.HasTag("untargetable") / soldier.SetTag("untargetable", true)。
 * 顺序就是位序，只许往后加。
 */
export const SOLDIER_TAGS = Object.freeze([
  Object.freeze({ tag: "dummy", field: "dummy", label: "木桩兵：不想事、不开火（靶场 / 测试场）" }),
  Object.freeze({ tag: "towel", field: "towel", label: "白头巾（敢死队）" }),
  Object.freeze({ tag: "unarmed", field: "unarmed", label: "不持武器" }),
  Object.freeze({ tag: "noncombatant", field: "scriptedNoncombatant", label: "编排里的非战斗人员" }),
  Object.freeze({ tag: "essential", field: "scriptEssential", label: "编排保住的人（剧情必需）" }),
  Object.freeze({ tag: "untargetable", field: "missionUntargetable", label: "任务里暂时不可被瞄" }),
  Object.freeze({ tag: "meleeDormant", field: "meleeDormant", label: "白刃遭遇触发前不动" }),
  Object.freeze({ tag: "wounded", field: "wounded", label: "伤员" }),
]);
