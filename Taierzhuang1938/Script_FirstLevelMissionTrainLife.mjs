// Authored carriage performances on the production skeleton. No world-root motion.
// Restore every edited transform before the next mixer sample; no accumulated FK drift.
import * as THREE from "three";
import { PRONE_SUPPORT } from "./Data_Tuning_ActorIdle.mjs";
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Internal temporaries (2026-09-08 heap probe: 41 riders at 60 Hz made ~150 KB of clone()
// garbage per frame here). World() / Local() still hand out fresh vectors because callers
// keep them across further calls; everything Aim / Chain / Tilt use for themselves lives in
// these scratch objects, and saved transforms are pooled records.
const _v = Array.from({ length: 8 }, () => new THREE.Vector3());
const _q = Array.from({ length: 4 }, () => new THREE.Quaternion());
const _recordPool = [];
export class MissionTrainLifePose {
  constructor(soldier) { this.soldier = soldier; this.rig = soldier.actor.characterRig; this.saved = new Map(); this.time = 0; }
  Save(node) {
    if (!node || this.saved.has(node)) return;
    const record = _recordPool.pop() || { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    record.p.copy(node.position); record.q.copy(node.quaternion); record.s.copy(node.scale);
    this.saved.set(node, record);
  }
  Restore() {
    for (const [node, pose] of this.saved) { node.position.copy(pose.p); node.quaternion.copy(pose.q); node.scale.copy(pose.s); _recordPool.push(pose); }
    this.animation?.Restore();
    this.saved.clear(); this.rig.missionTrainLifeActive = false;
  }
  World(node) { return node.getWorldPosition(new THREE.Vector3()); }
  Local(x,y,z) { return this.basis.localToWorld(new THREE.Vector3(x,y,z)); }
  Aim(bone, child, point) {
    this.Save(bone);
    const start=bone.getWorldPosition(_v[0]), from=child.getWorldPosition(_v[1]).sub(start).normalize(), to=_v[2].copy(point).sub(start).normalize();
    const correction=_q[0].setFromUnitVectors(from,to);
    const world=bone.getWorldQuaternion(_q[1]).premultiply(correction);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(_q[2]).invert().multiply(world));
    bone.updateWorldMatrix(false,false);
  }
  Chain(a,b,c,target,pole) {
    const start=a.getWorldPosition(_v[3]), middle=b.getWorldPosition(_v[4]), end=c.getWorldPosition(_v[5]);
    const l1=start.distanceTo(middle), l2=middle.distanceTo(end), delta=_v[6].copy(target).sub(start);
    const distance=Clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.001), forward=delta.normalize();
    const bend=_v[7].copy(pole).sub(start); bend.addScaledVector(forward,-bend.dot(forward)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    // knee reuses the middle slot: middle is not read again after l1 / l2.
    const knee=middle.copy(start).addScaledVector(forward,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    this.Aim(a,b,knee); this.Aim(b,c,target);
  }
  Tilt(node, x, y, z) {
    if (!node) return;
    this.Save(node);
    const axis=_v[0], basisWorld=this.basis.getWorldQuaternion(_q[3]);
    for (const [v,ax,ay,az] of [[x,1,0,0],[y,0,1,0],[z,0,0,1]]) if(v) {
      axis.set(ax,ay,az).applyQuaternion(basisWorld);
      const world=node.getWorldQuaternion(_q[0]).premultiply(_q[1].setFromAxisAngle(axis,v));
      node.quaternion.copy(node.parent.getWorldQuaternion(_q[2]).invert().multiply(world));
    }
  }
  // Kept as the opening-pose adapter hook. The normal character sampler already
  // restores its own floor correction once the carriage clip releases.
  GroundReleasedPose(){return false;}
  ApplyProne(state){
    const rig=this.rig,b=rig.bones,c=PRONE_SUPPORT;
    if(this.soldier.missionCarriageAction||this.soldier.missionTrainLife?.weight>.00001)return false;
    if(!(state.prone>.45)||state.dead||state.meleeCombat||rig.forcedClip||!rig.kind.startsWith("nra"))return false;
    this.basis=this.soldier.actor.root;
    this.proneTracks ||= rig.clipById.get(c.sourceClip).tracks.map(track=>{
      const dot=track.name.lastIndexOf("."),node=rig.root.getObjectByName(track.name.slice(0,dot));
      return {node,property:track.name.slice(dot+1),sample:track.createInterpolant()};
    }).filter(track=>track.node);
    for(const {node,property,sample} of this.proneTracks){this.Save(node);node[property].fromArray(sample.evaluate(c.sourceTime));}
    this.basis.updateWorldMatrix(true,true);
    const handRotations=['L','R'].map(side=>b['hand'+side].getWorldQuaternion(new THREE.Quaternion()));
    this.Tilt(b.pelvis,c.torsoRollRad,0,0);
    const pelvis=this.basis.worldToLocal(this.World(b.pelvis)),shift=this.Local(0,c.pelvisM-pelvis.y,c.pelvisZ-pelvis.z).sub(this.Local(0,0,0));
    this.Save(rig.root);rig.root.position.copy(rig.root.parent.worldToLocal(this.World(rig.root).add(shift)));
    rig.root.updateWorldMatrix(true,true);
    for(const [i,side] of ['L','R'].entries()){
      const sign=side==='L'?-1:1;
      this.Chain(b['thigh'+side],b['calf'+side],b['foot'+side],this.Local(sign*c.footX,c.footY,c.footZ),this.Local(sign*.38,.04,.5));
      this.Chain(b['upperArm'+side],b['forearm'+side],b['hand'+side],this.Local(sign*c.handX,c.handY,c.handZ),this.Local(sign*.55,.12,-.35));
      this.Save(b['hand'+side]);b['hand'+side].quaternion.copy(b['hand'+side].parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handRotations[i]));
    }
    this.Tilt(b.head,c.headLiftRad,0,0);
    rig.root.updateWorldMatrix(true,true);rig.p012ProneSupported=true;
    return true;
  }
  Apply(dt,state) {
    const soldier=this.soldier,life=soldier.missionTrainLife,rig=this.rig;
    const performance=soldier.missionCarriageAction;
    if(!soldier.alive||state.dead||soldier.actor.ragdollState)return false;
    if(!performance&&(!life||life.weight<=.00001||soldier.missionTrainReady||rig.forcedClip||soldier.missionTrainWalkSpeed>.025
      ||state.firing||state.carryRole||state.meleeCombat))return false;
    // A near-shell recovery is independent of the retired carriage idle and AI stance.
    // The sampler owns only original-rig bones, never the Actor/Soldier world root.
    const animation=rig.firstLevelCarriageAnimation;
    if(!animation){
      if(life){life.animationEnabled=false;life.animationPending=true;}
      rig.missionTrainLifeState={animation:false,pending:true,action:performance?.clipId||life?.action};
      return false;
    }
    if(life){life.animationEnabled=true;life.animationPending=false;}
    this.time+=Math.max(0,dt);this.basis=soldier.actor.root;this.animation=animation;
    let selected=performance;
    if(!selected){
      const dialogue=life.action==='AlarmDropCrouch'?null:life.dialogueAction;
      selected=dialogue||{clipId:life.action,seconds:life.actionSeconds,loop:life.actionLoop!==false};
    }
    const clipId=selected.clipId,seconds=Math.max(0,selected.seconds||0),weight=Clamp(selected.weight??life?.weight??1,0,1);
    // Returning to idle samples a moving authored clip; no frozen frame or FK gesture
    // is used as a substitute for a missing carriage animation asset.
    animation.Sample(clipId,seconds,{weight,loop:selected.loop!==false,deckY:selected.deckY??life?.deckY??soldier.position.y,
      transitionSeconds:selected.transitionSeconds});
    const wallOffsetM=!performance&&life?.wall?MISSION_TRAIN.life.wallOffsetM*weight:0;
    if(wallOffsetM){
      this.Save(rig.root);
      this.basis.updateWorldMatrix(true,false);
      const offset=this.Local(0,0,wallOffsetM).sub(this.Local(0,0,0));
      rig.root.position.copy(rig.root.parent.worldToLocal(this.World(rig.root).add(offset)));
    }
    rig.root.updateWorldMatrix(true,true);
    rig.missionTrainLifeActive=true;
    rig.missionTrainLifeState={kind:life?.kind,seated:false,posture:life?.posture,weight,brace:life?.brace||0,time:this.time,
      animation:true,pending:false,action:clipId,sourceSeconds:seconds,riseSeconds:life?.riseSeconds||0,poseWeight:weight,wallOffsetM};
    return true;
  }
}
