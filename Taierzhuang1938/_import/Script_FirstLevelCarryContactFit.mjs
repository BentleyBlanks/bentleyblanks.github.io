// Authored post-recovery contact experiment. This module is not used by the game.
import {MissionTrainLifePose} from '../Script_FirstLevelMissionTrainLife.mjs';

export class FirstLevelCarryContactFit {
  constructor({T,actor,rig,role,palms,probes,neutralFeet,neutralToes,gripHeightM=.88,bodyTowardGripM=.12,footCalibration,referenceSpeedMps=.55}){
    Object.assign(this,{T,actor,rig,role,palms,probes,neutralFeet,neutralToes,footCalibration});
    actor.characterRig=rig;this.pose=new MissionTrainLifePose({actor});this.pose.basis=actor.root;
    this.end=role==='Front'?1:-1;this.referenceSpeedMps=referenceSpeedMps;this.duration=2;this.supportFraction=.6;
    this.bodyTowardGripM=bodyTowardGripM;this.gripHeightM=gripHeightM;
  }
  World(node){return node.getWorldPosition(new this.T.Vector3());}
  Restore(){this.pose.Restore();}
  Grip(side){return new this.T.Vector3(this.palms[side].sign*.29,this.gripHeightM,-this.end);}
  FootPlan(side,time,hold=false){
    const phase=((time-(side==='L'?.3:1.3))%2+2)%2,stance=hold||phase<1.2,half=this.referenceSpeedMps*.6;let z=0,lift=0;
    const Smooth=x=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u)};
    if(!hold){
      if(stance)z=-half+this.referenceSpeedMps*phase;
      else {const u=(phase-1.2)/.8,h=u*u*(3-2*u);z=half*(1-2*h)+.8*this.referenceSpeedMps*(2*u*u*u-3*u*u+u);lift=.11*Math.sin(Math.PI*u)**2;}
    }
    const {T}=this,scale=this.rig.modelScale*this.actor.root.scale.x,sole=this.footCalibration[side].sole;
    const heel=new T.Vector3(...sole.heel.point).multiplyScalar(scale),toe=new T.Vector3(...sole.toe.point).multiplyScalar(scale);
    let pitch=0,pivot=heel.clone();
    if(!hold){
      if(stance){pitch=phase<.2?.2*(1-Smooth(phase/.2)):phase>1?-.35*Smooth((phase-1)/.2):0;pivot=phase>1?toe:heel;}
      else {const u=(phase-1.2)/.8;pitch=-.35+.55*Smooth(u);pivot=toe.clone().lerp(heel,Smooth(u));}
    }
    const roll=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),pitch),offset=pivot.clone().sub(pivot.clone().applyQuaternion(roll));
    return {phase,stance,lift,pitch,pivot:phase>1&&stance?'toe':'heel',rotation:roll.multiply(this.neutralFeet[side]),
      target:new T.Vector3(side==='L'?-.15:.15,.002-sole.relativeFloor*scale+lift,this.actor.root.position.z+this.end*.14+z).add(offset)};
  }
  FootFloor(side){let min=Infinity;for(const {mesh,vertex} of this.probes[side]){
    const p=mesh.getVertexPosition(vertex,new this.T.Vector3()).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);
  }return min;}
  RequiredDrop(time=0,hold=false){
    let drop=0;
    for(const side of ['L','R']){
      const b=this.rig.bones,shoulder=this.World(b['upperArm'+side]),elbow=this.World(b['forearm'+side]),wrist=this.World(b['hand'+side]);
      const palm=b['hand'+side].localToWorld(new this.T.Vector3(...this.palms[side].point));
      const target=this.Grip(side).sub(palm.sub(wrist));
      const reach=(shoulder.distanceTo(elbow)+elbow.distanceTo(wrist))*.94;
      shoulder.z+=this.end*this.bodyTowardGripM;
      const horizontal=Math.hypot(target.x-shoulder.x,target.z-shoulder.z);
      if(horizontal>=reach)throw Error('Horizontal arm reach needs body placement correction');
      drop=Math.max(drop,shoulder.y-target.y-Math.sqrt(reach*reach-horizontal*horizontal));
      const hip=this.World(b['thigh'+side]),knee=this.World(b['calf'+side]),ankle=this.World(b['foot'+side]);
      const legReach=(hip.distanceTo(knee)+knee.distanceTo(ankle))*.98;
      hip.z+=this.end*this.bodyTowardGripM;
      const foot=this.FootPlan(side,time,hold).target,horizontalLeg=Math.hypot(hip.x-foot.x,hip.z-foot.z);
      if(horizontalLeg>=legReach)throw Error('Foot plan exceeds original leg reach');
      // Keep a small flexion reserve, including the independently measured
      // shoe thickness correction that follows the initial ankle placement.
      drop=Math.max(drop,hip.y-foot.y-Math.sqrt(legReach*legReach-horizontalLeg*horizontalLeg)+.008);
    }
    return drop;
  }
  Apply(time,{dropM,hold=false}){
    const {T,rig,pose,actor}=this,b=rig.bones;
    const neededBefore=this.RequiredDrop(time,hold),beforePelvis=this.World(b.pelvis),beforeWrists=Object.fromEntries(['L','R'].map(s=>[s,this.World(b['hand'+s])]));
    const handQ=Object.fromEntries(['L','R'].map(s=>[s,b['hand'+s].getWorldQuaternion(new T.Quaternion())]));
    pose.Save(b.pelvis);const lowered=beforePelvis.clone();lowered.y-=dropM;lowered.z+=this.end*this.bodyTowardGripM;b.pelvis.position.copy(b.pelvis.parent.worldToLocal(lowered));
    actor.root.updateMatrixWorld(true);
    const footContacts={};
    for(const side of ['L','R']){
      const {phase,stance,lift,target,rotation,pitch,pivot}=this.FootPlan(side,time,hold);
      const foot=b['foot'+side],sign=side==='L'?-1:1;
      for(const [node,q] of this.neutralToes[side]){pose.Save(node);node.quaternion.copy(q);}
      const pole=new T.Vector3(sign*.24,.5,actor.root.position.z-1);
      for(let pass=0;pass<3;pass++){
        pose.Chain(b['thigh'+side],b['calf'+side],foot,target,pole);pose.Save(foot);
        foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));
        actor.root.updateMatrixWorld(true);
        // Do not pull a rolling shoe down to its newly lowest vertex: that
        // would slide the planted material pivot vertically. Retain hinge
        // height and only add clearance when the actual mesh penetrates.
        target.y+=Math.max(0,.002+lift-this.FootFloor(side));
      }
      footContacts[side]={stance,phase,pitch,pivot,minSole:this.FootFloor(side),targetLift:lift};
    }
    const handContacts={};
    for(const side of ['L','R']){
      const hand=b['hand'+side],goal=this.Grip(side);
      pose.Save(hand);hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handQ[side]));actor.root.updateMatrixWorld(true);
      const offset=hand.localToWorld(new T.Vector3(...this.palms[side].point)).sub(this.World(hand));
      const target=goal.clone().sub(offset);
      const start=this.World(b['upperArm'+side]),elbow=this.World(b['forearm'+side]),wrist=this.World(hand);
      const reachRatio=start.distanceTo(target)/(start.distanceTo(elbow)+elbow.distanceTo(wrist));
      if(reachRatio>=.995)throw Error('Contact fit exceeded original arm reach '+JSON.stringify({role:this.role,time,side,dropM,neededBefore,reachRatio,start:start.toArray(),target:target.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray()}));
      // Load-bearing elbows hang below the shoulder. The original crop's
      // elevated elbow is not a suitable pole after changing wrist height.
      // Keep only a small source variation around the anatomical hanging plane.
      const pole=new T.Vector3(start.x+this.palms[side].sign*.08,target.y-.32,(start.z+target.z)*.5).lerp(elbow,.05);
      pose.Chain(b['upperArm'+side],b['forearm'+side],hand,target,pole);
      hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handQ[side]));actor.root.updateMatrixWorld(true);
      const actual=hand.localToWorld(new T.Vector3(...this.palms[side].point));
      handContacts[side]={reachRatio,palmError:actual.distanceTo(goal),wristCorrection:beforeWrists[side].distanceTo(this.World(hand))};
    }
    return {dropM,hold,footContacts,handContacts,pelvisCorrection:beforePelvis.distanceTo(this.World(b.pelvis))};
  }
}
