// Authored post-recovery contact experiment. This module is not used by the game.
import {MissionTrainLifePose} from '../Script_FirstLevelMissionTrainLife.mjs';

export class FirstLevelCarryContactFit {
  constructor({T,actor,rig,role,palms,probes,neutralFeet,neutralToes,neutralArms=null,gripHeightM=.88,gripOffsetM=1,bodyTowardGripM=.12,footCalibration,referenceSpeedMps=.55,wristFit=false,torsoFit=false}){
    Object.assign(this,{T,actor,rig,role,palms,probes,neutralFeet,neutralToes,neutralArms,footCalibration});
    actor.characterRig=rig;this.pose=new MissionTrainLifePose({actor});this.pose.basis=actor.root;
    this.end=role==='Front'?1:-1;this.referenceSpeedMps=referenceSpeedMps;this.duration=2;this.supportFraction=.6;
    this.bodyTowardGripM=bodyTowardGripM;this.gripHeightM=gripHeightM;this.gripOffsetM=gripOffsetM;this.wristFit=wristFit;this.torsoFit=torsoFit;
  }
  World(node){return node.getWorldPosition(new this.T.Vector3());}
  ArmChain(a,b,c,target,pole){
    // A two-point swing leaves the upper arm's axial rotation unconstrained.
    // Match the original bind elbow plane as well, so the sleeve and elbow
    // retain their anatomical bend direction after lowering a recovered arm.
    const {T,pose}=this,start=this.World(a),middle=this.World(b),end=this.World(c);
    const l1=start.distanceTo(middle),l2=middle.distanceTo(end),line=target.clone().sub(start),distance=line.length();line.normalize();
    const bend=pole.clone().sub(start);bend.addScaledVector(line,-bend.dot(line)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const elbow=start.clone().addScaledVector(line,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    pose.Aim(a,b,elbow);this.actor.root.updateMatrixWorld(true);
    const axis=elbow.clone().sub(start).normalize(),from=this.World(c).sub(this.World(b)),to=target.clone().sub(elbow);
    from.addScaledVector(axis,-from.dot(axis));to.addScaledVector(axis,-to.dot(axis));
    if(from.lengthSq()>1e-10&&to.lengthSq()>1e-10){
      from.normalize();to.normalize();const twist=Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to));
      const world=a.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromAxisAngle(axis,twist));
      a.quaternion.copy(a.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));this.actor.root.updateMatrixWorld(true);
    }
    pose.Aim(b,c,target);
  }
  Restore(){this.pose.Restore();}
  PrepareBody(){
    if(!this.torsoFit)return;
    const {T,rig,pose,actor}=this,b=rig.bones,spine=this.World(b.chest).sub(this.World(b.pelvis));
    this.referenceHandQ=Object.fromEntries(['L','R'].map(side=>[side,b['hand'+side].getWorldQuaternion(new T.Quaternion())]));
    // Optional authored torso experiment, unused by the V15 export. Independent
    // shoulder/pelvis measurements found V13 already leaned forward.
    this.torsoPitchCorrection=(-4*Math.PI/180-Math.atan2(spine.z,spine.y))*.8;
    const correction=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),this.torsoPitchCorrection),q=b.pelvis.getWorldQuaternion(new T.Quaternion()).premultiply(correction);
    pose.Save(b.pelvis);b.pelvis.quaternion.copy(b.pelvis.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));actor.root.updateMatrixWorld(true);
  }
  Grip(side){return new this.T.Vector3(this.palms[side].sign*.29,this.gripHeightM,-this.end*this.gripOffsetM);}
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
      target:new T.Vector3(side==='L'?-.15:.15,.002-sole.relativeFloor*scale+lift,this.actor.root.position.z+this.end*(this.bodyTowardGripM+.04)+z).add(offset)};
  }
  FootFloor(side){let min=Infinity;for(const {mesh,vertex} of this.probes[side]){
    const p=mesh.getVertexPosition(vertex,new this.T.Vector3()).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);
  }return min;}
  SolveGripOrientation(side,initialQ){
    const {T,rig}=this,b=rig.bones,hand=b['hand'+side],cfg=this.palms[side],start=this.World(b['upperArm'+side]);
    const oldElbow=this.World(b['forearm'+side]),l1=start.distanceTo(oldElbow),l2=oldElbow.distanceTo(this.World(hand));
    const scale=hand.getWorldScale(new T.Vector3()),localPalm=new T.Vector3(...cfg.point).multiply(scale),axis=new T.Vector3(0,0,1),pitchAxis=new T.Vector3(1,0,0),pelvis=this.World(b.pelvis);
    const Evaluate=(angle,pitch)=>{
      const q=new T.Quaternion().setFromAxisAngle(axis,cfg.sign*angle).multiply(new T.Quaternion().setFromAxisAngle(pitchAxis,-this.end*pitch)).multiply(initialQ),forward=new T.Vector3(...cfg.forward).applyQuaternion(q).normalize();
      const target=this.Grip(side).sub(localPalm.clone().applyQuaternion(q)),delta=target.clone().sub(start),distance=delta.length(),reachRatio=distance/(l1+l2);
      if(reachRatio>=.995||distance<=Math.abs(l1-l2)+.001)return {score:Infinity};
      const line=delta.divideScalar(distance),along=(l1*l1-l2*l2+distance*distance)/(2*distance);
      const pole=target.clone().addScaledVector(forward,-l2),bend=pole.clone().sub(start);bend.addScaledVector(line,-bend.dot(line));
      if(bend.length()<1e-8)return {score:Infinity};bend.normalize();
      const elbow=start.clone().addScaledVector(line,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
      const wristBend=target.clone().sub(elbow).angleTo(forward),upperArmTilt=elbow.clone().sub(start).angleTo(new T.Vector3(0,-1,0));
      const inward=Math.max(0,.075-cfg.sign*(elbow.x-pelvis.x));
      // Roll around the rail and pitch the palm, keeping its calibrated point
      // fixed. Rewrap the fingers afterwards. Prefer a straight wrist and a
      // non-crossing elbow; regularization stabilizes equivalent solutions.
      return {score:wristBend*wristBend+.6*upperArmTilt*upperArmTilt+.012*angle*angle+.012*pitch*pitch+100*inward*inward,q,target,pole:elbow,reachRatio,roll:cfg.sign*angle,pitch:-this.end*pitch,wristBendDeg:wristBend*180/Math.PI};
    };
    let best={score:Infinity},bestAngle=0,bestPitch=0;
    for(let roll=0;roll<=85;roll+=5)for(let tilt=0;tilt<=60;tilt+=5){const angle=roll*Math.PI/180,pitch=tilt*Math.PI/180,result=Evaluate(angle,pitch);if(result.score<best.score){best=result;bestAngle=angle;bestPitch=pitch;}}
    for(let pass=0;pass<3;pass++)for(const dimension of ['roll','pitch']){
      const center=dimension==='roll'?bestAngle:bestPitch,limit=(dimension==='roll'?85:60)*Math.PI/180;
      let lo=Math.max(0,center-5*Math.PI/180),hi=Math.min(limit,center+5*Math.PI/180);
      for(let i=0;i<14;i++){
        const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3,ra=dimension==='roll'?Evaluate(a,bestPitch):Evaluate(bestAngle,a),rb=dimension==='roll'?Evaluate(b,bestPitch):Evaluate(bestAngle,b);
        if(ra.score<rb.score)hi=b;else lo=a;
        for(const [at,result] of [[a,ra],[b,rb]])if(result.score<best.score){best=result;if(dimension==='roll')bestAngle=at;else bestPitch=at;}
      }
    }
    if(!Number.isFinite(best.score))throw Error('No reachable rail/wrist orientation');return best;
  }
  WrapFingers(side){
    const {T,rig,pose}=this,cfg=this.palms[side],goal=this.Grip(side);
    for(const [index,records] of cfg.fingers.entries()){
      const chain=records.map(record=>rig.root.getObjectByName(record.name.replaceAll(' ','_'))||rig.root.getObjectByName(record.name));
      chain.forEach((node,i)=>{pose.Save(node);node.quaternion.fromArray(records[i].rotation)});this.actor.root.updateMatrixWorld(true);
      for(let joint=0;joint<3;joint++){
        const node=chain[joint],start=this.World(node),vector=joint<2?this.World(chain[joint+1]).sub(start):node.localToWorld(new T.Vector3(...records[joint].tip)).sub(start);
        const radius=index===0?.054:.051,x=cfg.sign*(start.x-goal.x),y=start.y-goal.y,distance=Math.hypot(x,y);
        const cosine=Math.max(-1,Math.min(1,(distance*distance+radius*radius-vector.lengthSq())/(2*distance*radius)));
        const angle=Math.atan2(y,x)+(index===0?1:-1)*Math.acos(cosine),target=new T.Vector3(goal.x+cfg.sign*radius*Math.cos(angle),goal.y+radius*Math.sin(angle),start.z);
        const q=node.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromUnitVectors(vector.normalize(),target.sub(start).normalize()));
        node.quaternion.copy(node.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));this.actor.root.updateMatrixWorld(true);
      }
    }
  }
  RequiredDrop(time=0,hold=false){
    let drop=0;this.dropComponents=[];
    for(const side of ['L','R']){
      const b=this.rig.bones,shoulder=this.World(b['upperArm'+side]),elbow=this.World(b['forearm'+side]),wrist=this.World(b['hand'+side]);
      const hand=b['hand'+side],offset=new this.T.Vector3(...this.palms[side].point).multiply(hand.getWorldScale(new this.T.Vector3())).applyQuaternion(this.referenceHandQ?.[side]||hand.getWorldQuaternion(new this.T.Quaternion()));
      const target=this.Grip(side).sub(offset);
      const reach=(shoulder.distanceTo(elbow)+elbow.distanceTo(wrist))*.94;
      shoulder.z+=this.end*this.bodyTowardGripM;
      const horizontal=Math.hypot(target.x-shoulder.x,target.z-shoulder.z);
      let armDrop=horizontal<reach?shoulder.y-target.y-Math.sqrt(reach*reach-horizontal*horizontal):Infinity;
      if(this.wristFit){
        const {T}=this,initialQ=this.referenceHandQ?.[side]||hand.getWorldQuaternion(new T.Quaternion()),localPalm=new T.Vector3(...this.palms[side].point).multiply(hand.getWorldScale(new T.Vector3()));
        for(let roll=0;roll<=85;roll+=5)for(let pitch=0;pitch<=60;pitch+=5){
          const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),this.palms[side].sign*roll*Math.PI/180).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-this.end*pitch*Math.PI/180)).multiply(initialQ);
          const at=this.Grip(side).sub(localPalm.clone().applyQuaternion(q)),h=Math.hypot(at.x-shoulder.x,at.z-shoulder.z);
          if(h<reach)armDrop=Math.min(armDrop,shoulder.y-at.y-Math.sqrt(reach*reach-h*h));
        }
      }
      if(!Number.isFinite(armDrop))throw Error('Horizontal arm reach needs body placement correction');
      drop=Math.max(drop,armDrop);
      const hip=this.World(b['thigh'+side]),knee=this.World(b['calf'+side]),ankle=this.World(b['foot'+side]);
      const legReach=(hip.distanceTo(knee)+knee.distanceTo(ankle))*.995;
      hip.z+=this.end*this.bodyTowardGripM;
      const foot=this.FootPlan(side,time,hold).target,horizontalLeg=Math.hypot(hip.x-foot.x,hip.z-foot.z);
      if(horizontalLeg>=legReach)throw Error('Foot plan exceeds original leg reach');
      // The inverse-bind sole markers already account for shoe thickness.
      // Keep a small reach reserve without lowering the body by another 8 mm.
      const legDrop=hip.y-foot.y-Math.sqrt(legReach*legReach-horizontalLeg*horizontalLeg)+.001;
      this.dropComponents.push({side,armDrop,legDrop});drop=Math.max(drop,legDrop);
    }
    return drop;
  }
  Apply(time,{dropM,hold=false}){
    const {T,rig,pose,actor}=this,b=rig.bones;
    const neededBefore=this.RequiredDrop(time,hold),beforePelvis=this.World(b.pelvis),beforeWrists=Object.fromEntries(['L','R'].map(s=>[s,this.World(b['hand'+s])]));
    const handQ=Object.fromEntries(['L','R'].map(s=>[s,this.referenceHandQ?.[s]?.clone()||b['hand'+s].getWorldQuaternion(new T.Quaternion())]));
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
      if(this.neutralArms){for(const part of ['upperArm','forearm']){const bone=b[part+side];pose.Save(bone);bone.quaternion.fromArray(this.neutralArms[side][part]);}actor.root.updateMatrixWorld(true);}
      const wristSolution=this.wristFit?this.SolveGripOrientation(side,handQ[side]):null;
      if(wristSolution)handQ[side]=wristSolution.q;
      pose.Save(hand);hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handQ[side]));actor.root.updateMatrixWorld(true);
      const offset=hand.localToWorld(new T.Vector3(...this.palms[side].point)).sub(this.World(hand));
      const target=goal.clone().sub(offset);
      const start=this.World(b['upperArm'+side]),elbow=this.World(b['forearm'+side]),wrist=this.World(hand);
      const reachRatio=start.distanceTo(target)/(start.distanceTo(elbow)+elbow.distanceTo(wrist));
      if(reachRatio>=.995)throw Error('Contact fit exceeded original arm reach '+JSON.stringify({role:this.role,time,side,dropM,neededBefore,reachRatio,start:start.toArray(),target:target.toArray(),elbow:elbow.toArray(),wrist:wrist.toArray()}));
      // Load-bearing elbows hang below the shoulder. The original crop's
      // elevated elbow is not a suitable pole after changing wrist height.
      // Keep only a small source variation around the anatomical hanging plane.
      const pole=wristSolution?.pole||new T.Vector3(start.x+this.palms[side].sign*.08,target.y-.32,(start.z+target.z)*.5).lerp(elbow,.05);
      if(this.neutralArms)this.ArmChain(b['upperArm'+side],b['forearm'+side],hand,target,pole);
      else pose.Chain(b['upperArm'+side],b['forearm'+side],hand,target,pole);
      hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handQ[side]));actor.root.updateMatrixWorld(true);
      if(this.wristFit)this.WrapFingers(side);
      const actual=hand.localToWorld(new T.Vector3(...this.palms[side].point));
      const forward=new T.Vector3(...this.palms[side].forward).applyQuaternion(handQ[side]);
      handContacts[side]={reachRatio,palmError:actual.distanceTo(goal),wristCorrection:beforeWrists[side].distanceTo(this.World(hand)),wristBendDeg:this.World(hand).sub(this.World(b['forearm'+side])).angleTo(forward)*180/Math.PI,handRollRadians:wristSolution?.roll||0,handPitchRadians:wristSolution?.pitch||0};
    }
    return {dropM,requiredDropComponents:this.dropComponents,hold,footContacts,handContacts,torsoPitchCorrection:this.torsoPitchCorrection||0,pelvisCorrection:beforePelvis.distanceTo(this.World(b.pelvis))};
  }
}
