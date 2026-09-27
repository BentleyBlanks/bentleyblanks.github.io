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

export function SelectAllyGait(soldier, state, id, readySeconds = 0) {
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
  if (!low && moving && speed <= C.walkMaximumMps && ['RifleRun','BackRifleRun'].includes(id)) return 'AllyCarryWalk';
  if (!low && !moving && id === 'AdvanceFire') return 'AllyCarryStand';
  return id;
}
