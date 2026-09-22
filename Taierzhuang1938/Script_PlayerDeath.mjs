import * as THREE from "three";
import { PLAYER_DEATH as D } from "./Data_Tuning_PlayerDeath.mjs";

const Smooth = (value) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t*t*(3-2*t); };
const Pose = node => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone() });
const Restore = pose => { pose.node.position.copy(pose.position); pose.node.quaternion.copy(pose.quaternion); };

function Floor(player, x, z) {
  return player.physics?.GroundProbe?.(x,z,player.position.y,.12,4)?.y
    ?? player.world.GroundHeight(x,z);
}

export function CapturePlayerDeath(player) {
  const camera = player.camera;
  player.deathCameraStart.copy(camera.position);
  player.deathStartYaw = camera.rotation.y;
  player.deathStartPitch = camera.rotation.x;
  player.deathStartRoll = camera.rotation.z;
  player.deathFallSide = player.rnd() < .5 ? -1 : 1;
  const height = Math.max(0,camera.position.y - Floor(player,camera.position.x,camera.position.z));
  player.deathTimeScale = THREE.MathUtils.lerp(D.proneTimeScale,1,Smooth((height-.42)/1.2));
  player.deathImpactPlayed = false;
}

export function DeathTime(player) { return player.deadTime / (player.deathTimeScale || 1); }
export function DeathReveal(player) { return Smooth((DeathTime(player)-D.durationS)/D.menuFadeS); }
export function DeathDof(player) { return Smooth((DeathTime(player)-D.dofStartS)/D.dofFadeS); }

export function SyncPlayerDeathCamera(player) {
  const t = DeathTime(player), camera = player.camera, side = player.deathFallSide;
  // A short knee buckle precedes the accelerating fall. Impact is a separate,
  // damped contact beat, not an easing curve that slows down above the ground.
  const buckle = Smooth(t / D.buckleS);
  const fall = THREE.MathUtils.clamp((t-D.buckleS)/(D.impactS-D.buckleS),0,1);
  const drop = .15*buckle + .85*fall*fall;
  const roll = .08*buckle + .92*Smooth(fall);
  const contact = THREE.MathUtils.clamp((t-D.impactS)/(D.durationS-D.impactS),0,1);
  const bounce = Math.sin(contact*Math.PI*2)*(1-contact)*D.bounceM;
  const yaw = player.deathStartYaw;
  const desired = player.deathCameraStart.clone();
  desired.x += (-Math.cos(yaw)*side*D.sideTravelM-Math.sin(yaw)*D.forwardTravelM)*drop;
  desired.z += (Math.sin(yaw)*side*D.sideTravelM-Math.cos(yaw)*D.forwardTravelM)*drop;
  const floor = Floor(player,desired.x,desired.z);
  desired.y = Math.max(floor+D.clearanceM,
    THREE.MathUtils.lerp(player.deathCameraStart.y,floor+D.eyeHeightM,drop)+bounce);
  // Resolve lateral clearance at the falling eye height. A diagonal sweep
  // would pin the head halfway up a wall instead of letting it fall alongside it.
  const origin = player.deathCameraStart.clone(); origin.y = desired.y;
  const direction = desired.clone().sub(origin);
  const length = direction.length();
  const hit = length > .001 && (player.physics || player.world).Raycast?.(
    origin,direction.clone().normalize(),length,{terrain:true});
  if (hit && hit.t < length) desired.copy(origin)
    .addScaledVector(direction.normalize(),Math.max(0,hit.t-D.clearanceM));
  desired.y = Math.max(desired.y,Floor(player,desired.x,desired.z)+D.clearanceM);
  camera.position.copy(desired);
  camera.rotation.set(
    THREE.MathUtils.lerp(player.deathStartPitch,D.pitchRad,drop)-.12*Math.sin(fall*Math.PI),
    yaw+side*D.yawRad*drop,
    THREE.MathUtils.lerp(player.deathStartRoll,side*D.rollRad,roll)+side*bounce*2,"YXZ");
}

/** Animate the actual held weapon and its two-bone arm IK, preserving frame zero. */
export function BeginDeathHands(vm) {
  ResetDeathHands(vm);
  const nodes = [vm.root,vm.wallPivot,vm.handLeft.group];
  vm.riggedArms?.root.traverse(node => { if (node.isBone) nodes.push(node); });
  vm.deathHands = { poses:nodes.map(Pose), visible:vm.root.visible,
    contact:vm.riggedArms ? {...vm.riggedArms.contactWeight} : null,
    operation:vm.riggedArms ? {...vm.riggedArms.operationPose} : null };
  vm.flash.visible = false;
  if (vm.body) vm.body.root.visible = false;
}

export function UpdateDeathHands(vm,player) {
  if (!vm.deathHands) BeginDeathHands(vm);
  const state = vm.deathHands, t = DeathTime(player);
  const sag = Smooth((t-D.handsStartS)/(D.handsEndS-D.handsStartS));
  const left = state.poses[2];
  for (const pose of state.poses) Restore(pose);
  vm.root.visible = state.visible && t < D.handsEndS;
  if (!vm.root.visible) return;
  vm.root.position.y -= D.handsDropM*sag;
  vm.root.rotation.z += player.deathFallSide*.2*sag;
  vm.wallPivot.rotation.x += D.gunPitchRad*sag;
  vm.wallPivot.rotation.z += player.deathFallSide*D.gunRollRad*sag;
  vm.wallPivot.position.y -= D.gunDropM*sag;
  // The support hand loses its grip before both arms leave the bottom edge.
  left.node.position.y -= .12*sag;
  left.node.position.x -= .06*sag;
  if (vm.riggedArms) {
    vm.riggedArms.SetContactWeight("l",1-sag);
    vm._rootMatrixFresh = false;
    vm.root.updateWorldMatrix(true,true);
    vm.riggedArms.Update(0);
    // Blend away from the actual skeletal/reload pose instead of snapping to IK.
    const blend = Smooth(t/.26);
    for (const pose of state.poses.slice(3)) {
      pose.node.position.lerpVectors(pose.position,pose.node.position,blend);
      pose.node.quaternion.slerpQuaternions(pose.quaternion,pose.node.quaternion,blend);
    }
  }
  vm._rootMatrixFresh = false;
  vm._UpdateSleeves();
}

export function ResetDeathHands(vm) {
  const state = vm.deathHands;
  if (!state) return;
  for (const pose of state.poses) Restore(pose);
  if (vm.riggedArms && state.contact) {
    Object.assign(vm.riggedArms.contactWeight,state.contact);
    Object.assign(vm.riggedArms.operationPose,state.operation);
  }
  vm.deathHands = null;
  vm._rootMatrixFresh = false;
}
