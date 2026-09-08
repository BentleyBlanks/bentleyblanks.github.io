// Opt-in procedural carriage activities over a stable sampled pose. No world-root motion.
// Restore every edited transform before the next mixer sample; no accumulated FK drift.
import { MISSION_TRAIN } from "./Data_FirstLevelMissionTrain.mjs";
const C = MISSION_TRAIN.life;
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export class MissionTrainLifePose {
  constructor(soldier) { this.soldier = soldier; this.rig = soldier.actor.characterRig; this.saved = new Map(); this.time = 0; }
  Save(node) { if (node && !this.saved.has(node)) this.saved.set(node, {p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()}); }
  Restore() {
    for (const [node, pose] of this.saved) { node.position.copy(pose.p); node.quaternion.copy(pose.q); node.scale.copy(pose.s); }
    this.animation?.Restore();
    this.saved.clear(); this.rig.missionTrainLifeActive = false;
  }
  World(node) { return node.getWorldPosition(node.position.clone()); }
  Local(x,y,z) { return this.basis.localToWorld(this.basis.position.clone().set(x,y,z)); }
  Aim(bone, child, point) {
    this.Save(bone);
    const start=this.World(bone), from=this.World(child).sub(start).normalize(), to=point.clone().sub(start).normalize();
    const correction=bone.quaternion.clone().setFromUnitVectors(from,to);
    const world=bone.getWorldQuaternion(bone.quaternion.clone()).premultiply(correction);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(bone.quaternion.clone()).invert().multiply(world));
    bone.updateWorldMatrix(false,false);
  }
  Chain(a,b,c,target,pole) {
    const start=this.World(a), middle=this.World(b), end=this.World(c);
    const l1=start.distanceTo(middle), l2=middle.distanceTo(end), delta=target.clone().sub(start);
    const distance=Clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.001), forward=delta.normalize();
    const bend=pole.clone().sub(start); bend.addScaledVector(forward,-bend.dot(forward)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const knee=start.clone().addScaledVector(forward,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    this.Aim(a,b,knee); this.Aim(b,c,target);
  }
  Tilt(node, x, y, z) {
    if (!node) return;
    this.Save(node);
    const axis=this.basis.position.clone();
    for (const [v,a] of [[x,[1,0,0]],[y,[0,1,0]],[z,[0,0,1]]]) if(v) {
      axis.set(...a).applyQuaternion(this.basis.getWorldQuaternion(node.quaternion.clone()));
      const world=node.getWorldQuaternion(node.quaternion.clone()).premultiply(node.quaternion.clone().setFromAxisAngle(axis,v));
      node.quaternion.copy(node.parent.getWorldQuaternion(node.quaternion.clone()).invert().multiply(world));
    }
  }
  SettleReleaseFloor(dt){
    const rig=this.rig,ideal=this.World(rig.bones.pelvis).y;
    // Settle the resulting body height, since the native clip's own floor
    // correction can change while the temporary blend correction is released.
    const lift=Math.max(0,(this.releasePelvisY??ideal)-ideal)*Math.exp(-Math.max(0,dt)/this.animation.config.floorReleaseSeconds);
    if(lift>1e-6){this.Save(rig.root);rig.root.position.y+=lift/this.soldier.actor.root.scale.y;rig.root.updateWorldMatrix(true,true)}
    this.releasePelvisY=this.walkReleaseDone&&lift<=1e-6?null:ideal+lift;
  }
  GroundReleasedPose(state,dt){
    const animation=this.animation,soldier=this.soldier;
    if(!this.walkReleaseDone||!animation?.groundAt||!soldier.alive||state.dead||state.grounded===false
      ||state.prone>.35||state.crouch>.35||state.meleeCombat||this.rig.forcedClip||this.rig.actor?.ragdollState)return;
    const ground=animation.groundAt(soldier.position.x,soldier.position.z);
    const lift=Math.max(0,ground+animation.config.floorClearanceM-animation.FootFloor());
    if(lift>0){this.Save(this.rig.root);this.rig.root.position.y+=lift/soldier.actor.root.scale.y;this.rig.root.updateWorldMatrix(true,true)}
    if(this.releasePelvisY!=null)this.SettleReleaseFloor(dt);
  }
  Apply(dt,state) {
    const life=this.soldier.missionTrainLife, rig=this.rig, b=rig.bones;
    const finishing=life?.animationEnabled&&life.riseSeconds>=rig.firstLevelTrainAnimation.duration&&!this.walkReleaseDone;
    if (!life || (life.weight<=.00001&&!finishing) || !this.soldier.alive || this.soldier.missionTrainReady || rig.forcedClip
      || state.firing || state.carryRole || state.meleeCombat || state.dead || state.prone>.35 || state.crouch>.35) return false;
    if (!['pelvis','chest','head','thighL','calfL','footL','thighR','calfR','footR','upperArmL','forearmL','handL','upperArmR','forearmR','handR'].every(k=>b[k])) return false;
    this.time+=Math.max(0,dt); this.basis=this.soldier.actor.root;
    this.animation=life.animationEnabled?rig.firstLevelTrainAnimation:null;
    const animationState=this.animation?.State(life.riseSeconds||0);
    if(finishing&&(this.walkReleaseStarted||rig.p012ActualSpeedMps>.025)){
      this.walkReleaseStarted=true;
      this.walkReleaseTime=(this.walkReleaseTime||0)+Math.max(0,dt);
    }
    const release=this.animation?Clamp((this.walkReleaseTime||0)/this.animation.config.releaseSeconds,0,1):0;
    const poseWeight=1-release*release*(3-2*release);
    if(finishing&&poseWeight<=0){this.walkReleaseDone=true;return false}
    const weight=life.weight*(animationState?.gestureWeight??1), seated=life.seated?weight:0, brace=life.brace*weight;
    const t=this.time+life.phase*C.gesturePeriodS, cycle=(1-Math.cos(t*2*Math.PI/C.gesturePeriodS))/2;
    // 【2026-09-08 帧成本】子树那一趟只有**没有采样动画**的程序化分支要用
    //（下面 else 里的 this.World(foot/pelvis) 直接读骨头世界矩阵）。走采样动画时
    // FootFloor 的 `updateMatrixWorld(true)` 与 Sample 之后那句
    // `rig.root.updateWorldMatrix(true,true)` 已经把整棵子树更新过，这里再递归一遍
    // 是纯重复：父链仍然更新（第一个参数保持 true），只是不再往下走。
    this.basis.updateWorldMatrix(true,!this.animation);
    if(this.animation){
      const baseFloor=release>0?this.animation.FootFloor():null;
      this.animation.Sample(life.riseSeconds?animationState.seconds:0,poseWeight);
      // Rapier maintains a skin gap above the shared deck. Keep the visible
      // support at that deck while the existing physical body remains untouched.
      rig.root.position.y-=(this.soldier.position.y-life.deckY)/this.basis.scale.y*poseWeight;
      rig.root.updateWorldMatrix(true,true);
      if(release>0){
        // Quaternion blending between a planted stance and a running pose may
        // lower the soles below both endpoints. Preserve the interpolated
        // endpoint clearance, including genuine elevation of the running clip.
        const supportFloor=life.deckY+this.animation.config.floorClearanceM;
        const target=supportFloor*poseWeight+Math.max(supportFloor,baseFloor)*(1-poseWeight);
        // A change of the lowest blended shoe vertex can abruptly release the
        // temporary lift. Let that lift settle while preserving full clearance.
        rig.root.position.y+=Math.max(0,target-this.animation.FootFloor())/this.basis.scale.y;
        rig.root.updateWorldMatrix(true,true);
        this.SettleReleaseFloor(dt);
      }
    }else{
    const feet=['L','R'].map(s=>({s, point:this.World(b['foot'+s]),q:b['foot'+s].getWorldQuaternion(b['foot'+s].quaternion.clone())}));
    const pelvisLocal=this.basis.worldToLocal(this.World(b.pelvis));
    const lower=(pelvisLocal.y-C.seatTopM-C.pelvisAboveSeatM)*seated + .08*brace*(1-seated);
    this.Save(rig.root);
    const shift=this.Local(0,-lower,0).sub(this.Local(0,0,0));
    const current=this.World(rig.root), target=current.add(shift);
    rig.root.position.copy(rig.root.parent.worldToLocal(target));
    // Feet remain on the deck; knees bend towards the aisle as the pelvis meets the bench.
    for (const f of feet) {
      const at=this.basis.worldToLocal(f.point.clone());
      at.z=at.z*(1-seated)-.44*seated;
      const target=this.Local(at.x,at.y,at.z), pole=this.Local(at.x,.55,-1.1);
      this.Chain(b['thigh'+f.s],b['calf'+f.s],b['foot'+f.s],target,pole);
      this.Save(b['foot'+f.s]);
      b['foot'+f.s].quaternion.copy(b['foot'+f.s].parent.getWorldQuaternion(f.q.clone()).invert().multiply(f.q));
    }
    }
    const gestureZ=this.animation?this.basis.worldToLocal(this.World(b.pelvis)).z:0;
    const quiet=1-brace, lean=(life.kind==='Rest'?.10:life.kind==='CountAmmo'?.13:.04)*weight;
    this.Tilt(b.chest,-lean-.14*brace,Math.sin(t*.7)*.035*weight*quiet,Math.sin(t*1.1)*.012*weight*quiet);
    this.Tilt(b.head,life.kind==='Rest'?-.13*weight:-.025*cycle*weight,
      Math.sin(t*.5)*(life.kind==='Lookout'?.24:.07)*weight*quiet,0);
    const chestY=this.basis.worldToLocal(this.World(b.chest)).y;
    const headY=this.basis.worldToLocal(this.World(b.head)).y;
    const activity=life.kind;
    for (const s of ['L','R']) {
      const shoulder=this.basis.worldToLocal(this.World(b['upperArm'+s]));
      const side=Math.sign(shoulder.x), right=s==='R';
      let x=side*.28,y=chestY-.40,z=-.22;
      if(activity==='Rest') { x=side*.18; y=chestY-.42; z=-.32; }
      if(activity==='ShareFood') { x=right?.04:side*.14; y=chestY-.23+cycle*.10; z=right?-.38-cycle*.22:-.33; }
      if(activity==='CountAmmo'||activity==='Gear') { x=side*(.12+cycle*.04); y=chestY-.26; z=-.35+(right?.035*Math.sin(t*2):0); }
      if(activity==='Eat') { x=side*.15; y=right?chestY-.28+cycle*(headY-chestY+.16):chestY-.30; z=right?-.34+cycle*.15:-.33; }
      if(activity==='Talk'&&right) { x=side*(.27+.11*cycle); y=chestY-.32+.19*cycle; z=-.29-.10*cycle; }
      if(activity==='Lookout') { x=side*.28; y=chestY-.42; z=-.02; }
      const calm=this.Local(x,y,z+gestureZ), cover=this.Local(side*.16,headY+.03,-.06+gestureZ);
      const target=this.World(b['hand'+s]).lerp(calm,weight).lerp(cover,brace);
      if(weight>0)this.Chain(b['upperArm'+s],b['forearm'+s],b['hand'+s],target,this.Local(side*.85,chestY-.5,-.08+gestureZ));
    }
    rig.root.updateWorldMatrix(true,true);
    rig.missionTrainLifeActive=true;
    rig.missionTrainLifeState={kind:life.kind,seated:life.seated,weight:life.weight,brace,time:this.time,
      animation:!!this.animation,riseSeconds:life.riseSeconds||0,poseWeight,walkReleaseTime:this.walkReleaseTime||0,
      sourceSeconds:this.animation?(life.riseSeconds?animationState.seconds:0):null};
    return true;
  }
}
