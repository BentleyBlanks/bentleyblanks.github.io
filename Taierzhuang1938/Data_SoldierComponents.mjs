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

/** 留在士兵本身、不进组件的字段：身份与对外引用。 */
export const SOLDIER_OWN_FIELDS = Object.freeze(["id", "side", "identity", "rnd", "actor", "director"]);

/**
 * 组件 → { label, owner, fields }。owner 是该组件的主人（该写它的模块）；别的模块读可以，写要经过主人。
 * 字段顺序就是构造器里的初始化顺序。
 */
export const SOLDIER_COMPONENTS = Object.freeze({
  vitals: Object.freeze({
    label: "生命与状态",
    owner: "Script_Ai（AiDirector / Soldier.Kill）",
    fields: Object.freeze(["health", "state", "stateTime", "stateLog", "stateLogHead", "stateLogCount", "stateLogged", "hurtPose", "deadTime"]),
  }),
  locomotion: Object.freeze({
    label: "移动、姿态与翻越",
    owner: "Script_Ai（Act / 物理胶囊）",
    fields: Object.freeze([
      "position", "velocity", "yaw", "moveSpeed", "body", "velocityY", "grounded",
      "stance", "crouchBlend", "proneBlend", "stanceUntil", "lastRiseAt",
      "stuckTime", "detourTime", "idleStepDt", "detourYaw", "detourSign", "detourGoalDist", "laneOffset",
      "vaultT", "vaultDuration", "vaultKind", "vaultFrom", "vaultTo", "vaultApexY",
      "moveOrder", "moveStore", "moveArriveM", "stationaryS",
    ]),
  }),
  arms: Object.freeze({
    label: "武器、弹药与开火",
    owner: "Script_Ai（TryFire / ShootingModel）",
    fields: Object.freeze([
      "weaponId", "weapon", "ammo", "reloadTimer", "fireTimer", "heat", "coolUntil", "heatSmoke", "bayonetFixed",
      "muzzle", "lastFire", "muzzleWorld", "muzzleStore", "burstLeft", "burstIntervalS", "burstPauseS", "fireSequence",
      "grenades", "lastGrenadeAt", "triggerDrySince", "targetFireAt", "shooting",
    ]),
  }),
  aiming: Object.freeze({
    label: "瞄准与看向（喂给 Actor 的连续量）",
    owner: "Script_Ai（Act）",
    fields: Object.freeze(["aimBlend", "aimUntil", "lookYaw", "lookPitch", "lookPitchBlend", "aimTime", "playerLockAt"]),
  }),
  sense: Object.freeze({
    label: "感知、目标与记忆",
    owner: "Script_Ai（Think / PerceptionModel）",
    fields: Object.freeze([
      "target", "targetVisible", "targetLostTime", "targetLockUntil", "targetChanges", "losCache", "losSlot",
      "perception", "alert", "awareness", "lkp", "lkpTime", "lkpConfidence", "targetMoving", "targetFromMemory", "targetExposedS",
      "aimedAtSince", "threatWokenAt", "grenadeThreatAt",
    ]),
  }),
  brain: Object.freeze({
    label: "决策：压制、掩体、冲锋、戒备、换位",
    owner: "Script_Ai（Think / TacticsDirector）",
    fields: Object.freeze([
      "combatModeUntil", "suppression", "suppressedAt", "chargeCooldownUntil",
      "cover", "coverUntil", "coverStore", "coverPhase", "coverPhaseUntil", "coverPickAt", "coverThreatX", "coverThreatZ", "peekCount", "peekFired",
      "goal", "regoalTime", "cohesion", "lonelyTime",
      "hesitateUntil", "groupChargeAt", "groupChargeUntil", "chargeFollowAt", "thinkEndState", "advanceBarkAt", "blindMoveAt", "blindMoves",
      "watchAlerted", "watchYaw", "watchUntil", "watchScanAt", "watchScanSign",
      "displaceX", "displaceZ", "displaceUntil", "displaceAt", "displaceFireSeq", "displaceProne",
      "grenadeEvade", "task",
    ]),
  }),
  meleeState: Object.freeze({
    label: "白刃",
    owner: "Script_MeleeCombat",
    fields: Object.freeze(["meleeCombat", "meleeTraining", "meleeStallAt", "meleeStallX", "meleeStallZ", "meleeStallDormantUntil"]),
  }),
  command: Object.freeze({
    label: "班组、命令与战位",
    owner: "Script_Ai（AiDirector.Spawn / 班组命令）",
    fields: Object.freeze([
      "order", "chargeUntil", "flankUntil", "covertUntil",
      "squadId", "squadSlot", "tacticalRole", "squadMateCount", "squadForwardX", "squadForwardZ", "squadFocusKind", "squadFocusId",
      "manualGoalUntil", "holdZone", "emplacementId", "aiOfficer", "reactionGroup",
    ]),
  }),
  scripted: Object.freeze({
    label: "关卡与测试场挂的开关",
    owner: "关卡编排（Script_FirstLevel*）与测试场",
    fields: Object.freeze([
      "dummy", "towel", "missionFireSuppressOnly", "missionOpenUntil",
      "ambientFirePoints", "ambientFirePoint", "ambientAim", "ambientUntil", "ambientPickAt", "ambientShots", "ambientBlockedId", "ambientBlockedUntil",
    ]),
  }),
  remains: Object.freeze({
    label: "尸体、遗物与断肢",
    owner: "Script_Ai（AiDirector.StepCorpse）与 GoreSystem",
    fields: Object.freeze([
      "corpse", "deathPush", "corpseSettled", "corpseTiltX", "corpseTiltZ", "corpseDroopBody", "corpseDroopArms",
      "corpseSlidePX", "corpseSlidePZ", "corpseStallT", "corpseDetourX", "corpseDetourZ", "corpseDetourT", "corpseSlideT",
      "drop", "gore",
    ]),
  }),
});
