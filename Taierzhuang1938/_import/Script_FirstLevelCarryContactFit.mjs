// Authored post-recovery contact experiment. This module is not used by the game.
import {MissionTrainLifePose} from '../Script_FirstLevelMissionTrainLife.mjs';

export class FirstLevelCarryContactFit {
  constructor({T,actor,rig,role,palms,probes,neutralFeet,neutralToes}){
    Object.assign(this,{T,actor,rig,role,palms,probes,neutralFeet,neutralToes});
    actor.characterRig=rig;this.pose=new MissionTrainLifePose({actor});this.pose.basis=actor.root;
    this.end=role==='Front'?1:-1;this.referenceSpeedMps=.55;this.duration=2;this.supportFraction=.6;
    this.bodyTowardGripM=.12;
  }
  World(node){return node.getWorldPosition(new this.T.Vector3());}
  Restore(){this.pose.Restore();}
  Grip(side){return new this.T.Vector3(this.palms[side].sign*.29,.88,-this.end);}
  FootFloor(side){let min=Infinity;for(const {mesh,vertex} of this.probes[side]){
    const p=mesh.getVertexPosition(vertex,new this.T.Vector3()).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);
  }return min;}
  RequiredDrop(){
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
    }
    return drop;
  }
  Apply(time,{dropM,hold=false}){
    const {T,rig,pose,actor}=this,b=rig.bones;
    const beforePelvis=this.World(b.pelvis),beforeWrists=Object.fromEntries(['L','R'].map(s=>[s,this.World(b['hand'+s])]));
    const handQ=Object.fromEntries(['L','R'].map(s=>[s,b['hand'+s].getWorldQuaternion(new T.Quaternion())]));
    pose.Save(b.pelvis);const lowered=beforePelvis.clone();lowered.y-=dropM;lowered.z+=this.end*this.bodyTowardGripM;b.pelvis.position.copy(b.pelvis.parent.worldToLocal(lowered));
    actor.root.updateMatrixWorld(true);
    const footContacts={};
    for(const side of ['L','R']){
      const phase=((time-(side==='L'?.3:1.3))%2+2)%2,stance=hold||phase<1.2;
      const half=.33;let z=0,lift=0;
      if(!hold){
        if(stance)z=-half+this.referenceSpeedMps*phase;
        else {const u=(phase-1.2)/.8,h=u*u*(3-2*u);z=half*(1-2*h)+.8*this.referenceSpeedMps*(2*u*u*u-3*u*u+u);lift=.11*Math.sin(Math.PI*u)**2;}
      }
      const foot=b['foot'+side],sign=side==='L'?-1:1;
      for(const [node,q] of this.neutralToes[side]){pose.Save(node);node.quaternion.copy(q);}
      const target=new T.Vector3(sign*.15,.105+lift,actor.root.position.z+this.end*.14+z);
      const pole=new T.Vector3(sign*.24,.5,actor.root.position.z-1);
      for(let pass=0;pass<3;pass++){
        pose.Chain(b['thigh'+side],b['calf'+side],foot,target,pole);pose.Save(foot);
        foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(this.neutralFeet[side]));
        actor.root.updateMatrixWorld(true);
        target.y+=.002+lift-this.FootFloor(side);
      }
      footContacts[side]={stance,phase,minSole:this.FootFloor(side),targetLift:lift};
    }
    const handContacts={};
    for(const side of ['L','R']){
      const hand=b['hand'+side],goal=this.Grip(side);
      pose.Save(hand);hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handQ[side]));actor.root.updateMatrixWorld(true);
      const offset=hand.localToWorld(new T.Vector3(...this.palms[side].point)).sub(this.World(hand));
      const target=goal.clone().sub(offset);
      const start=this.World(b['upperArm'+side]),elbow=this.World(b['forearm'+side]),wrist=this.World(hand);
      const reachRatio=start.distanceTo(target)/(start.distanceTo(elbow)+elbow.distanceTo(wrist));
      if(reachRatio>=.995)throw Error('Contact fit exceeded original arm reach');
      const pole=elbow.clone().lerp(new T.Vector3(this.palms[side].sign*.5,target.y+.12,(start.z+target.z)*.5),.35);
      pose.Chain(b['upperArm'+side],b['forearm'+side],hand,target,pole);
      hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handQ[side]));actor.root.updateMatrixWorld(true);
      const actual=hand.localToWorld(new T.Vector3(...this.palms[side].point));
      handContacts[side]={reachRatio,palmError:actual.distanceTo(goal),wristCorrection:beforeWrists[side].distanceTo(this.World(hand))};
    }
    return {dropM,hold,footContacts,handContacts,pelvisCorrection:beforePelvis.distanceTo(this.World(b.pelvis))};
  }
}
