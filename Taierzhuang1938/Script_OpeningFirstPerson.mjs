// The opening uses the production NRA skin, but its contact pose is solved in
// anatomical frames. Authored third-person wrist rotations cannot be retained
// after moving the shoulders behind a first-person camera.
import * as THREE from "three";
import { CaptureAnatomy, ApplyAnatomicalFingers, AimAnatomicalBone, FrameQuaternion } from "./Script_FpsAnatomy.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const Q=()=>new THREE.Quaternion();
const Pos=bone=>bone.getWorldPosition(V());
const Clamp=v=>Math.max(0,Math.min(1,v));
const Smooth=v=>{v=Clamp(v);return v*v*(3-2*v);};
const Degrees=180/Math.PI;
const cache=new WeakMap();
const BoneName=bone=>bone.name.toLowerCase().replace(/[^a-z0-9]/g,"");

function Anatomy(actor){
  if(!actor?.characterRig?.root||!actor.characterRig.asset?.gltf?.scene)return null;
  if(cache.has(actor))return cache.get(actor);
  const root=actor.characterRig.root,all=[];
  root.traverse(bone=>{if(bone.isBone)all.push(bone);});
  for(const side of ["l","r"]){
    if(!["upperArm","forearm","hand"].every(role=>actor.characterRig.bones?.[role+side.toUpperCase()]))return null;
    if(![0,1,2,3,4].every(index=>all.some(bone=>BoneName(bone).endsWith(side+"finger"+index))))return null;
  }
  const Save=()=>all.map(object=>({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()}));
  const Restore=entries=>{for(const e of entries){e.object.position.copy(e.position);e.object.quaternion.copy(e.quaternion);e.object.scale.copy(e.scale);}root.updateWorldMatrix(true,true);};
  const shown=Save(),sourceBones=new Map();
  // Skeleton.pose() reconstructs model-space roots from bind inverses and
  // discards the live actor's scale. Copy original glTF local transforms instead.
  actor.characterRig.asset.gltf.scene.traverse(bone=>{if(bone.isBone)sourceBones.set(bone.name,bone);});
  for(const bone of all){const source=sourceBones.get(bone.name);if(source){bone.position.copy(source.position);bone.quaternion.copy(source.quaternion);bone.scale.copy(source.scale);}}
  root.updateWorldMatrix(true,true);
  const rig={root,bindPose:Save(),_Restore:Restore,bones:{},fingerBones:{},unarmed:true,poseState:{sprint:0},contactWeight:{l:1,r:1},poseSpec:{contacts:{}}};
  rig._FingerRoot=(side,index)=>all.find(bone=>BoneName(bone).endsWith(side+"finger"+index));
  rig._InAnchor=(bone,out)=>bone.getWorldPosition(out);
  rig._InAnchorBasisQuaternion=(bone,out)=>bone.getWorldQuaternion(out);
  for(const side of ["l","r"]){
    const suffix=side.toUpperCase(),bones=actor.characterRig.bones;
    rig.bones[side]={upperArm:bones["upperArm"+suffix],forearm:bones["forearm"+suffix],hand:bones["hand"+suffix]};
    rig.fingerBones[side]=all.filter(bone=>new RegExp(side+"finger[0-4][0-2]?$").test(BoneName(bone)));
  }
  CaptureAnatomy(rig);
  rig.armRest={};
  for(const side of ["l","r"]){
    const chain=rig.bones[side];
    rig.armRest[side]={upper:Pos(chain.upperArm).distanceTo(Pos(chain.forearm)),lower:Pos(chain.forearm).distanceTo(Pos(chain.hand)),
      transforms:rig.bindPose.filter(e=>Object.values(chain).includes(e.object)||rig.fingerBones[side].includes(e.object))};
  }
  Restore(shown);cache.set(actor,rig);return rig;
}

function RestoreArm(rig,side){
  // Shoulder translations come from the director/NPC pose. Neither the forearm
  // nor wrist translations may stretch to manufacture a successful contact.
  for(const e of rig.armRest[side].transforms){
    if(e.object!==rig.bones[side].upperArm)e.object.position.copy(e.position);
    e.object.quaternion.copy(e.quaternion);e.object.scale.copy(e.scale);
  }
  rig.root.updateWorldMatrix(true,true);
}

function Palm(rig,side){return rig?.bones?.[side]?rig.bones[side].hand.localToWorld(rig.anatomy[side].frame.position.clone()):null;}
function Reach(rig,side){const r=rig.armRest[side];return (r.upper+r.lower)*.97;}
function Shared(target,a,ra,b,rb){
  for(let i=0;i<24;i++)for(const [origin,reach] of [[a,ra],[b,rb]]){
    const delta=target.clone().sub(origin);if(delta.length()>reach)target.copy(origin).add(delta.setLength(reach));
  }
  return target;
}

function Solve(rig,side,shoulder,palm,direction,dorsal,pole,preservePalmNormal=false,preserveHandFrame=false){
  if(!rig?.bones?.[side])return null;
  const chain=rig.bones[side],anatomy=rig.anatomy[side],rest=rig.armRest[side];
  RestoreArm(rig,side);
  chain.upperArm.position.copy(chain.upperArm.parent.worldToLocal(shoulder.clone()));
  chain.upperArm.updateWorldMatrix(true,true);
  const palmNormal=dorsal.clone().normalize(),limit=42/Degrees;
  let forward=direction.clone().normalize(),frame=FrameQuaternion(forward,dorsal),wrist,elbow;
  for(let iteration=0;iteration<5;iteration++){
    const handQ=frame.clone().multiply(anatomy.frame.quaternion.clone().invert());
    const offset=anatomy.frame.position.clone().multiply(chain.hand.getWorldScale(V())).applyQuaternion(handQ);
    wrist=palm.clone().sub(offset);
    const ray=wrist.clone().sub(shoulder),distance=Math.max(Math.abs(rest.upper-rest.lower)+.008,Math.min(Reach(rig,side),ray.length())),axis=ray.normalize();
    wrist.copy(shoulder).addScaledVector(axis,distance);
    const axial=(rest.upper*rest.upper+distance*distance-rest.lower*rest.lower)/(2*distance);
    const bend=pole.clone().sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis));
    if(bend.lengthSq()<1e-8)bend.set(side==="l"?-1:1,-1,0).addScaledVector(axis,-bend.dot(axis));
    bend.normalize();
    const elbowRadius=Math.sqrt(Math.max(0,rest.upper*rest.upper-axial*axial));
    let fixedFrame=false;
    if(preserveHandFrame){
      const forwardOnCircle=forward.clone().addScaledVector(axis,-forward.dot(axis)),span=forwardOnCircle.length()*elbowRadius;
      if(span>1e-7){
        const forwardAxis=forwardOnCircle.normalize(),maximum=((distance-axial)*forward.dot(axis)-rest.lower*Math.cos(limit*.995))/span;
        if(maximum>=-1){
          const cosine=Math.min(bend.dot(forwardAxis),Math.min(1,maximum)),crossAxis=V().crossVectors(axis,forwardAxis).normalize();
          const sign=bend.dot(crossAxis)<0?-1:1;
          bend.copy(forwardAxis).multiplyScalar(cosine).addScaledVector(crossAxis,sign*Math.sqrt(Math.max(0,1-cosine*cosine)));
          fixedFrame=true;
        }
      }
    }
    if(preservePalmNormal&&!fixedFrame){
      // A clasp constrains a palm plane as well as a contact point. Choose the
      // closest feasible point on the anatomical elbow circle before limiting
      // wrist flexion; otherwise the flexion clamp rolls the partner's palm away.
      const normalOnCircle=palmNormal.clone().addScaledVector(axis,-palmNormal.dot(axis));
      const span=normalOnCircle.length()*elbowRadius;
      if(span>1e-7){
        const normalAxis=normalOnCircle.normalize(),crossAxis=V().crossVectors(axis,normalAxis).normalize();
        const axialNormal=(distance-axial)*palmNormal.dot(axis),allowance=rest.lower*Math.sin(limit*.94);
        const low=Math.max(-1,(axialNormal-allowance)/span),high=Math.min(1,(axialNormal+allowance)/span);
        if(low<=high){
          const cosine=Math.max(low,Math.min(high,bend.dot(normalAxis)));
          const sign=bend.dot(crossAxis)<0?-1:1;
          bend.copy(normalAxis).multiplyScalar(cosine).addScaledVector(crossAxis,sign*Math.sqrt(Math.max(0,1-cosine*cosine)));
        }
      }
    }
    elbow=shoulder.clone().addScaledVector(axis,axial).addScaledVector(bend,elbowRadius);
    if(preserveHandFrame&&!fixedFrame){
      // Before contact, a requested frame can precede its reachable palm point.
      // Move the free wrist to the nearest anatomical reach instead of rotating
      // the displayed hand away from that frame to manufacture early contact.
      const wantedWrist=wrist.clone();
      let freeForearm=forward.clone();
      for(let reachIteration=0;reachIteration<5;reachIteration++){
        const upperRay=wantedWrist.clone().sub(shoulder).addScaledVector(freeForearm,-rest.lower);
        if(upperRay.lengthSq()<1e-8)upperRay.copy(bend);
        elbow.copy(shoulder).add(upperRay.setLength(rest.upper));
        freeForearm.copy(wantedWrist).sub(elbow).normalize();
        const freeAngle=forward.angleTo(freeForearm),freeLimit=limit*.995;
        if(freeAngle>freeLimit){const turn=Q().setFromUnitVectors(forward,freeForearm);freeForearm.copy(forward).applyQuaternion(Q().slerp(turn,freeLimit/freeAngle));}
      }
      wrist.copy(elbow).addScaledVector(freeForearm,rest.lower);fixedFrame=true;
    }
    const forearm=wrist.clone().sub(elbow).normalize(),angle=forearm.angleTo(forward);
    if(preservePalmNormal&&!fixedFrame){
      forward.addScaledVector(palmNormal,-forward.dot(palmNormal)).normalize();
      const inPalmPlane=forearm.clone().addScaledVector(palmNormal,-forearm.dot(palmNormal));
      const projectedLength=inPalmPlane.length();inPalmPlane.normalize();
      const planeLimit=Math.acos(Math.min(1,Math.cos(limit)/Math.max(1e-7,projectedLength)));
      const planeAngle=inPalmPlane.angleTo(forward);
      if(planeAngle>planeLimit){
        const q=Q().setFromUnitVectors(inPalmPlane,forward);
        forward=inPalmPlane.applyQuaternion(Q().slerp(q,planeLimit/planeAngle));
      }
      frame=FrameQuaternion(forward,palmNormal);
    }
    // During the reach-in the two hands can still be outside mutual reach.
    // Preserve an anatomical wrist until the requested clasp plane is feasible;
    // the contact solve must never trade a missed pre-contact point for a bent wrist.
    const wristAngle=preservePalmNormal?forearm.angleTo(forward):angle;
    if(wristAngle>limit){
      const q=new THREE.Quaternion().setFromUnitVectors(forearm,forward);
      forward=forearm.clone().applyQuaternion(Q().slerp(q,limit/wristAngle));
      frame=FrameQuaternion(forward,dorsal);
    }
    const anatomicalNormal=V(0,1,0).applyQuaternion(frame);
    AimAnatomicalBone(rig,side,"upperArm",elbow,anatomicalNormal);
    AimAnatomicalBone(rig,side,"forearm",wrist,anatomicalNormal);
    const world=frame.clone().multiply(anatomy.frame.quaternion.clone().invert());
    chain.hand.quaternion.copy(chain.hand.parent.getWorldQuaternion(Q()).invert().multiply(world));chain.hand.updateWorldMatrix(true,true);
  }
  const actualPalm=Palm(rig,side),actualElbow=Pos(chain.forearm),actualWrist=Pos(chain.hand);
  const forearm=actualWrist.clone().sub(actualElbow).normalize(),handForward=V(0,0,1).applyQuaternion(frame);
  const forearmFrame=chain.forearm.getWorldQuaternion(Q()).multiply(anatomy.bones.forearm.clone().invert());
  const forearmNormal=V(0,1,0).applyQuaternion(forearmFrame),handNormal=V(0,1,0).applyQuaternion(frame);
  handNormal.addScaledVector(forearm,-handNormal.dot(forearm)).normalize();
  const wristTwist=Math.atan2(forearm.dot(V().crossVectors(forearmNormal,handNormal)),forearmNormal.dot(handNormal))*Degrees;
  return {palm:actualPalm,wrist:actualWrist,elbow:actualElbow,contactError:actualPalm.distanceTo(palm),
    wristBend:forearm.angleTo(handForward)*Degrees,wristTwist,reachRatio:shoulder.distanceTo(actualWrist)/(rest.upper+rest.lower),
    upperLength:shoulder.distanceTo(actualElbow),lowerLength:actualElbow.distanceTo(actualWrist),
    dorsal:V(0,1,0).applyQuaternion(frame),forward:handForward};
}

function Fingers(rig,side,curl=[14,24,14],thumbDirection=[.4,-.38,.83]){
  if(!rig?.anatomy)return;
  rig.poseSpec.contacts[side==="l"?"left":"right"]={curl,thumbDirection:thumbDirection.map((v,i)=>i===0&&side==="l"?-v:v)};
  ApplyAnatomicalFingers(rig);rig.root.updateWorldMatrix(true,true);
}

export { Anatomy as OpeningActorAnatomy, Solve as SolveOpeningActorArm,
  Fingers as CurlOpeningActorFingers, Palm as OpeningActorPalm };

export function ApplyOpeningRescueReady(actor,clock){
  const rig=Anatomy(actor);if(!rig)return false;
  const root=actor.root.getWorldQuaternion(Q()),right=V(1,0,0).applyQuaternion(root),front=V(0,0,-1).applyQuaternion(root);
  for(const side of ["l","r"]){
    const sign=side==="l"?-1:1,shoulder=Pos(rig.bones[side].upperArm);
    const palm=shoulder.clone().addScaledVector(right,sign*.055).addScaledVector(front,.19).add(V(0,-.29+Math.sin(clock*2.1)*.004,0));
    const pole=shoulder.clone().addScaledVector(right,sign*.32).addScaledVector(front,-.04).add(V(0,-.24,0));
    Solve(rig,side,shoulder,palm,V(0,-1,0).addScaledVector(front,.15).normalize(),right.clone().multiplyScalar(sign),pole);
    Fingers(rig,side,[18,26,14]);
  }
  return true;
}

export class OpeningFirstPerson{
  constructor(show){this.show=show;this.rig=Anatomy(show.playerBody);this.phase=null;this.lastTargets={};this.lastFrames={};this.lastPartners={};this.partnerReleases={};this.report={};}
  ReleasePartner(side,entry,clock,dt){
    const previous=this.previousFramePartners[side];
    if(!previous||previous.mode==="released")return;
    const release=this.partnerReleases[side] ||= {at:clock,from:previous};
    const {rig,rigSide}=release.from,chain=rig.bones[rigSide];
    if(release.sampledAt!==clock){
      release.sampledAt=clock;release.native={shoulder:Pos(chain.upperArm),elbow:Pos(chain.forearm),palm:Palm(rig,rigSide),
        frame:chain.hand.getWorldQuaternion(Q()).multiply(rig.anatomy[rigSide].frame.quaternion),
        fingers:rig.fingerBones[rigSide].map(bone=>bone.quaternion.clone())};
    }
    const native=release.native,mix=Smooth((clock-release.at)/.35),from=release.from;
    const shift=native.shoulder.clone().sub(from.shoulder),target=from.palm.clone().add(shift).lerp(native.palm,mix);
    const pole=from.elbow.clone().add(shift).lerp(native.elbow,mix),frame=previous.frame.clone().rotateTowards(native.frame,10/Degrees*Math.min(3,Math.max(.1,dt*60)));
    const result=Solve(rig,rigSide,native.shoulder,target,V(0,0,1).applyQuaternion(frame),V(0,1,0).applyQuaternion(frame),pole,true,true);
    for(const [i,bone] of rig.fingerBones[rigSide].entries())bone.quaternion.copy(from.fingers[i]).slerp(native.fingers[i],mix);
    rig.root.updateWorldMatrix(true,true);
    entry.partnerMode="release";entry.partnerWristBend=result.wristBend;entry.partnerWristTwist=result.wristTwist;
    entry.partnerFrameQuaternion=frame.toArray();entry.partnerRotationStepDegrees=previous.frame.angleTo(frame)*Degrees;
    this.lastPartners[side]={rig,rigSide,phase:this.show.phase,mode:mix>=1&&frame.angleTo(native.frame)<1e-4?"released":"release",frame,
      shoulder:native.shoulder.clone(),elbow:result.elbow.clone(),palm:result.palm.clone(),fingers:rig.fingerBones[rigSide].map(bone=>bone.quaternion.clone())};
  }
  Update(dt=1/60){
    const s=this.show,r=s.r,p=s.phase,a=s.Age,cam=r.player.camera,fp=C.firstPerson;
    this.rig ||= Anatomy(s.playerBody);
    if(!this.rig){
      if(s.playerBody?.root)s.playerBody.root.visible=false;
      if(s.supplyRoot)s.supplyRoot.visible=false;
      this.report=s.firstPersonState={available:false,reason:"missingOpeningArmSkeleton",phase:p,age:a,hands:{}};
      return;
    }
    const supply=p==="Supply"||p==="Orders",body=s.playerBody.root;
    body.visible=s.ready;body.position.copy(cam.position);body.quaternion.copy(cam.quaternion);body.updateWorldMatrix(true,true);
    const Local=(x,y,z)=>V(x,y,z).applyQuaternion(cam.quaternion).add(cam.position);
    const Direction=(x,y,z)=>V(x,y,z).applyQuaternion(cam.quaternion).normalize();
    const frameClock=Number.isFinite(r.time)?r.time:a;
    if(this.frameClock!==frameClock){this.frameClock=frameClock;this.previousFrameFrames=Object.fromEntries(Object.entries(this.lastFrames).map(([side,q])=>[side,q.clone()]));this.previousFramePartners={...this.lastPartners};}
    const poseKey=p==="Pull"&&a>C.pullS?"PullReleased":p;
    if(this.phase!==poseKey){this.phase=poseKey;this.partnerEntryFrom={};this.transitionAt=frameClock;this.transitionFrom=Object.fromEntries(Object.entries(this.lastTargets).map(([side,v])=>[side,v.clone()]));
      this.transitionFrames=Object.fromEntries(Object.entries(this.lastFrames).map(([side,q])=>[side,q.clone()]));}
    const transitionAge=Math.max(0,frameClock-this.transitionAt);
    this.report={available:true,phase:p,age:a,hands:{}};
    for(const side of ["l","r"]){
      const sign=side==="l"?-1:1,shoulder=Local(sign*fp.shoulderHalfWidthM,-fp.shoulderDropM,fp.shoulderBackM);
      let target=Local(sign*.18,-.46,-.15),forward=Direction(0,-.4,-1),normal=Direction(sign*.25,.65,.1),curl=[14,24,14];
      const pole=Local(sign*.43,-.51,.1);
      if(supply){
        const cycle=(Math.sin(a*2.2)+1)*.5;
        target=Local(sign*.13,side==="l"?-.18:-.11+.025*cycle,-.35);
        forward=Direction(side==="l"?.55:-.3,.68,-.2);normal=Direction(0,-.3,1);
        curl=side==="l"?[45,67,37]:[39,51,31];
      }else if(p==="Blast"||p==="Butt"){
        const protect=p==="Blast"?Math.exp(-Math.max(0,a-.4)*1.3):Smooth((a-.28)/.5);
        target=Local(sign*(.18+.06*protect),-.39+.28*protect,-.21-.07*protect);
        forward=Direction(0,.7,-.6);normal=Direction(0,0,1);curl=[11,23,15];
      }else if(["Advance","Captive","CaptiveShot","Discover"].includes(p)&&side==="l"){
        target=Local(-.17,-.32,-.3);forward=Direction(0,-.1,-1);normal=Direction(0,1,0);curl=[17,26,16];
      }
      let otherRig,otherSide,otherShoulder;
      if(p==="Drag"&&side==="l"){
        otherRig=Anatomy(s.Executioner(0).actor);otherSide="l";
        target=Local(-.12,-.14,-.30);forward=Direction(0,0,-1);normal=Direction(0,1,0);curl=[44,66,42];
      }else if(p==="Pull"&&a<=C.pullS){
        otherRig=Anatomy(r.companion.Handle("luo").actor);otherSide=side==="l"?"r":"l";
        target=Local(sign*.14,-.19,-.32);forward=Direction(0,0,-1);normal=Direction(sign,0,0);curl=[48,65,42];
      }
      if(this.transitionFrom?.[side]&&transitionAge<.35)target.lerpVectors(this.transitionFrom[side],target,Smooth(transitionAge/.35));
      // The solver must receive the same orthogonal palm basis both during and
      // after blending. Returning to the raw normal at the blend boundary can
      // change wrist-limit projection and produce a one-frame hand turn.
      const desiredFrame=FrameQuaternion(forward,normal);
      forward=V(0,0,1).applyQuaternion(desiredFrame);normal=V(0,1,0).applyQuaternion(desiredFrame);
      if(this.transitionFrames?.[side]&&transitionAge<.35){
        const frame=this.transitionFrames[side].clone().slerp(desiredFrame,Smooth(transitionAge/.35));
        forward=V(0,0,1).applyQuaternion(frame);normal=V(0,1,0).applyQuaternion(frame);
      }
      if(otherRig){
        delete this.partnerReleases[side];
        otherShoulder=Pos(otherRig.bones[otherSide].upperArm);
        const shared=Shared(target.clone(),shoulder,Reach(this.rig,side),otherShoulder,Reach(otherRig,otherSide));
        target.lerp(shared,Smooth(transitionAge/.25));
      }
      const player=Solve(this.rig,side,shoulder,target,forward,normal,pole);
      Fingers(this.rig,side,curl);
      const entry={contactError:player.contactError,wristBend:player.wristBend,wristTwist:player.wristTwist,reachRatio:player.reachRatio,
        upperLength:player.upperLength,lowerLength:player.lowerLength,shoulderBehind:cam.worldToLocal(shoulder.clone()).z,
        palm:player.palm.toArray(),wrist:player.wrist.toArray(),elbow:player.elbow.toArray(),dorsal:player.dorsal.toArray(),forward:player.forward.toArray()};
      const currentFrame=FrameQuaternion(player.forward,player.dorsal);
      entry.rotationStepDegrees=this.previousFrameFrames[side]?this.previousFrameFrames[side].angleTo(currentFrame)*Degrees:0;
      entry.frameQuaternion=currentFrame.toArray();
      if(otherRig){
        // Opposed palms form an actual clasp; two wrists at the identical point
        // interpenetrate the hands while misleading a point-distance assertion.
        const otherTarget=player.palm.clone().addScaledVector(player.dorsal,-.014);
        // The partner faces the camera: their anatomical left is screen right.
        // Using the player's side sign here folds both elbows through the torso.
        const otherPole=otherShoulder.clone().add(Direction(otherSide==="l"?.4:-.4,-.45,.18));
        let previous=this.previousFramePartners[side];
        if(previous?.rig!==otherRig||previous?.phase!==p)previous=this.partnerEntryFrom[side] ||= {
          rig:otherRig,phase:p,shoulder:otherShoulder.clone(),elbow:Pos(otherRig.bones[otherSide].forearm),palm:Palm(otherRig,otherSide),
          frame:otherRig.bones[otherSide].hand.getWorldQuaternion(Q()).multiply(otherRig.anatomy[otherSide].frame.quaternion)};
        const reaching=transitionAge<.35,stepScale=Math.min(3,Math.max(.1,dt*60));
        if(reaching){
          const travel=otherTarget.clone().sub(previous.palm),distance=travel.length();
          if(distance>.055*stepScale)otherTarget.copy(previous.palm).addScaledVector(travel,.055*stepScale/distance);
        }
        let partner=Solve(otherRig,otherSide,otherShoulder,otherTarget,player.forward.clone().negate(),player.dorsal.clone().negate(),otherPole,true);
        let partnerFrame=FrameQuaternion(partner.forward,partner.dorsal);
        // A not-yet-reachable grasp has no fixed palm plane. Follow the previous
        // presented hand frame through that interval instead of switching wrist
        // limit branches as soon as the desired plane becomes feasible.
        if(reaching&&previous.frame.angleTo(partnerFrame)>10/Degrees*stepScale){
          const limited=previous.frame.clone().rotateTowards(partnerFrame,10/Degrees*stepScale);
          partner=Solve(otherRig,otherSide,otherShoulder,otherTarget,V(0,0,1).applyQuaternion(limited),V(0,1,0).applyQuaternion(limited),otherPole,true,true);
          partnerFrame=FrameQuaternion(partner.forward,partner.dorsal);
        }
        Fingers(otherRig,otherSide,[48,65,42]);
        entry.partnerContactError=partner.contactError;entry.palmGap=player.palm.distanceTo(partner.palm);
        entry.palmOpposition=player.dorsal.dot(partner.dorsal);entry.partnerWristBend=partner.wristBend;entry.partnerWristTwist=partner.wristTwist;
        entry.partnerRotationStepDegrees=previous.frame.angleTo(partnerFrame)*Degrees;entry.partnerFrameQuaternion=partnerFrame.toArray();
        entry.partnerMode="grasp";
        this.lastPartners[side]={rig:otherRig,rigSide:otherSide,phase:p,mode:"grasp",frame:partnerFrame,shoulder:otherShoulder.clone(),elbow:partner.elbow.clone(),palm:partner.palm.clone(),fingers:otherRig.fingerBones[otherSide].map(bone=>bone.quaternion.clone())};
      }else this.ReleasePartner(side,entry,frameClock,dt);
      this.report.hands[side]=entry;this.lastTargets[side]=player.palm.clone();this.lastFrames[side]=currentFrame;
    }
    s.supplyRoot.visible=supply;
    if(r.bunkerRifle?.view)r.bunkerRifle.view.visible=!supply;
    if(supply){
      s.loadingRifle.quaternion.copy(cam.quaternion).multiply(Q().setFromAxisAngle(V(0,1,0),Math.PI/2));
      s.loadingRifle.position.copy(Palm(this.rig,"l")).sub(s.loadingRifleGrip.clone().applyQuaternion(s.loadingRifle.quaternion));
      s.clips[0].position.copy(Palm(this.rig,"r"));s.clips[0].quaternion.copy(cam.quaternion);
      s.clips[0].position.add(Direction(0,.027,0).multiplyScalar(.027));
      const yaowa=r.companion.Handle("yaowa")?.actor?.characterRig?.bones?.handL;
      s.clips[1].visible=!!yaowa;
      if(yaowa){yaowa.getWorldPosition(s.clips[1].position);s.clips[1].position.y+=.04;}
    }
    body.updateWorldMatrix(true,true);s.firstPersonState=this.report;
  }
}
