// 生成，勿改。来源 Data_SoldierComponents.mjs；重新生成：node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write
//
// Soldier 的旧字段名 → 组件里的同名字段（docs/Data_EnemyAi.md §22）。写成字面量存取器而不是循环 defineProperty：
// V8 能把它内联进调用处，热路径上的读写只多一次取址；循环里用变量当键会慢五倍。

/** 标签 → soldier.tags 里的位（Data_SoldierComponents.SOLDIER_TAGS 的顺序）。 */
export const SOLDIER_TAG_BITS = Object.freeze({ dummy: 1, towel: 2, unarmed: 4, noncombatant: 8, essential: 16, untargetable: 32, meleeDormant: 64, wounded: 128 });

export class SoldierFieldAccessors {
  // vitals：生命与状态
  get health() { return this.vitals.health; }
  set health(value) { this.vitals.health = value; }
  get state() { return this.vitals.state; }
  set state(value) { this.vitals.state = value; }
  get stateTime() { return this.vitals.stateTime; }
  set stateTime(value) { this.vitals.stateTime = value; }
  get stateLog() { return this.vitals.stateLog; }
  set stateLog(value) { this.vitals.stateLog = value; }
  get stateLogHead() { return this.vitals.stateLogHead; }
  set stateLogHead(value) { this.vitals.stateLogHead = value; }
  get stateLogCount() { return this.vitals.stateLogCount; }
  set stateLogCount(value) { this.vitals.stateLogCount = value; }
  get stateLogged() { return this.vitals.stateLogged; }
  set stateLogged(value) { this.vitals.stateLogged = value; }
  get hurtPose() { return this.vitals.hurtPose; }
  set hurtPose(value) { this.vitals.hurtPose = value; }
  get deadTime() { return this.vitals.deadTime; }
  set deadTime(value) { this.vitals.deadTime = value; }
  get damageSequence() { return this.vitals.damageSequence; }
  set damageSequence(value) { this.vitals.damageSequence = value; }
  get woundedWalk() { return this.vitals.woundedWalk; }
  set woundedWalk(value) { this.vitals.woundedWalk = value; }
  get frontWoundEstablished() { return this.vitals.frontWoundEstablished; }
  set frontWoundEstablished(value) { this.vitals.frontWoundEstablished = value; }
  // locomotion：移动、姿态与翻越
  get position() { return this.locomotion.position; }
  set position(value) { this.locomotion.position = value; }
  get velocity() { return this.locomotion.velocity; }
  set velocity(value) { this.locomotion.velocity = value; }
  get yaw() { return this.locomotion.yaw; }
  set yaw(value) { this.locomotion.yaw = value; }
  get moveSpeed() { return this.locomotion.moveSpeed; }
  set moveSpeed(value) { this.locomotion.moveSpeed = value; }
  get body() { return this.locomotion.body; }
  set body(value) { this.locomotion.body = value; }
  get velocityY() { return this.locomotion.velocityY; }
  set velocityY(value) { this.locomotion.velocityY = value; }
  get grounded() { return this.locomotion.grounded; }
  set grounded(value) { this.locomotion.grounded = value; }
  get stance() { return this.locomotion.stance; }
  set stance(value) { this.locomotion.stance = value; }
  get crouchBlend() { return this.locomotion.crouchBlend; }
  set crouchBlend(value) { this.locomotion.crouchBlend = value; }
  get proneBlend() { return this.locomotion.proneBlend; }
  set proneBlend(value) { this.locomotion.proneBlend = value; }
  get stanceUntil() { return this.locomotion.stanceUntil; }
  set stanceUntil(value) { this.locomotion.stanceUntil = value; }
  get lastRiseAt() { return this.locomotion.lastRiseAt; }
  set lastRiseAt(value) { this.locomotion.lastRiseAt = value; }
  get stuckTime() { return this.locomotion.stuckTime; }
  set stuckTime(value) { this.locomotion.stuckTime = value; }
  get detourTime() { return this.locomotion.detourTime; }
  set detourTime(value) { this.locomotion.detourTime = value; }
  get idleStepDt() { return this.locomotion.idleStepDt; }
  set idleStepDt(value) { this.locomotion.idleStepDt = value; }
  get detourYaw() { return this.locomotion.detourYaw; }
  set detourYaw(value) { this.locomotion.detourYaw = value; }
  get detourSign() { return this.locomotion.detourSign; }
  set detourSign(value) { this.locomotion.detourSign = value; }
  get detourGoalDist() { return this.locomotion.detourGoalDist; }
  set detourGoalDist(value) { this.locomotion.detourGoalDist = value; }
  get laneOffset() { return this.locomotion.laneOffset; }
  set laneOffset(value) { this.locomotion.laneOffset = value; }
  get vaultT() { return this.locomotion.vaultT; }
  set vaultT(value) { this.locomotion.vaultT = value; }
  get vaultDuration() { return this.locomotion.vaultDuration; }
  set vaultDuration(value) { this.locomotion.vaultDuration = value; }
  get vaultKind() { return this.locomotion.vaultKind; }
  set vaultKind(value) { this.locomotion.vaultKind = value; }
  get vaultFrom() { return this.locomotion.vaultFrom; }
  set vaultFrom(value) { this.locomotion.vaultFrom = value; }
  get vaultTo() { return this.locomotion.vaultTo; }
  set vaultTo(value) { this.locomotion.vaultTo = value; }
  get vaultApexY() { return this.locomotion.vaultApexY; }
  set vaultApexY(value) { this.locomotion.vaultApexY = value; }
  get moveOrder() { return this.locomotion.moveOrder; }
  set moveOrder(value) { this.locomotion.moveOrder = value; }
  get moveStore() { return this.locomotion.moveStore; }
  set moveStore(value) { this.locomotion.moveStore = value; }
  get moveArriveM() { return this.locomotion.moveArriveM; }
  set moveArriveM(value) { this.locomotion.moveArriveM = value; }
  get stationaryS() { return this.locomotion.stationaryS; }
  set stationaryS(value) { this.locomotion.stationaryS = value; }
  get crowdPushX() { return this.locomotion.crowdPushX; }
  set crowdPushX(value) { this.locomotion.crowdPushX = value; }
  get crowdPushZ() { return this.locomotion.crowdPushZ; }
  set crowdPushZ(value) { this.locomotion.crowdPushZ = value; }
  get relaxedGait() { return this.locomotion.relaxedGait; }
  set relaxedGait(value) { this.locomotion.relaxedGait = value; }
  get relaxedGaitPaceMps() { return this.locomotion.relaxedGaitPaceMps; }
  set relaxedGaitPaceMps(value) { this.locomotion.relaxedGaitPaceMps = value; }
  get audioStepDist() { return this.locomotion.audioStepDist; }
  set audioStepDist(value) { this.locomotion.audioStepDist = value; }
  // arms：武器、弹药与开火
  get weaponId() { return this.arms.weaponId; }
  set weaponId(value) { this.arms.weaponId = value; }
  get weapon() { return this.arms.weapon; }
  set weapon(value) { this.arms.weapon = value; }
  get ammo() { return this.arms.ammo; }
  set ammo(value) { this.arms.ammo = value; }
  get reloadTimer() { return this.arms.reloadTimer; }
  set reloadTimer(value) { this.arms.reloadTimer = value; }
  get fireTimer() { return this.arms.fireTimer; }
  set fireTimer(value) { this.arms.fireTimer = value; }
  get heat() { return this.arms.heat; }
  set heat(value) { this.arms.heat = value; }
  get coolUntil() { return this.arms.coolUntil; }
  set coolUntil(value) { this.arms.coolUntil = value; }
  get heatSmoke() { return this.arms.heatSmoke; }
  set heatSmoke(value) { this.arms.heatSmoke = value; }
  get bayonetFixed() { return this.arms.bayonetFixed; }
  set bayonetFixed(value) { this.arms.bayonetFixed = value; }
  get muzzle() { return this.arms.muzzle; }
  set muzzle(value) { this.arms.muzzle = value; }
  get lastFire() { return this.arms.lastFire; }
  set lastFire(value) { this.arms.lastFire = value; }
  get muzzleWorld() { return this.arms.muzzleWorld; }
  set muzzleWorld(value) { this.arms.muzzleWorld = value; }
  get muzzleStore() { return this.arms.muzzleStore; }
  set muzzleStore(value) { this.arms.muzzleStore = value; }
  get burstLeft() { return this.arms.burstLeft; }
  set burstLeft(value) { this.arms.burstLeft = value; }
  get burstIntervalS() { return this.arms.burstIntervalS; }
  set burstIntervalS(value) { this.arms.burstIntervalS = value; }
  get burstPauseS() { return this.arms.burstPauseS; }
  set burstPauseS(value) { this.arms.burstPauseS = value; }
  get fireSequence() { return this.arms.fireSequence; }
  set fireSequence(value) { this.arms.fireSequence = value; }
  get grenades() { return this.arms.grenades; }
  set grenades(value) { this.arms.grenades = value; }
  get lastGrenadeAt() { return this.arms.lastGrenadeAt; }
  set lastGrenadeAt(value) { this.arms.lastGrenadeAt = value; }
  get triggerDrySince() { return this.arms.triggerDrySince; }
  set triggerDrySince(value) { this.arms.triggerDrySince = value; }
  get targetFireAt() { return this.arms.targetFireAt; }
  set targetFireAt(value) { this.arms.targetFireAt = value; }
  get shooting() { return this.arms.shooting; }
  set shooting(value) { this.arms.shooting = value; }
  get muzzleAimYaw() { return this.arms.muzzleAimYaw; }
  set muzzleAimYaw(value) { this.arms.muzzleAimYaw = value; }
  get muzzleClipped() { return this.arms.muzzleClipped; }
  set muzzleClipped(value) { this.arms.muzzleClipped = value; }
  // aiming：瞄准与看向（喂给 Actor 的连续量）
  get aimBlend() { return this.aiming.aimBlend; }
  set aimBlend(value) { this.aiming.aimBlend = value; }
  get aimUntil() { return this.aiming.aimUntil; }
  set aimUntil(value) { this.aiming.aimUntil = value; }
  get lookYaw() { return this.aiming.lookYaw; }
  set lookYaw(value) { this.aiming.lookYaw = value; }
  get lookPitch() { return this.aiming.lookPitch; }
  set lookPitch(value) { this.aiming.lookPitch = value; }
  get lookPitchBlend() { return this.aiming.lookPitchBlend; }
  set lookPitchBlend(value) { this.aiming.lookPitchBlend = value; }
  get aimTime() { return this.aiming.aimTime; }
  set aimTime(value) { this.aiming.aimTime = value; }
  get playerLockAt() { return this.aiming.playerLockAt; }
  set playerLockAt(value) { this.aiming.playerLockAt = value; }
  // sense：感知、目标与记忆
  get target() { return this.sense.target; }
  set target(value) { this.sense.target = value; }
  get targetVisible() { return this.sense.targetVisible; }
  set targetVisible(value) { this.sense.targetVisible = value; }
  get targetLostTime() { return this.sense.targetLostTime; }
  set targetLostTime(value) { this.sense.targetLostTime = value; }
  get targetLockUntil() { return this.sense.targetLockUntil; }
  set targetLockUntil(value) { this.sense.targetLockUntil = value; }
  get targetChanges() { return this.sense.targetChanges; }
  set targetChanges(value) { this.sense.targetChanges = value; }
  get losCache() { return this.sense.losCache; }
  set losCache(value) { this.sense.losCache = value; }
  get losSlot() { return this.sense.losSlot; }
  set losSlot(value) { this.sense.losSlot = value; }
  get perception() { return this.sense.perception; }
  set perception(value) { this.sense.perception = value; }
  get alert() { return this.sense.alert; }
  set alert(value) { this.sense.alert = value; }
  get awareness() { return this.sense.awareness; }
  set awareness(value) { this.sense.awareness = value; }
  get lkp() { return this.sense.lkp; }
  set lkp(value) { this.sense.lkp = value; }
  get lkpTime() { return this.sense.lkpTime; }
  set lkpTime(value) { this.sense.lkpTime = value; }
  get lkpConfidence() { return this.sense.lkpConfidence; }
  set lkpConfidence(value) { this.sense.lkpConfidence = value; }
  get targetMoving() { return this.sense.targetMoving; }
  set targetMoving(value) { this.sense.targetMoving = value; }
  get targetFromMemory() { return this.sense.targetFromMemory; }
  set targetFromMemory(value) { this.sense.targetFromMemory = value; }
  get targetExposedS() { return this.sense.targetExposedS; }
  set targetExposedS(value) { this.sense.targetExposedS = value; }
  get aimedAtSince() { return this.sense.aimedAtSince; }
  set aimedAtSince(value) { this.sense.aimedAtSince = value; }
  get threatWokenAt() { return this.sense.threatWokenAt; }
  set threatWokenAt(value) { this.sense.threatWokenAt = value; }
  get grenadeThreatAt() { return this.sense.grenadeThreatAt; }
  set grenadeThreatAt(value) { this.sense.grenadeThreatAt = value; }
  get grenadeThreat() { return this.sense.grenadeThreat; }
  set grenadeThreat(value) { this.sense.grenadeThreat = value; }
  get incomingFire() { return this.sense.incomingFire; }
  set incomingFire(value) { this.sense.incomingFire = value; }
  get peekSaw() { return this.sense.peekSaw; }
  set peekSaw(value) { this.sense.peekSaw = value; }
  get visualAimPart() { return this.sense.visualAimPart; }
  set visualAimPart(value) { this.sense.visualAimPart = value; }
  get visualAimTargetId() { return this.sense.visualAimTargetId; }
  set visualAimTargetId(value) { this.sense.visualAimTargetId = value; }
  // brain：决策：压制、掩体、冲锋、戒备、换位
  get combatModeUntil() { return this.brain.combatModeUntil; }
  set combatModeUntil(value) { this.brain.combatModeUntil = value; }
  get suppression() { return this.brain.suppression; }
  set suppression(value) { this.brain.suppression = value; }
  get suppressedAt() { return this.brain.suppressedAt; }
  set suppressedAt(value) { this.brain.suppressedAt = value; }
  get chargeCooldownUntil() { return this.brain.chargeCooldownUntil; }
  set chargeCooldownUntil(value) { this.brain.chargeCooldownUntil = value; }
  get cover() { return this.brain.cover; }
  set cover(value) { this.brain.cover = value; }
  get coverUntil() { return this.brain.coverUntil; }
  set coverUntil(value) { this.brain.coverUntil = value; }
  get coverStore() { return this.brain.coverStore; }
  set coverStore(value) { this.brain.coverStore = value; }
  get coverPhase() { return this.brain.coverPhase; }
  set coverPhase(value) { this.brain.coverPhase = value; }
  get coverPhaseUntil() { return this.brain.coverPhaseUntil; }
  set coverPhaseUntil(value) { this.brain.coverPhaseUntil = value; }
  get coverPickAt() { return this.brain.coverPickAt; }
  set coverPickAt(value) { this.brain.coverPickAt = value; }
  get coverThreatX() { return this.brain.coverThreatX; }
  set coverThreatX(value) { this.brain.coverThreatX = value; }
  get coverThreatZ() { return this.brain.coverThreatZ; }
  set coverThreatZ(value) { this.brain.coverThreatZ = value; }
  get peekCount() { return this.brain.peekCount; }
  set peekCount(value) { this.brain.peekCount = value; }
  get peekFired() { return this.brain.peekFired; }
  set peekFired(value) { this.brain.peekFired = value; }
  get goal() { return this.brain.goal; }
  set goal(value) { this.brain.goal = value; }
  get regoalTime() { return this.brain.regoalTime; }
  set regoalTime(value) { this.brain.regoalTime = value; }
  get cohesion() { return this.brain.cohesion; }
  set cohesion(value) { this.brain.cohesion = value; }
  get lonelyTime() { return this.brain.lonelyTime; }
  set lonelyTime(value) { this.brain.lonelyTime = value; }
  get hesitateUntil() { return this.brain.hesitateUntil; }
  set hesitateUntil(value) { this.brain.hesitateUntil = value; }
  get groupChargeAt() { return this.brain.groupChargeAt; }
  set groupChargeAt(value) { this.brain.groupChargeAt = value; }
  get groupChargeUntil() { return this.brain.groupChargeUntil; }
  set groupChargeUntil(value) { this.brain.groupChargeUntil = value; }
  get chargeFollowAt() { return this.brain.chargeFollowAt; }
  set chargeFollowAt(value) { this.brain.chargeFollowAt = value; }
  get thinkEndState() { return this.brain.thinkEndState; }
  set thinkEndState(value) { this.brain.thinkEndState = value; }
  get advanceBarkAt() { return this.brain.advanceBarkAt; }
  set advanceBarkAt(value) { this.brain.advanceBarkAt = value; }
  get blindMoveAt() { return this.brain.blindMoveAt; }
  set blindMoveAt(value) { this.brain.blindMoveAt = value; }
  get blindMoves() { return this.brain.blindMoves; }
  set blindMoves(value) { this.brain.blindMoves = value; }
  get watchAlerted() { return this.brain.watchAlerted; }
  set watchAlerted(value) { this.brain.watchAlerted = value; }
  get watchYaw() { return this.brain.watchYaw; }
  set watchYaw(value) { this.brain.watchYaw = value; }
  get watchUntil() { return this.brain.watchUntil; }
  set watchUntil(value) { this.brain.watchUntil = value; }
  get watchScanAt() { return this.brain.watchScanAt; }
  set watchScanAt(value) { this.brain.watchScanAt = value; }
  get watchScanSign() { return this.brain.watchScanSign; }
  set watchScanSign(value) { this.brain.watchScanSign = value; }
  get displaceX() { return this.brain.displaceX; }
  set displaceX(value) { this.brain.displaceX = value; }
  get displaceZ() { return this.brain.displaceZ; }
  set displaceZ(value) { this.brain.displaceZ = value; }
  get displaceUntil() { return this.brain.displaceUntil; }
  set displaceUntil(value) { this.brain.displaceUntil = value; }
  get displaceAt() { return this.brain.displaceAt; }
  set displaceAt(value) { this.brain.displaceAt = value; }
  get displaceFireSeq() { return this.brain.displaceFireSeq; }
  set displaceFireSeq(value) { this.brain.displaceFireSeq = value; }
  get displaceProne() { return this.brain.displaceProne; }
  set displaceProne(value) { this.brain.displaceProne = value; }
  get grenadeEvade() { return this.brain.grenadeEvade; }
  set grenadeEvade(value) { this.brain.grenadeEvade = value; }
  get task() { return this.brain.task; }
  set task(value) { this.brain.task = value; }
  get coverFlankedAt() { return this.brain.coverFlankedAt; }
  set coverFlankedAt(value) { this.brain.coverFlankedAt = value; }
  get blindPeeks() { return this.brain.blindPeeks; }
  set blindPeeks(value) { this.brain.blindPeeks = value; }
  get coverMove() { return this.brain.coverMove; }
  set coverMove(value) { this.brain.coverMove = value; }
  get coverProgressM() { return this.brain.coverProgressM; }
  set coverProgressM(value) { this.brain.coverProgressM = value; }
  get coverProgressAt() { return this.brain.coverProgressAt; }
  set coverProgressAt(value) { this.brain.coverProgressAt = value; }
  get failedCoverId() { return this.brain.failedCoverId; }
  set failedCoverId(value) { this.brain.failedCoverId = value; }
  get failedCoverUntil() { return this.brain.failedCoverUntil; }
  set failedCoverUntil(value) { this.brain.failedCoverUntil = value; }
  get autoChargeTarget() { return this.brain.autoChargeTarget; }
  set autoChargeTarget(value) { this.brain.autoChargeTarget = value; }
  get autoChargeUntil() { return this.brain.autoChargeUntil; }
  set autoChargeUntil(value) { this.brain.autoChargeUntil = value; }
  get wakeOnThreat() { return this.brain.wakeOnThreat; }
  set wakeOnThreat(value) { this.brain.wakeOnThreat = value; }
  get wakeDamageSeq() { return this.brain.wakeDamageSeq; }
  set wakeDamageSeq(value) { this.brain.wakeDamageSeq = value; }
  get tacticalRadiusM() { return this.brain.tacticalRadiusM; }
  set tacticalRadiusM(value) { this.brain.tacticalRadiusM = value; }
  get contactRadiusBaseM() { return this.brain.contactRadiusBaseM; }
  set contactRadiusBaseM(value) { this.brain.contactRadiusBaseM = value; }
  get escortRadiusBaseM() { return this.brain.escortRadiusBaseM; }
  set escortRadiusBaseM(value) { this.brain.escortRadiusBaseM = value; }
  get routeArrivalOwnsRadius() { return this.brain.routeArrivalOwnsRadius; }
  set routeArrivalOwnsRadius(value) { this.brain.routeArrivalOwnsRadius = value; }
  // meleeState：白刃
  get meleeCombat() { return this.meleeState.meleeCombat; }
  set meleeCombat(value) { this.meleeState.meleeCombat = value; }
  get meleeTraining() { return this.meleeState.meleeTraining; }
  set meleeTraining(value) { this.meleeState.meleeTraining = value; }
  get meleeStallAt() { return this.meleeState.meleeStallAt; }
  set meleeStallAt(value) { this.meleeState.meleeStallAt = value; }
  get meleeStallX() { return this.meleeState.meleeStallX; }
  set meleeStallX(value) { this.meleeState.meleeStallX = value; }
  get meleeStallZ() { return this.meleeState.meleeStallZ; }
  set meleeStallZ(value) { this.meleeState.meleeStallZ = value; }
  get meleeStallDormantUntil() { return this.meleeState.meleeStallDormantUntil; }
  set meleeStallDormantUntil(value) { this.meleeState.meleeStallDormantUntil = value; }
  // command：班组、命令与战位
  get order() { return this.command.order; }
  set order(value) { this.command.order = value; }
  get chargeUntil() { return this.command.chargeUntil; }
  set chargeUntil(value) { this.command.chargeUntil = value; }
  get flankUntil() { return this.command.flankUntil; }
  set flankUntil(value) { this.command.flankUntil = value; }
  get covertUntil() { return this.command.covertUntil; }
  set covertUntil(value) { this.command.covertUntil = value; }
  get squadId() { return this.command.squadId; }
  set squadId(value) { this.command.squadId = value; }
  get squadSlot() { return this.command.squadSlot; }
  set squadSlot(value) { this.command.squadSlot = value; }
  get tacticalRole() { return this.command.tacticalRole; }
  set tacticalRole(value) { this.command.tacticalRole = value; }
  get squadMateCount() { return this.command.squadMateCount; }
  set squadMateCount(value) { this.command.squadMateCount = value; }
  get squadForwardX() { return this.command.squadForwardX; }
  set squadForwardX(value) { this.command.squadForwardX = value; }
  get squadForwardZ() { return this.command.squadForwardZ; }
  set squadForwardZ(value) { this.command.squadForwardZ = value; }
  get squadFocusKind() { return this.command.squadFocusKind; }
  set squadFocusKind(value) { this.command.squadFocusKind = value; }
  get squadFocusId() { return this.command.squadFocusId; }
  set squadFocusId(value) { this.command.squadFocusId = value; }
  get manualGoalUntil() { return this.command.manualGoalUntil; }
  set manualGoalUntil(value) { this.command.manualGoalUntil = value; }
  get holdZone() { return this.command.holdZone; }
  set holdZone(value) { this.command.holdZone = value; }
  get emplacementId() { return this.command.emplacementId; }
  set emplacementId(value) { this.command.emplacementId = value; }
  get aiOfficer() { return this.command.aiOfficer; }
  set aiOfficer(value) { this.command.aiOfficer = value; }
  get reactionGroup() { return this.command.reactionGroup; }
  set reactionGroup(value) { this.command.reactionGroup = value; }
  get escortRole() { return this.command.escortRole; }
  set escortRole(value) { this.command.escortRole = value; }
  get squadMarchCommand() { return this.command.squadMarchCommand; }
  set squadMarchCommand(value) { this.command.squadMarchCommand = value; }
  // scripted：关卡与测试场挂的开关
  get missionFireSuppressOnly() { return this.scripted.missionFireSuppressOnly; }
  set missionFireSuppressOnly(value) { this.scripted.missionFireSuppressOnly = value; }
  get missionOpenUntil() { return this.scripted.missionOpenUntil; }
  set missionOpenUntil(value) { this.scripted.missionOpenUntil = value; }
  get ambientFirePoints() { return this.scripted.ambientFirePoints; }
  set ambientFirePoints(value) { this.scripted.ambientFirePoints = value; }
  get ambientFirePoint() { return this.scripted.ambientFirePoint; }
  set ambientFirePoint(value) { this.scripted.ambientFirePoint = value; }
  get ambientAim() { return this.scripted.ambientAim; }
  set ambientAim(value) { this.scripted.ambientAim = value; }
  get ambientUntil() { return this.scripted.ambientUntil; }
  set ambientUntil(value) { this.scripted.ambientUntil = value; }
  get ambientPickAt() { return this.scripted.ambientPickAt; }
  set ambientPickAt(value) { this.scripted.ambientPickAt = value; }
  get ambientShots() { return this.scripted.ambientShots; }
  set ambientShots(value) { this.scripted.ambientShots = value; }
  get ambientBlockedId() { return this.scripted.ambientBlockedId; }
  set ambientBlockedId(value) { this.scripted.ambientBlockedId = value; }
  get ambientBlockedUntil() { return this.scripted.ambientBlockedUntil; }
  set ambientBlockedUntil(value) { this.scripted.ambientBlockedUntil = value; }
  get scriptAccuracyScale() { return this.scripted.scriptAccuracyScale; }
  set scriptAccuracyScale(value) { this.scripted.scriptAccuracyScale = value; }
  get scriptFireIntervalScale() { return this.scripted.scriptFireIntervalScale; }
  set scriptFireIntervalScale(value) { this.scripted.scriptFireIntervalScale = value; }
  get scriptCoverSlackM() { return this.scripted.scriptCoverSlackM; }
  set scriptCoverSlackM(value) { this.scripted.scriptCoverSlackM = value; }
  get scriptArrivalRadius() { return this.scripted.scriptArrivalRadius; }
  set scriptArrivalRadius(value) { this.scripted.scriptArrivalRadius = value; }
  get scriptDefensive() { return this.scripted.scriptDefensive; }
  set scriptDefensive(value) { this.scripted.scriptDefensive = value; }
  get scriptSuppressible() { return this.scripted.scriptSuppressible; }
  set scriptSuppressible(value) { this.scripted.scriptSuppressible = value; }
  get scriptMoveSpeedMps() { return this.scripted.scriptMoveSpeedMps; }
  set scriptMoveSpeedMps(value) { this.scripted.scriptMoveSpeedMps = value; }
  get scriptCoverMaxRiseM() { return this.scripted.scriptCoverMaxRiseM; }
  set scriptCoverMaxRiseM(value) { this.scripted.scriptCoverMaxRiseM = value; }
  get scriptEscapeStance() { return this.scripted.scriptEscapeStance; }
  set scriptEscapeStance(value) { this.scripted.scriptEscapeStance = value; }
  get scriptTraversalStance() { return this.scripted.scriptTraversalStance; }
  set scriptTraversalStance(value) { this.scripted.scriptTraversalStance = value; }
  get scriptShelterUntil() { return this.scripted.scriptShelterUntil; }
  set scriptShelterUntil(value) { this.scripted.scriptShelterUntil = value; }
  get scriptProneUntil() { return this.scripted.scriptProneUntil; }
  set scriptProneUntil(value) { this.scripted.scriptProneUntil = value; }
  get p012Guided() { return this.scripted.p012Guided; }
  set p012Guided(value) { this.scripted.p012Guided = value; }
  get p012ScoutDirected() { return this.scripted.p012ScoutDirected; }
  set p012ScoutDirected(value) { this.scripted.p012ScoutDirected = value; }
  get p012AwaitingWeapon() { return this.scripted.p012AwaitingWeapon; }
  set p012AwaitingWeapon(value) { this.scripted.p012AwaitingWeapon = value; }
  get p012RouteRejoining() { return this.scripted.p012RouteRejoining; }
  set p012RouteRejoining(value) { this.scripted.p012RouteRejoining = value; }
  get p012ScoutInitialHealth() { return this.scripted.p012ScoutInitialHealth; }
  set p012ScoutInitialHealth(value) { this.scripted.p012ScoutInitialHealth = value; }
  get weaponRangeTargetId() { return this.scripted.weaponRangeTargetId; }
  set weaponRangeTargetId(value) { this.scripted.weaponRangeTargetId = value; }
  get weaponRangeMoveSpeed() { return this.scripted.weaponRangeMoveSpeed; }
  set weaponRangeMoveSpeed(value) { this.scripted.weaponRangeMoveSpeed = value; }
  // mission：任务编排挂的状态（mission* 与压迫阶段）
  get missionId() { return this.mission.missionId; }
  set missionId(value) { this.mission.missionId = value; }
  get missionEncounter() { return this.mission.missionEncounter; }
  set missionEncounter(value) { this.mission.missionEncounter = value; }
  get missionReserve() { return this.mission.missionReserve; }
  set missionReserve(value) { this.mission.missionReserve = value; }
  get missionReleaseDelayS() { return this.mission.missionReleaseDelayS; }
  set missionReleaseDelayS(value) { this.mission.missionReleaseDelayS = value; }
  get missionFrontStandby() { return this.mission.missionFrontStandby; }
  set missionFrontStandby(value) { this.mission.missionFrontStandby = value; }
  get missionAccuracyScale() { return this.mission.missionAccuracyScale; }
  set missionAccuracyScale(value) { this.mission.missionAccuracyScale = value; }
  get missionFireIntervalScale() { return this.mission.missionFireIntervalScale; }
  set missionFireIntervalScale(value) { this.mission.missionFireIntervalScale = value; }
  get missionFireHold() { return this.mission.missionFireHold; }
  set missionFireHold(value) { this.mission.missionFireHold = value; }
  get missionSurfaceRest() { return this.mission.missionSurfaceRest; }
  set missionSurfaceRest(value) { this.mission.missionSurfaceRest = value; }
  get missionDormant() { return this.mission.missionDormant; }
  set missionDormant(value) { this.mission.missionDormant = value; }
  get missionTrainReady() { return this.mission.missionTrainReady; }
  set missionTrainReady(value) { this.mission.missionTrainReady = value; }
  get missionCombatAlert() { return this.mission.missionCombatAlert; }
  set missionCombatAlert(value) { this.mission.missionCombatAlert = value; }
  get pressurePhaseId() { return this.mission.pressurePhaseId; }
  set pressurePhaseId(value) { this.mission.pressurePhaseId = value; }
  get missionFireGroup() { return this.mission.missionFireGroup; }
  set missionFireGroup(value) { this.mission.missionFireGroup = value; }
  get missionTactic() { return this.mission.missionTactic; }
  set missionTactic(value) { this.mission.missionTactic = value; }
  get missionAssault() { return this.mission.missionAssault; }
  set missionAssault(value) { this.mission.missionAssault = value; }
  get missionGrenadeEvade() { return this.mission.missionGrenadeEvade; }
  set missionGrenadeEvade(value) { this.mission.missionGrenadeEvade = value; }
  get missionGrenadeGoal() { return this.mission.missionGrenadeGoal; }
  set missionGrenadeGoal(value) { this.mission.missionGrenadeGoal = value; }
  get missionCoverWaiting() { return this.mission.missionCoverWaiting; }
  set missionCoverWaiting(value) { this.mission.missionCoverWaiting = value; }
  get missionRearGapM() { return this.mission.missionRearGapM; }
  set missionRearGapM(value) { this.mission.missionRearGapM = value; }
  get missionNaturalMarch() { return this.mission.missionNaturalMarch; }
  set missionNaturalMarch(value) { this.mission.missionNaturalMarch = value; }
  get missionCoverApproach() { return this.mission.missionCoverApproach; }
  set missionCoverApproach(value) { this.mission.missionCoverApproach = value; }
  get missionWatch() { return this.mission.missionWatch; }
  set missionWatch(value) { this.mission.missionWatch = value; }
  get missionCoverBounds() { return this.mission.missionCoverBounds; }
  set missionCoverBounds(value) { this.mission.missionCoverBounds = value; }
  get missionCoverPassed() { return this.mission.missionCoverPassed; }
  set missionCoverPassed(value) { this.mission.missionCoverPassed = value; }
  get missionContactPost() { return this.mission.missionContactPost; }
  set missionContactPost(value) { this.mission.missionContactPost = value; }
  get missionGuideWaiting() { return this.mission.missionGuideWaiting; }
  set missionGuideWaiting(value) { this.mission.missionGuideWaiting = value; }
  get missionDamageSequence() { return this.mission.missionDamageSequence; }
  set missionDamageSequence(value) { this.mission.missionDamageSequence = value; }
  get missionLastHealth() { return this.mission.missionLastHealth; }
  set missionLastHealth(value) { this.mission.missionLastHealth = value; }
  get missionGuideGesture() { return this.mission.missionGuideGesture; }
  set missionGuideGesture(value) { this.mission.missionGuideGesture = value; }
  get missionNestGuardInit() { return this.mission.missionNestGuardInit; }
  set missionNestGuardInit(value) { this.mission.missionNestGuardInit = value; }
  get missionContactAt() { return this.mission.missionContactAt; }
  set missionContactAt(value) { this.mission.missionContactAt = value; }
  get missionContactUntil() { return this.mission.missionContactUntil; }
  set missionContactUntil(value) { this.mission.missionContactUntil = value; }
  get missionEndCast() { return this.mission.missionEndCast; }
  set missionEndCast(value) { this.mission.missionEndCast = value; }
  get missionContactBound() { return this.mission.missionContactBound; }
  set missionContactBound(value) { this.mission.missionContactBound = value; }
  get missionGeng() { return this.mission.missionGeng; }
  set missionGeng(value) { this.mission.missionGeng = value; }
  get missionSortie() { return this.mission.missionSortie; }
  set missionSortie(value) { this.mission.missionSortie = value; }
  get missionContactResumeAt() { return this.mission.missionContactResumeAt; }
  set missionContactResumeAt(value) { this.mission.missionContactResumeAt = value; }
  get missionGrenadeReplanAt() { return this.mission.missionGrenadeReplanAt; }
  set missionGrenadeReplanAt(value) { this.mission.missionGrenadeReplanAt = value; }
  get missionIncomingAt() { return this.mission.missionIncomingAt; }
  set missionIncomingAt(value) { this.mission.missionIncomingAt = value; }
  get missionDangerUntil() { return this.mission.missionDangerUntil; }
  set missionDangerUntil(value) { this.mission.missionDangerUntil = value; }
  get missionHideWeapon() { return this.mission.missionHideWeapon; }
  set missionHideWeapon(value) { this.mission.missionHideWeapon = value; }
  get missionReach() { return this.mission.missionReach; }
  set missionReach(value) { this.mission.missionReach = value; }
  get missionCarriageAction() { return this.mission.missionCarriageAction; }
  set missionCarriageAction(value) { this.mission.missionCarriageAction = value; }
  // opening：开场分镜导演（opening*）
  get openingShown() { return this.opening.openingShown; }
  set openingShown(value) { this.opening.openingShown = value; }
  get openingNotShown() { return this.opening.openingNotShown; }
  set openingNotShown(value) { this.opening.openingNotShown = value; }
  get openingStoryboardPose() { return this.opening.openingStoryboardPose; }
  set openingStoryboardPose(value) { this.opening.openingStoryboardPose = value; }
  get openingStoryboardLast() { return this.opening.openingStoryboardLast; }
  set openingStoryboardLast(value) { this.opening.openingStoryboardLast = value; }
  get openingStoryboardTravel() { return this.opening.openingStoryboardTravel; }
  set openingStoryboardTravel(value) { this.opening.openingStoryboardTravel = value; }
  get openingStoryboardHidden() { return this.opening.openingStoryboardHidden; }
  set openingStoryboardHidden(value) { this.opening.openingStoryboardHidden = value; }
  get openingStoryboardYaw() { return this.opening.openingStoryboardYaw; }
  set openingStoryboardYaw(value) { this.opening.openingStoryboardYaw = value; }
  get openingStoryboardAim() { return this.opening.openingStoryboardAim; }
  set openingStoryboardAim(value) { this.opening.openingStoryboardAim = value; }
  get openingStoryboardCrouch() { return this.opening.openingStoryboardCrouch; }
  set openingStoryboardCrouch(value) { this.opening.openingStoryboardCrouch = value; }
  get openingPace() { return this.opening.openingPace; }
  set openingPace(value) { this.opening.openingPace = value; }
  get openingTurnRate() { return this.opening.openingTurnRate; }
  set openingTurnRate(value) { this.opening.openingTurnRate = value; }
  get openingRerooted() { return this.opening.openingRerooted; }
  set openingRerooted(value) { this.opening.openingRerooted = value; }
  get openingNoBlend() { return this.opening.openingNoBlend; }
  set openingNoBlend(value) { this.opening.openingNoBlend = value; }
  get openingActorPerformance() { return this.opening.openingActorPerformance; }
  set openingActorPerformance(value) { this.opening.openingActorPerformance = value; }
  get openingAdopted() { return this.opening.openingAdopted; }
  set openingAdopted(value) { this.opening.openingAdopted = value; }
  get openingPlay() { return this.opening.openingPlay; }
  set openingPlay(value) { this.opening.openingPlay = value; }
  get openingWalk() { return this.opening.openingWalk; }
  set openingWalk(value) { this.opening.openingWalk = value; }
  get openingDoomed() { return this.opening.openingDoomed; }
  set openingDoomed(value) { this.opening.openingDoomed = value; }
  // cast：演员与说话身份
  get actorKind() { return this.cast.actorKind; }
  set actorKind(value) { this.cast.actorKind = value; }
  get actorVariant() { return this.cast.actorVariant; }
  set actorVariant(value) { this.cast.actorVariant = value; }
  get castId() { return this.cast.castId; }
  set castId(value) { this.cast.castId = value; }
  get speakerRole() { return this.cast.speakerRole; }
  set speakerRole(value) { this.cast.speakerRole = value; }
  // presentation：表现层回写的状态
  get renderLod() { return this.presentation.renderLod; }
  set renderLod(value) { this.presentation.renderLod = value; }
  // remains：尸体、遗物与断肢
  get corpse() { return this.remains.corpse; }
  set corpse(value) { this.remains.corpse = value; }
  get deathPush() { return this.remains.deathPush; }
  set deathPush(value) { this.remains.deathPush = value; }
  get corpseSettled() { return this.remains.corpseSettled; }
  set corpseSettled(value) { this.remains.corpseSettled = value; }
  get corpseTiltX() { return this.remains.corpseTiltX; }
  set corpseTiltX(value) { this.remains.corpseTiltX = value; }
  get corpseTiltZ() { return this.remains.corpseTiltZ; }
  set corpseTiltZ(value) { this.remains.corpseTiltZ = value; }
  get corpseDroopBody() { return this.remains.corpseDroopBody; }
  set corpseDroopBody(value) { this.remains.corpseDroopBody = value; }
  get corpseDroopArms() { return this.remains.corpseDroopArms; }
  set corpseDroopArms(value) { this.remains.corpseDroopArms = value; }
  get corpseSlidePX() { return this.remains.corpseSlidePX; }
  set corpseSlidePX(value) { this.remains.corpseSlidePX = value; }
  get corpseSlidePZ() { return this.remains.corpseSlidePZ; }
  set corpseSlidePZ(value) { this.remains.corpseSlidePZ = value; }
  get corpseStallT() { return this.remains.corpseStallT; }
  set corpseStallT(value) { this.remains.corpseStallT = value; }
  get corpseDetourX() { return this.remains.corpseDetourX; }
  set corpseDetourX(value) { this.remains.corpseDetourX = value; }
  get corpseDetourZ() { return this.remains.corpseDetourZ; }
  set corpseDetourZ(value) { this.remains.corpseDetourZ = value; }
  get corpseDetourT() { return this.remains.corpseDetourT; }
  set corpseDetourT(value) { this.remains.corpseDetourT = value; }
  get corpseSlideT() { return this.remains.corpseSlideT; }
  set corpseSlideT(value) { this.remains.corpseSlideT = value; }
  get drop() { return this.remains.drop; }
  set drop(value) { this.remains.drop = value; }
  get gore() { return this.remains.gore; }
  set gore(value) { this.remains.gore = value; }
  get goreRnd() { return this.remains.goreRnd; }
  set goreRnd(value) { this.remains.goreRnd = value; }
  // 标签：旧字段名 → soldier.tags 的位（读出来是真 / 假）
  get dummy() { return (this.tags & 1) !== 0; }
  set dummy(value) { this.tags = value ? this.tags | 1 : this.tags & ~1; }
  get towel() { return (this.tags & 2) !== 0; }
  set towel(value) { this.tags = value ? this.tags | 2 : this.tags & ~2; }
  get unarmed() { return (this.tags & 4) !== 0; }
  set unarmed(value) { this.tags = value ? this.tags | 4 : this.tags & ~4; }
  get scriptedNoncombatant() { return (this.tags & 8) !== 0; }
  set scriptedNoncombatant(value) { this.tags = value ? this.tags | 8 : this.tags & ~8; }
  get scriptEssential() { return (this.tags & 16) !== 0; }
  set scriptEssential(value) { this.tags = value ? this.tags | 16 : this.tags & ~16; }
  get missionUntargetable() { return (this.tags & 32) !== 0; }
  set missionUntargetable(value) { this.tags = value ? this.tags | 32 : this.tags & ~32; }
  get meleeDormant() { return (this.tags & 64) !== 0; }
  set meleeDormant(value) { this.tags = value ? this.tags | 64 : this.tags & ~64; }
  get wounded() { return (this.tags & 128) !== 0; }
  set wounded(value) { this.tags = value ? this.tags | 128 : this.tags & ~128; }
  /** 有没有这个标签（名字见 Data_SoldierComponents.SOLDIER_TAGS）。 */
  HasTag(tag) { return (this.tags & SOLDIER_TAG_BITS[tag]) !== 0; }
  SetTag(tag, on) {
    const bit = SOLDIER_TAG_BITS[tag];
    if (!bit) throw new Error(`Soldier: unknown tag ${tag}`);
    this.tags = on ? this.tags | bit : this.tags & ~bit;
  }
  TagList() { return Object.keys(SOLDIER_TAG_BITS).filter((tag) => this.HasTag(tag)); }
}
