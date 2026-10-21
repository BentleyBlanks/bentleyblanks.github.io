import { ALLY_GAIT as C } from './Data_Tuning_AllyGait.mjs';

// missionCombatAlert: the mission says the danger is there without a rifleman in sight (FirstLevelFrontBattle: a live
// enemy tank on the field). No carry for that man until it drops.
export function AllyGaitThreat(soldier, state) {
  return !!(state.firing || state.fire > 0 || soldier.missionGrenadeEvade || soldier.missionCombatAlert
    || soldier.suppression > C.suppressionReady
    || (soldier.targetVisible && !soldier.targetFromMemory && !soldier.missionFireHold));
}

// Crouched gait by speed (3A gait selection with hysteresis): true = the crouch walk, false = the creep.
export function CrouchWalkBySpeed(speedMps, walking = false) {
  return speedMps > (walking ? C.crouchSlowBelowMps : C.crouchFastAboveMps);
}

// The fast calm run by speed with hysteresis and a hold (the same shape as RelaxedGait's walk/run switch).
// `memory` is { running, frames } kept by the caller per man; it is updated here.
export function HoldRunBySpeed(speedMps, memory) {
  const wants = speedMps > (memory.running ? C.holdRunBelowMps : C.holdRunAboveMps);
  memory.frames = wants !== !!memory.running ? (memory.frames || 0) + 1 : 0;
  if (memory.frames >= C.holdRunSwitchFrames) { memory.running = wants; memory.frames = 0; }
  return !!memory.running;
}

// The shoulder march by speed with hysteresis and a hold (the walking band below walkMaximumMps). `memory` is { running, frames }.
export function MarchBySpeed(speedMps, memory) {
  if (speedMps > C.marchHardMaxMps) { memory.running = false; memory.frames = 0; return false; }   // a real run leaves at once
  const wants = speedMps > (memory.running ? C.marchBelowMps : C.marchAboveMps) && speedMps <= C.walkMaximumMps;
  memory.frames = wants !== !!memory.running ? (memory.frames || 0) + 1 : 0;
  if (memory.frames >= C.marchSwitchFrames) { memory.running = wants; memory.frames = 0; }
  return !!memory.running;
}

// Nearest person in the lane behind a man (the way his muzzle points when the rifle rides on his shoulder): the distance
// to the closest of `others` ({ position:{x,z} } or {x,z}) that lies behind him and within laneM of his back line.
// yaw is the actor's heading (facing is (-sin yaw, -cos yaw)). 99 when the lane is empty.
export function RearGapM(position, yaw, others, laneM = C.marchRearLaneM) {
  const rx = Math.sin(yaw), rz = Math.cos(yaw);
  let gap = 99;
  for (const other of others) {
    if (!other || other.alive === false) continue;
    const p = other.position || other, dx = p.x - position.x, dz = p.z - position.z;
    if (dx * rx + dz * rz <= 0 || Math.abs(dx * rz - dz * rx) >= laneM) continue;
    gap = Math.min(gap, Math.hypot(dx, dz));
  }
  return gap;
}

// May this man march with the rifle on his shoulder right now? `march` = { status, talking } from the caller (see Script_AllyGait):
// status of his fresh shared-march command (null when there is none), talking = a speaker gesture is playing.
export function ShoulderMarchAllowed(soldier, march) {
  return march.status === 'running' && !march.talking && soldier.missionRearGapM >= C.marchRearClearM;
}

// `holdRun` (optional) is the caller's { running, frames } memory for the fast calm run; without it RifleHoldRun is off.
// `march` (optional) is the caller's { running, frames, status, talking } for the shoulder march; without it RifleShoulderMarch is off.
export function SelectAllyGait(soldier, state, id, readySeconds = 0, holdRun = null, march = null) {
  if (soldier.p012AwaitingWeapon || soldier.relaxedGait || soldier.openingActorPerformance
      || soldier.openingStoryboardPose || soldier.openingStoryboardTravel != null
      || soldier.missionRescueTarget || state.dead || state.carryRole || state.meleeCombat
      || state.prone > .35 || state.kneel > .35 || state.woundedWalk > .5
      || state.throwing > .08 || state.reach > .08 || state.melee > .08 || state.binoculars > .08
      || state.grounded === false) return id;
  const speed = state.moveSpeedMps ?? (state.moveSpeed || 0) * 3.6;
  const low = state.crouch > .35, moving = speed > C.movingMps;
  const ready = readySeconds > 0 || AllyGaitThreat(soldier, state);
  if (low && moving && id === 'RifleCrouchAdvance') return ready ? 'AllyCrouchReady' : 'AllyCrouchCarry';
  if (ready) return id;
  if (low && !moving && ['StandToKneel','KneelHold','RifleCrouchAdvance','KneelToStand'].includes(id)) return 'AllyCrouchCarryStand';
  if (march) {
    // Only the ordinary run of a man the march layer is walking along a route; anything else lets the memory go.
    if (!low && id === 'RifleRun' && ShoulderMarchAllowed(soldier, march)) { if (MarchBySpeed(speed, march)) return 'RifleShoulderMarch'; }
    else { march.running = false; march.frames = 0; }
  }
  if (!low && moving && speed <= C.walkMaximumMps && ['RifleRun','BackRifleRun'].includes(id)) return 'AllyCarryWalk';
  if (!low && !moving && id === 'AdvanceFire') return 'AllyCarryStand';
  if (!low && holdRun && id === 'RifleRun' && HoldRunBySpeed(speed, holdRun)) return 'RifleHoldRun';
  return id;
}
