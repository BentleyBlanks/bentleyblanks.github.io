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
    this.rig=rig;this.profiles=ACTOR_LOCOMOTION_PROFILES[rig.clipModelId||rig.modelId]||{};
    this.phase=phase;this.previous=new THREE.Vector3();this.position=new THREE.Vector3();
    this.scale=new THREE.Vector3();this.sampled=false;this.elapsed=null;this.step=0;
    this.speedMps=0;this.discontinuity=false;this.lastAction=null;
    // Speed split (Data_Tuning_ActorLocomotion playRate*/stride*): shown stride scale, its warp weight.
    this.stride=1;this.strideWeight=0;this.ratioSmooth=null;
    this.pelvis=rig.bones.pelvis||null;this.pelvisSaved=new THREE.Vector3();this.pelvisApplied=false;this.pelvisDropM=0;
    this.forward=new THREE.Vector3();
    this.crowdPhase=phase;this.crowdPronePhase=phase;this.crowdSpeedMps=0;
    this.v=Array.from({length:10},()=>new THREE.Vector3());
    this.q=Array.from({length:3},()=>new THREE.Quaternion());
    this.feet=['L','R'].map(side=>{
      const thigh=rig.bones['thigh'+side],calf=rig.bones['calf'+side],foot=rig.bones['foot'+side];
      return {side,thigh,calf,foot,toe:foot?.children.find(node=>/Toe0$/.test(node.name)),
        anchor:new THREE.Vector3(),target:new THREE.Vector3(),pole:new THREE.Vector3(),
        // offset: the planar lock correction shown this frame; residual: what a finished stance
        // left over, eased out while the foot is in the air (contactReleaseS).
        offset:new THREE.Vector3(),residual:new THREE.Vector3(),
        saved:[new THREE.Quaternion(),new THREE.Quaternion(),new THREE.Quaternion()],
        rotation:new THREE.Quaternion(),applied:false,key:null,weight:0,errorM:0};
    });
  }

  Restore() {
    if(this.pelvisApplied){this.pelvis.position.copy(this.pelvisSaved);this.pelvisApplied=false;}
    for(const f of this.feet)if(f.applied){
      f.thigh.quaternion.copy(f.saved[0]);f.calf.quaternion.copy(f.saved[1]);f.foot.quaternion.copy(f.saved[2]);f.applied=false;
    }
  }
  ResetContacts() { for(const f of this.feet){f.key=null;f.weight=0;f.errorM=0;f.offset.set(0,0,0);f.residual.set(0,0,0);} }

  // AI calls this even when the expensive skeleton is culled. Far LOD uses the
  // same measured stride, and a rendered run resynchronizes the exact clip phase.
  AdvanceDistance(distance,dt) {
    const profile=this.profiles.RifleRun;
    this.crowdSpeedMps=dt>0&&distance<=Math.max(C.teleportM,dt*C.maximumMps)?Math.max(0,distance/dt):0;
    if(!profile||!this.crowdSpeedMps)return;
    this.rig.root.getWorldScale(this.scale);
    const prone=this.profiles.ProneCrawl;
    if(prone)this.crowdPronePhase=(this.crowdPronePhase+distance/(prone.referenceMps*Math.abs(this.scale.y)*prone.duration))%1;
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
    if(rig.forcedClip){action?.setEffectiveTimeScale(1);this.ResetContacts();this.UpdateStride(dt,1,false);return;}
    if(!profile||!action){this.UpdateStride(dt,1,false,!this.WarpFree(state));return;}
    rig.root.getWorldScale(this.scale);
    // Convert source metres through the real hierarchy scale, including actor height.
    // No positive minimum rate: a blocked capsule must not keep taking steps.
    const ratio=this.speedMps/Math.max(.001,profile.referenceMps*Math.abs(this.scale.y));
    // Rate x shown stride = ratio, exactly: the planted foot's authored travel, scaled by the
    // stride warp, equals the root's travel whatever share each of the two takes.
    const free=this.WarpFree(state);
    const rate=ratio/this.UpdateStride(dt,ratio,free&&!!(profile.contacts?.L?.length&&profile.contacts.R?.length),!free);
    action.stopWarping().setEffectiveTimeScale(dt>0?rate*this.step/dt:rate);
    if(state.grounded===false||state.meleeCombat||state.dead)this.ResetContacts();
  }

  // Stride warping needs a grounded body moving in the world that no special pose owns. Only
  // measured cyclic gaits (contact spans prove a clean stance) start it; it fades out across
  // a crossfade to another clip, but stops at once when the body is taken over or lies down
  // (a prone body's legs trail along the forward axis; scaling them there stretches them).
  WarpFree(state) {
    const rig=this.rig;
    return !!this.pelvis&&(state.locomotionTracked||Number.isFinite(state.moveSpeedMps))
      &&!rig.forcedClip&&state.grounded!==false&&!state.meleeCombat&&!state.dead&&!state.carryRole&&!(state.prone>.45)&&!rig.actor?.ragdollState;
  }

  // UE5 Lyra split: playback rate within [playRateMin, playRateMax], stride warping takes the rest;
  // past the stride limits the rate takes it again (a foot must never slide to honour a clamp).
  UpdateStride(dt,ratio,warpable,blocked=true) {
    const h=this.step>0?this.step:Math.max(0,dt);
    const follow=h>0?1-Math.exp(-h/C.strideSmoothS):0;
    this.ratioSmooth=this.ratioSmooth===null||!warpable&&this.strideWeight<=0?ratio:this.ratioSmooth+(ratio-this.ratioSmooth)*follow;
    const r=this.ratioSmooth,rate=Clamp(r,C.playRateMin,C.playRateMax);
    const target=Clamp(r/rate,C.strideMin,C.strideMax);
    this.strideWeight=blocked?0:Clamp(this.strideWeight+(warpable?1:-1)*h/C.strideBlendS,0,1);
    this.stride=1+(target-1)*Smooth(this.strideWeight);
    return this.stride;
  }

  SaveLeg(f) {
    if(f.applied)return;
    f.saved[0].copy(f.thigh.quaternion);f.saved[1].copy(f.calf.quaternion);f.saved[2].copy(f.foot.quaternion);f.applied=true;
  }

  // Stride warping: scale each foot's offset from the pelvis along the body's forward axis
  // (the clip's stride axis), lower the pelvis when a long stride would overreach, and solve
  // both legs. Heel/toe roll, lateral placement and foot height stay authored.
  Warp(state) {
    const rig=this.rig,s=this.stride;
    if(Math.abs(s-1)<1e-3||!this.WarpFree(state))return;
    const legs=this.feet.filter(f=>f.thigh&&f.calf&&f.foot);
    if(legs.length<2)return;
    const root=rig.actor?.root||rig.root;
    root.getWorldQuaternion(this.q[0]);
    this.forward.set(0,0,-1).applyQuaternion(this.q[0]).setY(0);
    if(this.forward.lengthSq()<1e-6)return;
    this.forward.normalize();
    const centre=this.pelvis.getWorldPosition(this.v[9]);
    let drop=0;
    for(const f of legs) {
      f.foot.getWorldPosition(f.target);f.foot.getWorldQuaternion(f.rotation);
      const along=(f.target.x-centre.x)*this.forward.x+(f.target.z-centre.z)*this.forward.z;
      f.target.addScaledVector(this.forward,along*(s-1));
      const hip=f.thigh.getWorldPosition(this.v[0]),knee=f.calf.getWorldPosition(this.v[1]),ankle=f.foot.getWorldPosition(this.v[2]);
      const reach=(hip.distanceTo(knee)+knee.distanceTo(ankle))*C.legReachShare;
      const flat=(f.target.x-hip.x)**2+(f.target.z-hip.z)**2,height=hip.y-f.target.y;
      drop=Math.max(drop,flat<reach*reach?height-Math.sqrt(reach*reach-flat):C.pelvisDropMaxM);
    }
    this.pelvisDropM=Clamp(drop,0,C.pelvisDropMaxM);
    if(this.pelvisDropM>1e-4) {
      this.pelvisSaved.copy(this.pelvis.position);this.pelvisApplied=true;
      const point=this.pelvis.getWorldPosition(this.v[0]);point.y-=this.pelvisDropM;
      this.pelvis.position.copy(this.pelvis.parent.worldToLocal(point));
    }
    for(const f of legs) {
      f.calf.getWorldPosition(f.pole);this.SaveLeg(f);this.Solve(f);
      f.foot.quaternion.copy(f.foot.parent.getWorldQuaternion(this.q[0]).invert().multiply(f.rotation));
    }
  }

  Apply(dt,state) {
    const rig=this.rig,action=rig.currentAction,profile=this.profiles[rig.currentId];
    const holding=this.speedMps<=C.movingMps && ['AdvanceFire','AttackCommand'].includes(rig.currentId) && !state.firing;
    const worldMotion=state.locomotionTracked||Number.isFinite(state.moveSpeedMps);
    if(worldMotion)this.Warp(state);
    if(!worldMotion||(!profile?.contacts&&!holding)||rig.forcedClip||state.grounded===false||state.meleeCombat||state.dead
      ||state.carryRole||rig.actor?.ragdollState||this.discontinuity) {this.ResetContacts();this.lastAction=action;return;}
    const phase=holding?this.phase:action.time/action.getClip().duration;
    const wrapped=action===this.lastAction&&phase<this.phase-.5;
    const changed=!holding&&action!==this.lastAction;
    this.phase=phase;this.lastAction=action;
    if(rig.currentId==='RifleRun')this.crowdPhase=phase;
    // The lock's correction is never dropped at once: whatever a stance leaves (the clip's planted foot
    // drifting against the real travel) eases out while that foot swings. Releasing it over the old
    // 35 ms ramp threw the foot up to 28 cm and snapped the knee 25-45 deg in one frame, every step
    // (2026-09-28 cutscene probe: Luo, He, Liu, Yaowa and the runner walking out of the dugout).
    const h=this.step>0?this.step:Math.max(0,dt),fade=Math.exp(-h/C.contactReleaseS);
    for(const f of this.feet) {
      if(!f.toe||!f.thigh||!f.calf)continue;
      if(holding&&(!f.key||f.weight<.99)){f.key=null;f.weight=0;f.offset.set(0,0,0);f.residual.set(0,0,0);continue;}
      const spans=profile?.contacts?.[f.side]||[],index=holding?0:spans.findIndex(([a,b])=>phase>=a&&phase<b);
      const key=index<0?null:holding?f.key:rig.currentId+':'+index;
      if(changed||wrapped||index<0)f.releasedKey=null;
      // In the air, or a stance let go early (below): ease the correction out.
      if(index<0||!holding&&key===f.releasedKey){this.Release(f,fade);continue;}
      const [start]=spans[index]||[0,1];
      f.residual.multiplyScalar(fade);
      // Lock in from the carried-over residual (so a stance starts where the foot is shown), hold to the end.
      const weight=holding?1:Smooth((phase-start)*profile.duration/C.contactBlendS)*action.getEffectiveWeight();
      const toe=f.toe.getWorldPosition(this.v[0]);
      if(changed||wrapped||f.key!==key){f.anchor.copy(toe).add(f.residual);f.key=key;}
      const correction=this.v[1].subVectors(f.anchor,toe);
      // Keep authored heel/toe roll and terrain height; anchor only the sole's planar contact.
      correction.y=0;
      // Past the reach this stance lets go as if the foot lifted early; the next one locks afresh.
      if(correction.length()>C.maximumCorrectionM){if(!holding)f.releasedKey=key;this.Release(f,fade);continue;}
      f.weight=weight;
      f.offset.copy(correction).multiplyScalar(weight).addScaledVector(f.residual,1-weight);
      if(f.offset.lengthSq()<=1e-10)continue;
      this.Offset(f,f.offset);
      f.toe.getWorldPosition(this.v[0]);f.errorM=Math.hypot(this.v[0].x-f.anchor.x,this.v[0].z-f.anchor.z);
    }
  }

  /** No lock this frame: what was shown eases toward the authored foot. */
  Release(f,fade) {
    f.key=null;f.weight=0;
    f.residual.copy(f.offset).multiplyScalar(fade);f.offset.copy(f.residual);
    if(f.offset.lengthSq()>1e-6)this.Offset(f,f.offset);
  }

  /** Move the foot by a planar world offset with the two-bone solve, keeping its authored world rotation. */
  Offset(f,offset) {
    f.calf.getWorldPosition(f.pole);
    f.foot.getWorldPosition(f.target);f.foot.getWorldQuaternion(f.rotation);
    f.target.add(offset);
    this.SaveLeg(f);
    this.Solve(f);
    f.foot.quaternion.copy(f.foot.parent.getWorldQuaternion(this.q[0]).invert().multiply(f.rotation));
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
