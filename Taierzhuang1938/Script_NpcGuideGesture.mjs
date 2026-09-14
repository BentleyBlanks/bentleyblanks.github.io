import { MissionTrainLifePose } from "./Script_FirstLevelMissionTrainLife.mjs";
import { MISSION_GUIDE_TUNING as G } from "./Data_Tuning_MissionGuide.mjs";

// Apply AFTER the actor's normal pose and weapon mounting. Only the free left
// arm changes: the rifle stays on the right hand in its sampled low-ready pose.
// Restore BEFORE the next sample, so there is no accumulated IK or weapon drift.
export function InstallNpcGuideGesture(soldier) {
  const actor=soldier?.actor,rig=actor?.characterRig;
  if(!rig||actor.npcGuideGesture)return;
  const pose=new MissionTrainLifePose(soldier),original=actor.Update;
  let elapsed=0,weight=0;
  actor.npcGuideGesture={weight:0,Restore(){pose.Restore();weight=0;elapsed=0;this.weight=0;}};
  actor.Update=function UpdateNpcGuideGesture(dt,state={}) {
    pose.Restore();
    const result=original.call(this,dt,state);
    const safe=soldier.alive&&!state.dead&&!state.firing&&!state.carryRole&&!state.meleeCombat
      &&!(state.moveSpeed>G.gestureMoveThreshold)&&!soldier.targetVisible
      &&!(soldier.suppression>G.threatSuppression)&&!soldier.missionGrenadeEvade
      &&!soldier.missionCarriageAction&&!soldier.missionRescueTarget&&!rig.forcedClip;
    const desired=safe&&soldier.missionGuideGesture?1:0;
    if(!safe)weight=0;
    else weight+=Math.max(-dt/G.gestureBlendS,Math.min(dt/G.gestureBlendS,desired-weight));
    if(desired)elapsed+=dt;else if(weight===0)elapsed=0;
    actor.npcGuideGesture.weight=weight;
    if(weight<=0)return result;
    pose.basis=actor.root;
    actor.root.updateWorldMatrix(true,true);
    const b=rig.bones,hand=G.gestureHand,pole=G.gesturePole;
    const target=pose.World(b.handL).lerp(pose.Local(hand.x,hand.y,
      hand.z+Math.sin(elapsed*Math.PI*2*G.gestureHz)*G.gesturePullM),weight);
    pose.Chain(b.upperArmL,b.forearmL,b.handL,target,pose.Local(pole.x,pole.y,pole.z));
    rig.root.updateWorldMatrix(true,true);
    return result;
  };
}
