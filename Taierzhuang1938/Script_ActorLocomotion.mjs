import * as THREE from 'three';
import { ACTOR_LOCOMOTION_PROFILES } from './Data_ActorLocomotion.mjs';
import { ACTOR_LOCOMOTION as C } from './Data_Tuning_ActorLocomotion.mjs';
import { STAND_IDLE } from './Data_Tuning_ActorIdle.mjs';

const Clamp = THREE.MathUtils.clamp;
const Smooth = value => { const t=Clamp(value,0,1);return t*t*(3-2*t); };

// One distance clock and contact solver for all production skeletal characters.
// World-root translation remains exclusively owned by movement/physics.
export class ActorLocomotion {
  constructor(rig, phase=0) {
    this.rig=rig;this.profiles=ACTOR_LOCOMOTION_PROFILES[rig.modelId]||{};
    this.phase=phase;this.previous=new THREE.Vector3();this.position=new THREE.Vector3();
    this.scale=new THREE.Vector3();this.sampled=false;this.elapsed=null;this.step=0;
    this.speedMps=0;this.discontinuity=false;this.lastAction=null;
    this.crowdPhase=phase;this.crowdSpeedMps=0;
    this.v=Array.from({length:10},()=>new THREE.Vector3());
    this.q=Array.from({length:3},()=>new THREE.Quaternion());
    this.feet=['L','R'].map(side=>{
      const thigh=rig.bones['thigh'+side],calf=rig.bones['calf'+side],foot=rig.bones['foot'+side];
      return {side,thigh,calf,foot,toe:foot?.children.find(node=>/Toe0$/.test(node.name)),
        anchor:new THREE.Vector3(),target:new THREE.Vector3(),pole:new THREE.Vector3(),
        saved:[new THREE.Quaternion(),new THREE.Quaternion(),new THREE.Quaternion()],
        rotation:new THREE.Quaternion(),applied:false,key:null,weight:0,errorM:0};
    });
  }

  Restore() {
    for(const f of this.feet)if(f.applied){
      f.thigh.quaternion.copy(f.saved[0]);f.calf.quaternion.copy(f.saved[1]);f.foot.quaternion.copy(f.saved[2]);f.applied=false;
    }
  }
  ResetContacts() { for(const f of this.feet){f.key=null;f.weight=0;f.errorM=0;} }

  // AI calls this even when the expensive skeleton is culled. Far LOD uses the
  // same measured stride, and a rendered run resynchronizes the exact clip phase.
  AdvanceDistance(distance,dt) {
    const profile=this.profiles.RifleRun;
    this.crowdSpeedMps=dt>0&&distance<=Math.max(C.teleportM,dt*C.maximumMps)?Math.max(0,distance/dt):0;
    if(!profile||!this.crowdSpeedMps)return;
    this.rig.root.getWorldScale(this.scale);
    this.crowdPhase=(this.crowdPhase+distance/(profile.referenceMps*Math.abs(this.scale.y)*profile.duration))%1;
  }

  Sample(dt,state) {
    this.step=Math.max(0,dt);this.discontinuity=false;
    let speed=Number.isFinite(state.moveSpeedMps)?Math.max(0,state.moveSpeedMps):Math.max(0,state.moveSpeed||0)*C.normalizedMps;
    const root=this.rig.actor?.root;
    if(root && dt>0) {
      root.getWorldPosition(this.position);
      const elapsed=Number.isFinite(state.elapsed)?state.elapsed:null;
      const step=this.sampled&&elapsed!==null&&this.elapsed!==null?elapsed-this.elapsed:dt;
      const distance=this.sampled?this.position.distanceTo(this.previous):0;
      const planar=this.sampled?Math.hypot(this.position.x-this.previous.x,this.position.z-this.previous.z):0;
      this.discontinuity=this.sampled&&(step<=0||step>C.maximumGapS||distance>Math.max(C.teleportM,step*C.maximumMps));
      // Track the interval between actual pose samples, including animation LOD skips.
      // Moving supports supply relative speed explicitly and opt out of world tracking.
      if(state.locomotionTracked && this.sampled) {
        this.step=this.discontinuity?0:step;
        speed=this.step>0?planar/this.step:0;
      }
      this.previous.copy(this.position);this.elapsed=elapsed;this.sampled=true;
    }
    if(this.discontinuity)this.ResetContacts();
    this.speedMps=speed;
    if(state.locomotionTracked)return {...state,moveSpeedMps:speed,moveSpeed:speed/C.normalizedMps};
    return state;
  }

  StartAction(action,id,previousAction,previousId) {
    const profile=this.profiles[id];if(!profile||this.rig.forcedClip)return;
    const previous=this.profiles[previousId];
    if(previous && previousAction)this.phase=previousAction.time/previousAction.getClip().duration;
    // Preserve a supporting side when crossing between different gait libraries.
    let phase=this.phase;
    if(previous?.contacts && profile.contacts && previousId!==id) {
      for(const side of ['L','R']) {
        const span=previous.contacts[side].find(([a,b])=>phase>=a&&phase<b);
        const next=profile.contacts[side][0];
        if(span&&next){phase=THREE.MathUtils.lerp(next[0],next[1],(phase-span[0])/(span[1]-span[0]));break;}
      }
    }
    action.time=action.getClip().duration*phase;
  }

  Drive(dt,state) {
    const rig=this.rig,action=rig.currentAction,profile=this.profiles[rig.currentId];
    const held=state.locomotionTracked && this.speedMps<=C.movingMps && rig.currentId==='AdvanceFire'
      && !state.firing && !rig.forcedClip && !state.meleeCombat;
    if(this.heldIdle && !held)this.heldIdle.setEffectiveTimeScale(1);
    this.heldIdle=held?action:null;
    if(held){action.time=action.getClip().duration*STAND_IDLE.advanceFireHold;action.setEffectiveTimeScale(0);}
    if(rig.forcedClip){action?.setEffectiveTimeScale(1);this.ResetContacts();return;}
    if(!profile||!action)return;
    rig.root.getWorldScale(this.scale);
    // Convert source metres through the real hierarchy scale, including actor height.
    // No positive minimum rate: a blocked capsule must not keep taking steps.
    const rate=this.speedMps/Math.max(.001,profile.referenceMps*Math.abs(this.scale.y));
    action.stopWarping().setEffectiveTimeScale(dt>0?rate*this.step/dt:rate);
    if(state.grounded===false||state.meleeCombat||state.dead)this.ResetContacts();
  }

  Apply(dt,state) {
    const rig=this.rig,action=rig.currentAction,profile=this.profiles[rig.currentId];
    const holding=this.speedMps<=C.movingMps && ['AdvanceFire','AttackCommand'].includes(rig.currentId) && !state.firing;
    const worldMotion=state.locomotionTracked||Number.isFinite(state.moveSpeedMps);
    if(!worldMotion||(!profile?.contacts&&!holding)||rig.forcedClip||state.grounded===false||state.meleeCombat||state.dead
      ||state.carryRole||rig.actor?.ragdollState||this.discontinuity) {this.ResetContacts();this.lastAction=action;return;}
    const phase=holding?this.phase:action.time/action.getClip().duration;
    const wrapped=action===this.lastAction&&phase<this.phase-.5;
    const changed=!holding&&action!==this.lastAction;
    this.phase=phase;this.lastAction=action;
    if(rig.currentId==='RifleRun')this.crowdPhase=phase;
    for(const f of this.feet) {
      if(!f.toe||!f.thigh||!f.calf)continue;
      if(holding&&(!f.key||f.weight<.99)){f.key=null;f.weight=0;continue;}
      const spans=profile?.contacts?.[f.side]||[],index=holding?0:spans.findIndex(([a,b])=>phase>=a&&phase<b);
      if(index<0){f.key=null;f.weight=0;continue;}
      const [start,end]=spans[index]||[0,1];
      // Keep the supporting foot through the stop blend; the free foot can settle.
      const weight=holding?1:Smooth((phase-start)*profile.duration/C.contactBlendS)
        *Smooth((end-phase)*profile.duration/C.contactBlendS)*action.getEffectiveWeight();
      const key=holding?f.key:rig.currentId+':'+index;
      const toe=f.toe.getWorldPosition(this.v[0]);
      if(changed||wrapped||f.key!==key){f.anchor.copy(toe);f.key=key;}
      const correction=this.v[1].subVectors(f.anchor,toe);
      // Keep authored heel/toe roll and terrain height; anchor only the sole's planar contact.
      correction.y=0;
      if(correction.length()>C.maximumCorrectionM){f.key=null;f.weight=0;continue;}
      f.weight=weight;
      if(weight<=0)continue;
      f.thigh.getWorldPosition(this.v[2]);f.calf.getWorldPosition(f.pole);
      f.foot.getWorldPosition(f.target);f.foot.getWorldQuaternion(f.rotation);
      f.target.addScaledVector(correction,weight);
      f.saved[0].copy(f.thigh.quaternion);f.saved[1].copy(f.calf.quaternion);f.saved[2].copy(f.foot.quaternion);f.applied=true;
      this.Solve(f);
      f.foot.quaternion.copy(f.foot.parent.getWorldQuaternion(this.q[0]).invert().multiply(f.rotation));
      f.toe.getWorldPosition(this.v[0]);f.errorM=Math.hypot(this.v[0].x-f.anchor.x,this.v[0].z-f.anchor.z);
    }
  }

  Solve(f) {
    const start=this.v[3],middle=this.v[4],end=this.v[5],delta=this.v[6],bend=this.v[7],knee=this.v[8];
    f.thigh.getWorldPosition(start);f.calf.getWorldPosition(middle);f.foot.getWorldPosition(end);
    const upper=start.distanceTo(middle),lower=middle.distanceTo(end);
    delta.subVectors(f.target,start);
    const distance=Clamp(delta.length(),Math.abs(upper-lower)+C.minimumReachM,upper+lower-C.minimumReachM);
    delta.normalize();bend.subVectors(f.pole,start).addScaledVector(delta,-bend.dot(delta)).normalize();
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
    knee.copy(start).addScaledVector(delta,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
    this.Aim(f.thigh,f.calf,knee);this.Aim(f.calf,f.foot,f.target);
  }
  Aim(bone,child,target) {
    const [start,from,to]=this.v;
    bone.getWorldPosition(start);child.getWorldPosition(from).sub(start).normalize();to.copy(target).sub(start).normalize();
    this.q[0].setFromUnitVectors(from,to);bone.getWorldQuaternion(this.q[1]).premultiply(this.q[0]);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(this.q[2]).invert().multiply(this.q[1]));
  }
}
