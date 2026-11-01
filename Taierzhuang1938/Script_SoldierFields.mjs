// 生成，勿改。来源 Data_SoldierComponents.mjs；重新生成：node Taierzhuang1938/Script_SoldierComponentsTest.mjs --write
//
// Soldier 的旧字段名 → 组件里的同名字段（docs/Data_EnemyAi.md §22）。写成字面量存取器而不是循环 defineProperty：
// V8 能把它内联进调用处，热路径上的读写只多一次取址；循环里用变量当键会慢五倍。

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
  // scripted：关卡与测试场挂的开关
  get dummy() { return this.scripted.dummy; }
  set dummy(value) { this.scripted.dummy = value; }
  get towel() { return this.scripted.towel; }
  set towel(value) { this.scripted.towel = value; }
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
}
