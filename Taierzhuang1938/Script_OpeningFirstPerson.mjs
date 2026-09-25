// The opening uses the production NRA skin, but its contact pose is solved in
// anatomical frames. Authored third-person wrist rotations cannot be retained
// after moving the shoulders behind a first-person camera.
import * as THREE from "three";
import { CaptureAnatomy, ApplyAnatomicalFingers, AimAnatomicalBone, FrameQuaternion } from "./Script_FpsAnatomy.mjs";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
import { EXTRA_HAND_POSES, HAND_SHAPES, LEG_POSES, FP_PROPS, FIRST_PERSON_EXTRA as X } from "./Data_OpeningFirstPersonExtra.mjs";

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

/** Finger curl (one curl for all five) or a full shape (per-finger curls, splay, thumb; right-hand values, mirrored for the left). */
function Fingers(rig,side,curl=[14,24,14],thumbDirection=[.4,-.38,.83],shape=null){
  if(!rig?.anatomy)return;
  const m=side==="l"?-1:1,contact={curl,thumbDirection:(shape?.thumbDirection||thumbDirection).map((v,i)=>i===0?v*m:v)};
  if(shape){contact.fingers=shape.fingers;contact.fingerSplay=(shape.splay||[0,0,0,0,0]).map(v=>v*m);contact.thumbRoll=(shape.thumbRoll||0)*m;}
  rig.poseSpec.contacts[side==="l"?"left":"right"]=contact;
  ApplyAnatomicalFingers(rig);rig.root.updateWorldMatrix(true,true);
}
const DEFAULT_THUMB=[.4,-.38,.83];
/** A pose's fingers as a full shape (a curl-only pose is the same curl on every finger). */
function ShapeOf(pose){
  const shape=pose?.shape?HAND_SHAPES[pose.shape]:null;
  if(shape)return shape;
  const c=pose?.c||[14,24,14];
  return {fingers:[c,c,c,c,c],splay:[0,0,0,0,0],thumbDirection:DEFAULT_THUMB,thumbRoll:0};
}
function MixShape(a,b,t){
  const L=(u,v)=>u+(v-u)*t;
  return {fingers:a.fingers.map((f,i)=>f.map((v,j)=>L(v,b.fingers[i][j]))),splay:a.splay.map((v,i)=>L(v,b.splay[i])),
    thumbDirection:a.thumbDirection.map((v,i)=>L(v,b.thumbDirection[i])),thumbRoll:L(a.thumbRoll||0,b.thumbRoll||0)};
}

// ---- 2026-09-25 storyboard round: legs, partner grips, first-person props -----------------------------
const LEG_BONES=/Thigh|Calf|Foot|Toe/;
/**
 * Split the NRA02 player body for the first person: the skinned meshes keep only the arm triangles
 * (as before), and a second SkinnedMesh on the same skeleton keeps the legs and boots (triangles whose
 * weights are all on the legs or the pelvis; torso and head stay cut). The leg meshes start hidden; the
 * first person shows them only while a LEG_POSES pose is solved. Returns the new geometries (the caller
 * owns and disposes them) and the leg meshes (also on actor.openingLegMeshes).
 */
export function TrimOpeningPlayerBody(actor){
  const geometries=[],legs=[],meshes=[];
  actor?.root?.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push(mesh);});
  for(const mesh of meshes){
    const source=mesh.geometry,indices=source.index?.array,skin=source.getAttribute("skinIndex"),weight=source.getAttribute("skinWeight");
    if(!indices||!skin||!weight)continue;
    const Set_=pattern=>new Set(mesh.skeleton.bones.flatMap((bone,i)=>pattern.test(bone.name)?[i]:[]));
    const arms=Set_(/UpperArm|Forearm|Hand|Finger/),legBones=Set_(LEG_BONES),pelvis=Set_(/Pelvis$/);
    const Weight=(index,set)=>{let total=0;for(let k=0;k<4;k++)if(set.has(skin.array[index*4+k]))total+=weight.array[index*4+k];return total;};
    const KeepArm=index=>Weight(index,arms)>.999;
    const KeepLeg=index=>Weight(index,legBones)+Weight(index,pelvis)>.999;
    const armIndex=[],legIndex=[];
    for(let i=0;i<indices.length;i+=3){
      const tri=[indices[i],indices[i+1],indices[i+2]];
      if(tri.every(KeepArm))armIndex.push(...tri);
      else if(tri.every(KeepLeg)&&tri.some(v=>Weight(v,legBones)>.5))legIndex.push(...tri);
    }
    const armGeometry=source.clone();armGeometry.setIndex(armIndex);armGeometry.clearGroups();mesh.geometry=armGeometry;geometries.push(armGeometry);
    if(!legIndex.length||!mesh.parent)continue;
    const legGeometry=source.clone();legGeometry.setIndex(legIndex);legGeometry.clearGroups();geometries.push(legGeometry);
    const leg=new THREE.SkinnedMesh(legGeometry,mesh.material);
    leg.name=(mesh.name||"PlayerBody")+"_OpeningLegs";leg.bindMode=mesh.bindMode;
    leg.position.copy(mesh.position);leg.quaternion.copy(mesh.quaternion);leg.scale.copy(mesh.scale);
    leg.castShadow=mesh.castShadow;leg.receiveShadow=mesh.receiveShadow;leg.layers.mask=mesh.layers.mask;
    // Skinned bounds are cached from the first pose; the legs are always just in front of the eye.
    leg.frustumCulled=false;leg.visible=false;
    mesh.parent.add(leg);leg.bind(mesh.skeleton,mesh.bindMatrix);legs.push(leg);
  }
  if(actor)actor.openingLegMeshes=legs;
  return {geometries,legs};
}

/** Pelvis and leg rest frames of an opening rig (lazy, cached on the rig; null without leg bones). */
function LegRig(actor){
  const rig=Anatomy(actor);if(!rig)return null;
  if(rig.legs!==undefined)return rig.legs;
  const bones=actor.characterRig.bones,need=["pelvis","thighL","calfL","footL","thighR","calfR","footR"];
  if(!need.every(role=>bones[role])){rig.legs=null;return null;}
  const shown=rig.bindPose.map(e=>({object:e.object,position:e.object.position.clone(),quaternion:e.object.quaternion.clone(),scale:e.object.scale.clone()}));
  rig._Restore(rig.bindPose);
  const rootQ=actor.root.getWorldQuaternion(Q()),front=V(0,0,-1).applyQuaternion(rootQ),up=V(0,1,0).applyQuaternion(rootQ);
  const Local=(bone,world)=>world.clone().applyQuaternion(bone.getWorldQuaternion(Q()).invert());
  const chain=new Set([bones.pelvis]);
  for(const side of ["L","R"])bones["thigh"+side].traverse(bone=>{if(bone.isBone)chain.add(bone);});
  const legs={pelvis:bones.pelvis,pelvisFrame:FrameQuaternion(Local(bones.pelvis,front),Local(bones.pelvis,up)),
    entries:rig.bindPose.filter(e=>chain.has(e.object)),sides:{}};
  for(const side of ["l","r"]){
    const S=side.toUpperCase(),thigh=bones["thigh"+S],calf=bones["calf"+S],foot=bones["foot"+S];
    legs.sides[side]={thigh,calf,foot,
      thighFrame:FrameQuaternion(Local(thigh,Pos(calf).sub(Pos(thigh))),Local(thigh,front)),
      calfFrame:FrameQuaternion(Local(calf,Pos(foot).sub(Pos(calf))),Local(calf,front))};
  }
  rig._Restore(shown);rig.legs=legs;return legs;
}
/** Give a bone a world rotation (and optionally a world position) under its current parent. */
function SetBoneWorld(bone,quaternion,position=null){
  bone.parent.updateWorldMatrix(true,false);
  if(position)bone.position.copy(bone.parent.worldToLocal(position.clone()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(quaternion));
  bone.updateWorldMatrix(false,true);
}
function RestoreLegs(legs){
  for(const e of legs.entries){e.object.position.copy(e.position);e.object.quaternion.copy(e.quaternion);e.object.scale.copy(e.scale);}
  legs.pelvis.updateWorldMatrix(true,true);
}
/** A LEG_POSES spec as plain numbers (for blending) and the mix of two. */
function LegSpec(pose){
  if(!pose)return null;
  const S=leg=>({ankle:[...leg.ankle],knee:[...leg.knee],flexDeg:leg.flexDeg||0});
  return {hip:[...pose.hip],up:[...pose.up],l:S(pose.l),r:S(pose.r)};
}
function MixLegSpec(a,b,t){
  if(!a)return b;if(!b||t<=0)return a;if(t>=1)return b;
  const L=(u,v)=>u.map((x,i)=>x+(v[i]-x)*t),S=(u,v)=>({ankle:L(u.ankle,v.ankle),knee:L(u.knee,v.knee),flexDeg:u.flexDeg+(v.flexDeg-u.flexDeg)*t});
  return {hip:L(a.hip,b.hip),up:L(a.up,b.up),l:S(a.l,b.l),r:S(a.r,b.r)};
}
/**
 * Pose the legs: the pelvis at `hip` (tilted to `up`, facing the body's heading), then a two-bone solve per
 * leg towards its ankle target with the knee towards `knee`; bone lengths are the rig's own (no stretch).
 */
function SolveLegs(legs,spec,frames){
  const {cam,bodyQ,Ground}=frames;
  RestoreLegs(legs);
  const Dir=v=>V(...v).applyQuaternion(bodyQ);
  const Point=p=>{const t=V(p[0],0,p[2]).applyQuaternion(bodyQ).add(cam.position);t.y=Ground(t.x,t.z)+p[1];return t;};
  const hip=Point(spec.hip),up=Dir(spec.up).normalize(),front=Dir([0,0,-1]);
  SetBoneWorld(legs.pelvis,FrameQuaternion(front,up).multiply(legs.pelvisFrame.clone().invert()),hip);
  const out={hip:hip.toArray(),sides:{}};
  for(const side of ["l","r"]){
    const L=legs.sides[side],leg=spec[side];
    const T=Pos(L.thigh),C0=Pos(L.calf),F0=Pos(L.foot),upper=T.distanceTo(C0),lower=C0.distanceTo(F0);
    const wanted=Point(leg.ankle),ray=wanted.clone().sub(T);
    const distance=Math.max(Math.abs(upper-lower)+.01,Math.min((upper+lower)*.995,ray.length())),axis=ray.normalize();
    const ankle=T.clone().addScaledVector(axis,distance),axial=(upper*upper+distance*distance-lower*lower)/(2*distance);
    const bend=Dir(leg.knee);bend.addScaledVector(axis,-bend.dot(axis));
    if(bend.lengthSq()<1e-8)bend.copy(up).addScaledVector(axis,-up.dot(axis));
    bend.normalize();
    const knee=T.clone().addScaledVector(axis,axial).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-axial*axial)));
    SetBoneWorld(L.thigh,FrameQuaternion(knee.clone().sub(T),bend).multiply(L.thighFrame.clone().invert()));
    SetBoneWorld(L.calf,FrameQuaternion(ankle.clone().sub(knee),bend).multiply(L.calfFrame.clone().invert()));
    if(leg.flexDeg){
      const hinge=V().crossVectors(ankle.clone().sub(knee).normalize(),bend).normalize();
      SetBoneWorld(L.foot,Q().setFromAxisAngle(hinge,leg.flexDeg/Degrees).multiply(L.foot.getWorldQuaternion(Q())));
    }
    out.sides[side]={hip:T.toArray(),knee:knee.toArray(),ankle:Pos(L.foot).toArray(),ankleError:Pos(L.foot).distanceTo(wanted),
      thighLength:T.distanceTo(Pos(L.calf)),calfLength:Pos(L.calf).distanceTo(Pos(L.foot))};
  }
  return out;
}
/** Put an object at a world position / rotation under its parent (compensating the parent's scale). */
function SetWorld(object,position,quaternion){
  const parent=object.parent;parent.updateWorldMatrix(true,false);
  object.position.copy(parent.worldToLocal(position.clone()));
  object.quaternion.copy(parent.getWorldQuaternion(Q()).invert().multiply(quaternion));
  const scale=parent.getWorldScale(V());object.scale.set(1/scale.x,1/scale.y,1/scale.z);
  object.updateWorldMatrix(false,true);
}
const PARTNER_BONES=Object.freeze({forearmL:["forearmL","handL"],forearmR:["forearmR","handR"],upperArmL:["upperArmL","forearmL"],
  upperArmR:["upperArmR","forearmR"],chest:["chest","neck"]});

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

// ---- 2026-09-23 hand beats (item 2 of the Opening package) ----------------------------------
// Data_OpeningStoryboards.firstPerson.hands: named RIGHT-hand poses (the left hand mirrors x) and,
// per director phase, [t, left, right] keys eased with smoothstep. A beat may count its keys from a
// director flag (`clock`) instead of the phase age. Frames: "cam" camera-local, "body" the eye with
// yaw-only axes, "ground" body axes with y measured up from the ground under the hand.
// 2026-09-25 (storyboard round, Data_OpeningFirstPersonExtra): the extra poses are merged in ("partner"
// grips solved onto another actor's bone, finger shapes, shoulder overrides), and a beat may name
// `legs` (a LEG_POSES pose, or [t, pose] keys) and first-person `props` (FP_PROPS).
const HANDS=C.firstPerson.hands;
export const OPENING_HAND_POSES=Object.freeze({...HANDS.poses,...EXTRA_HAND_POSES});
const POSES=OPENING_HAND_POSES;
/** Procedural clip axes (x strip, y rounds) in the palm frame (z fingers, y back of the hand, x across). */
const CLIP_IN_PALM=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)));
const SUPPLY_PHASES=new Set(["Banter","Orders","Incoming"]);
const HAND_BLEND_S=.5;
/** Most the solved palm may turn in one 1/60 s frame (the continuity gate is 12°). */
const HAND_TURN_DEG=10;
function Mirror(pose,side){
  if(!pose)return null;
  if(side==="r"||!pose.p)return pose;
  const x=v=>[-v[0],v[1],v[2]];
  return {...pose,p:x(pose.p),f:x(pose.f),n:x(pose.n),...(pose.sh?{sh:x(pose.sh)}:{})};
}
/** The pair of keys around `t` and the eased mix between them. */
function SampleKeys(keys,t){
  if(!keys?.length)return null;
  if(!(t>keys[0][0]))return {a:keys[0],b:keys[0],mix:0};
  for(let i=1;i<keys.length;i++)if(t<keys[i][0])return {a:keys[i-1],b:keys[i],mix:Smooth((t-keys[i-1][0])/Math.max(1e-6,keys[i][0]-keys[i-1][0]))};
  return {a:keys.at(-1),b:keys.at(-1),mix:0};
}
/** Director flag clocks: seconds since the flag (or before the first key while it is unset). */
function BeatClock(show,beat){
  if(!beat.clock)return show.Age;
  const at=show.flags?.[beat.clock],now=Number.isFinite(show.r?.time)?show.r.time:show.Age;
  return at==null?-Infinity:now-at;
}
/** A phase beat with hand keys (a beat may carry only legs / props and leave the hands to the code path). */
const HandKeys=beat=>!!beat?.keys?.length;
/** A hand / leg pose by name, or an inline pose object (the debug bench tunes with those). */
const HandPose=x=>typeof x==="string"?POSES[x]:x;
const PoseName=x=>typeof x==="string"?x:x?.name||"inline";
const LegPose=x=>typeof x==="string"?LEG_POSES[x]:x;
/** Hands, legs and props of a beat at clock t. */
function SampleBeat(beat,t){
  const s=SampleKeys(beat.keys,t);
  const legKeys=typeof beat.legs==="string"?[[0,beat.legs]]:beat.legs;
  const l=SampleKeys(legKeys,t);
  return {t,hands:s?{mix:s.mix,l:[HandPose(s.a[1]),HandPose(s.b[1])],r:[HandPose(s.a[2]),HandPose(s.b[2])],
    names:{l:PoseName(s.mix<.5?s.a[1]:s.b[1]),r:PoseName(s.mix<.5?s.a[2]:s.b[2])}}:null,
    legs:l?{a:l.a[1],b:l.b[1],mix:l.mix,name:PoseName(l.mix<.5?l.a[1]:l.b[1])}:null,props:beat.props||[]};
}
/** The beat of `phase` at the show's clock: { l:{pose,...}, r:{...} } with world targets resolved later. */
export function OpeningHandBeat(show,phase=show.phase){
  const beat=HANDS.beats[phase];if(!HandKeys(beat))return null;
  const t=BeatClock(show,beat),s=SampleBeat(beat,t).hands;
  return {t,mix:s.mix,l:s.l,r:s.r,names:s.names};
}
/** Legs and props a phase beat names (null when it names none). */
export function OpeningBodyBeat(show,phase=show.phase){
  const beat=HANDS.beats[phase];if(!beat||!beat.legs&&!beat.props?.length)return null;
  const s=SampleBeat(beat,BeatClock(show,beat));
  return {t:s.t,legs:s.legs,props:s.props};
}
/** The actor holding Shunzi's collar in a drag beat (ijaA in 01). */
function DragPartner(show){return (show.Ija?.("ijaA")||show.Executioner?.(0))?.actor;}
/** A cast member by director role (ijaA..ijaD, luo, interpreter, comrade …) → its soldier record. */
function PartnerSoldier(show,who){
  return show.SpeakerActor?.(who)||show.Ija?.(who)||show.Squad?.(who)||show.cast?.[who]||null;
}
export class OpeningFirstPerson{
  constructor(show){this.show=show;this.rig=Anatomy(show.playerBody);this.phase=null;this.lastTargets={};this.lastFrames={};this.lastPartners={};this.partnerReleases={};this.report={};this.previousFrameFrames={};this.previousFramePartners={};
    this.lastShoulders={};this.slip={};this.slipPose={};this.warned=new Set();this.props={};this.owned=[];this.override=null;this.legName=null;this.legShown=null;
    // Test bench (storyboard round): Debug.OpeningFirstPerson.Pose({left,right,legs,props,partner}).
    const debug=globalThis.Tengxian?.Debug;
    if(debug)debug.OpeningFirstPerson={Pose:spec=>this.Pose(spec),Clear:()=>this.Pose(null),State:()=>this.report,
      Poses:()=>Object.keys(POSES),Legs:()=>Object.keys(LEG_POSES),Props:()=>Object.keys(FP_PROPS)};
  }
  /**
   * Hold a pose regardless of the director's beats until cleared (null): { left, right: hand pose names
   * (or keys:[[t,l,r],...]), legs: LEG_POSES name (or [[t,name],...]), props: [FP_PROPS names], partner:
   * who every partner grip is solved onto (overrides the pose's own) }. The clock starts at the next Update.
   */
  Pose(spec){
    if(!spec){this.override=null;return true;}
    for(const name of [spec.left,spec.right,...(spec.keys||[]).flatMap(k=>k.slice(1))])if(typeof name==="string"&&!POSES[name])throw new Error(`OpeningFirstPerson.Pose: unknown hand pose ${name}`);
    const legs=typeof spec.legs==="string"||spec.legs?.hip?[[0,spec.legs]]:spec.legs||null;
    for(const [,name] of legs||[])if(typeof name==="string"&&!LEG_POSES[name])throw new Error(`OpeningFirstPerson.Pose: unknown leg pose ${name}`);
    for(const name of spec.props||[])if(!FP_PROPS[name]&&!spec.propSpecs?.[name])throw new Error(`OpeningFirstPerson.Pose: unknown prop ${name}`);
    const keys=spec.keys||(spec.left||spec.right?[[0,spec.left||"rest",spec.right||"rest"]]:null);
    this.override={beat:{keys,legs,props:spec.props||[]},partner:spec.partner||null,propSpecs:spec.propSpecs||null,at:null};
    // instant: no ease-in from the previous pose (the bench shoots with time frozen).
    if(spec.instant){this.phase=null;this.instant=true;this.legShown=null;this.legName=null;}
    return true;
  }
  /** Leave the scene clean (the director's Dispose removes the body root these hang from). */
  Dispose(){
    for(const prop of Object.values(this.props))prop.object?.removeFromParent();
    for(const item of this.owned)item.dispose?.();this.owned=[];this.props={};
  }
  Warn(key,message){if(this.warned.has(key))return;this.warned.add(key);console.warn(`[OpeningFirstPerson] ${message}`);}
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
  /**
   * A "partner" pose: the palm on a point of another actor's bone (towards the eye, `offset` in the bone's
   * frame), back of the hand towards the eye, fingers round the bone (`wrap` +1 over the top). Null when
   * the partner or the bone is missing.
   */
  PartnerTarget(pose,side,frames){
    const who=this.override?.partner||pose.partner,soldier=PartnerSoldier(this.show,who);
    const bones=soldier?.actor?.characterRig?.bones,[fromRole,toRole]=PARTNER_BONES[pose.bone]||[];
    const from=bones?.[fromRole],to=bones?.[toRole];
    if(!soldier||soldier.alive===false&&pose.requireAlive||!from||!to||soldier.actor?.root?.visible===false)
      return {missing:true,who,bone:pose.bone,reason:!soldier?"noPartner":!from||!to?"noBone":"hidden"};
    const cam=frames.cam,a=Pos(from),b=Pos(to),axis=b.clone().sub(a),length=axis.length();axis.normalize();
    const at=side==="l"&&pose.atLeft!=null?pose.atLeft:pose.at??.5;
    const point=a.clone().addScaledVector(axis,length*at);
    const out=cam.position.clone().sub(point);out.addScaledVector(axis,-out.dot(axis));
    if(out.lengthSq()<1e-8)out.set(0,1,0).addScaledVector(axis,-axis.y);
    out.normalize();
    const across=V().crossVectors(axis,out).normalize(),offset=pose.offset||[0,.045,0];
    const target=point.clone().addScaledVector(across,offset[0]).addScaledVector(out,offset[1]).addScaledVector(axis,offset[2]);
    // Fingers round the bone: over the top for wrap +1. A near-vertical bone has no "top": the fingers
    // then wrap towards the body's midline (right hand to screen left).
    const forward=across.clone(),camRight=V(1,0,0).applyQuaternion(cam.quaternion);
    if(Math.abs(forward.y)>.2){if(forward.y*(pose.wrap??1)<0)forward.negate();}
    else if(forward.dot(camRight)*(side==="l"?-1:1)>0)forward.negate();
    if(pose.twistDeg)forward.applyAxisAngle(out,(side==="l"?-1:1)*pose.twistDeg/Degrees);
    return {target,frame:FrameQuaternion(forward,out),who,bone:pose.bone,point:point.toArray()};
  }
  /** World target / finger direction / back-of-hand normal / curl of one named pose. */
  Resolve(pose,side,frames,clock){
    const {cam,bodyQ,Ground}=frames;
    if(pose.in==="partner"){
      const got=this.PartnerTarget(pose,side,frames);
      if(got.missing){
        this.Warn(`${side}:${got.who}:${got.bone}:${got.reason}`,`partner grip ${got.who}.${got.bone} unavailable (${got.reason}); ${side} hand holds ${pose.fallback||"rest"}`);
        return {...this.Resolve(Mirror(POSES[pose.fallback||"rest"],side),side,frames,clock),partner:got};
      }
      return {target:got.target,frame:got.frame,curl:pose.c,shape:ShapeOf(pose),hasShape:true,partner:got,pose};
    }
    const p=[...pose.p];
    if(pose.osc)p[2]+=pose.osc[0]*Math.sin(clock*Math.PI*2*pose.osc[1]+(side==="l"?Math.PI:0));
    let target,forward,normal;
    if(pose.in==="cam"){
      target=V(...p).applyQuaternion(cam.quaternion).add(cam.position);
      forward=V(...pose.f).applyQuaternion(cam.quaternion);normal=V(...pose.n).applyQuaternion(cam.quaternion);
    }else{
      target=V(...p).applyQuaternion(bodyQ).add(cam.position);
      if(pose.in==="ground")target.y=Ground(target.x,target.z)+p[1];
      forward=V(...pose.f).applyQuaternion(bodyQ);normal=V(...pose.n).applyQuaternion(bodyQ);
    }
    if(pose.to==="rifle"){
      const rifle=this.show.r.bunkerRifle?.view;
      if(rifle){const at=rifle.getWorldPosition(V());at.y+=.05;target.lerp(at,1);}
    }
    return {target,frame:FrameQuaternion(forward.normalize(),normal.normalize()),curl:pose.c,shape:ShapeOf(pose),hasShape:!!pose.shape,sh:pose.sh||null};
  }
  /** Beat pose for one hand: the two keys resolved and eased. */
  BeatPose(beat,side,frames,clock){
    const [a,b]=beat[side].map(pose=>Mirror(pose,side));
    const A=this.Resolve(a,side,frames,clock),B=b===a?A:this.Resolve(b,side,frames,clock),mix=beat.mix;
    const near=mix<.5?A:B,shoulderOf=R=>R.sh||null;
    return {target:A.target.lerp(B.target,mix),frame:A.frame.slerp(B.frame,mix),curl:A.curl.map((v,i)=>v+(B.curl[i]-v)*mix),
      shape:A.hasShape||B.hasShape?MixShape(A.shape,B.shape,mix):null,
      shA:shoulderOf(A),shB:shoulderOf(B),mix,
      grasp:(mix<.5?a:b).grasp===true,partner:near.partner||null,partnerPose:near.pose||null,name:mix<.5?a:b};
  }
  /** The shoulder root (camera-local, right-hand coordinates mirrored) mixed between two keys' overrides. */
  Shoulder(pose,side,Local){
    const fp=C.firstPerson,base=[fp.shoulderHalfWidthM,-fp.shoulderDropM,fp.shoulderBackM].map((v,i)=>i===0&&side==="l"?-v:v);
    const a=pose?.shA||base,b=pose?.shB||base,m=pose?.mix??0;
    return Local(...a.map((v,i)=>v+(b[i]-v)*m));
  }
  /** Legs for this frame: solve the named pose (eased from what was shown) or hide the leg meshes. */
  UpdateLegs(body,frames,clock){
    const s=this.show,legMeshes=s.playerBody?.openingLegMeshes||[],legs=LegRig(s.playerBody);
    let spec=null,name=null;
    if(body?.legs){
      const {a,b,mix}=body.legs;name=body.legs.name;
      if(!LegPose(a)||!LegPose(b))this.Warn(`legs:${a}:${b}`,`unknown leg pose ${LegPose(a)?b:a}`);
      else spec=MixLegSpec(LegSpec(LegPose(a)),LegSpec(LegPose(b)),mix);
    }
    const report={pose:name,visible:false,available:!!legs&&legMeshes.length>0};
    if(!spec||!legs){
      if(this.legShown&&legs)RestoreLegs(legs);
      this.legShown=null;this.legName=null;
      for(const mesh of legMeshes)mesh.visible=false;
      if(spec&&!legs)this.Warn("legs:rig","no leg bones on the opening player body; legs stay hidden");
      return report;
    }
    if(this.legName!==name){this.legFrom=this.legShown;this.legAt=clock;this.legName=name;}
    if(this.legFrom)spec=MixLegSpec(this.legFrom,spec,Smooth((clock-this.legAt)/X.legBlendS));
    this.legShown=spec;
    const solved=SolveLegs(legs,spec,frames);
    for(const mesh of legMeshes)mesh.visible=true;
    return {...report,visible:legMeshes.length>0,...solved};
  }
  /** First-person props (FP_PROPS) named by the beat; everything else is hidden. */
  UpdateProps(body,frames,clock,legReport){
    const s=this.show,root=s.playerBody?.root,wanted=new Set(body?.props||[]),report={};
    if(!root)return report;
    const {cam,bodyQ,Ground}=frames,Dir=v=>V(...v).applyQuaternion(bodyQ);
    for(const name of wanted){
      const spec=this.override?.propSpecs?.[name]||FP_PROPS[name];if(!spec){this.Warn(`prop:${name}`,`unknown prop ${name}`);continue;}
      if(spec.kind==="track")continue;
      const prop=this.props[name] ||= this.MakeProp(name,spec,root);
      if(!prop?.object)continue;
      let shown=true;
      if(spec.kind==="clip"){
        const palm=Palm(this.rig,spec.hand);
        const frame=this.rig.bones[spec.hand].hand.getWorldQuaternion(Q()).multiply(this.rig.anatomy[spec.hand].frame.quaternion);
        // The clip's strip (its x) along the fingers, the rounds (its y) across the palm, its z out of the
        // back of the hand; offset in the palm frame (negative y = on the palm side).
        const q=frame.clone().multiply(Q().setFromAxisAngle(V(0,1,0),(spec.yawDeg||0)/Degrees)).multiply(CLIP_IN_PALM);
        SetWorld(prop.object,palm.add(V(...spec.offset).applyQuaternion(frame)),q);
      }else if(spec.kind==="rifle"){
        const L=legReport?.sides;
        if(!L){shown=false;this.Warn(`prop:${name}:legs`,`${name} needs a leg pose; hidden`);}
        else{
          // Across one thigh (`thigh`: l/r, from its hip joint to its knee) or across both (hips to the knees' midpoint).
          const hips=spec.thigh?V(...L[spec.thigh].hip):V(...legReport.hip),knees=spec.thigh?V(...L[spec.thigh].knee):V(...L.l.knee).add(V(...L.r.knee)).multiplyScalar(.5);
          const muzzle=Dir(spec.muzzle).normalize(),up=Dir(spec.up).normalize();
          // It rests at that point (bolt and receiver on the thigh); the front grip is gripAheadM on towards the muzzle.
          const centre=hips.lerp(knees,spec.along).add(V(0,spec.lift,0)).addScaledVector(muzzle,spec.gripAheadM||0);
          const q=FrameQuaternion(muzzle.clone().negate(),up),grip=(s.loadingRifleGrip||V()).clone().applyQuaternion(q);
          let position=centre.sub(grip),quaternion=q;
          const Spec=n=>this.override?.propSpecs?.[n]||FP_PROPS[n],slideName=[...wanted].find(n=>Spec(n)?.kind==="track"&&Spec(n).prop===name);
          if(slideName){
            const track=Spec(slideName),t=clock;
            if(!(t>=track.t0))prop.slide=null;
            else{
              prop.slide ||= {from:position.clone(),q:quaternion.clone(),direction:Dir(track.direction).setY(0).normalize()};
              const u=Smooth((t-track.t0)/Math.max(1e-3,track.t1-track.t0)),from=prop.slide.from;
              position=from.clone().addScaledVector(prop.slide.direction,track.moveM*u);
              position.y=from.y+(Ground(position.x,position.z)+track.restM-from.y)*u;
              quaternion=Q().setFromAxisAngle(V(0,1,0),track.spinDeg/Degrees*u).multiply(prop.slide.q);
              report[slideName]={u,moved:Math.hypot(position.x-from.x,position.z-from.z)};
            }
          }else prop.slide=null;
          SetWorld(prop.object,position,quaternion);
        }
      }else if(spec.kind==="strap"){
        SetWorld(prop.object,cam.position,cam.quaternion);
      }
      prop.object.visible=shown;
      report[name]={visible:shown,position:prop.object.getWorldPosition(V()).toArray()};
    }
    for(const [name,prop] of Object.entries(this.props))if(!wanted.has(name)&&prop.object){prop.object.visible=false;prop.slide=null;}
    return report;
  }
  MakeProp(name,spec,root){
    const s=this.show;let object=null;
    if(spec.kind==="clip")object=s.clips?.[0]?.clone?.()||new THREE.Group();
    else if(spec.kind==="rifle")object=s.loadingRifle?.clone?.()||new THREE.Group();
    else if(spec.kind==="strap"){
      // A ribbon along the points, facing the eye (camera-local, so it hangs from the camera frame).
      const positions=[],index=[],half=spec.widthM/2;
      for(let i=0;i<spec.points.length;i++){
        const p=V(...spec.points[i]),a=V(...spec.points[Math.max(0,i-1)]),b=V(...spec.points[Math.min(spec.points.length-1,i+1)]);
        const along=b.sub(a).normalize(),across=V().crossVectors(along,V(0,0,1)).normalize();
        positions.push(...p.clone().addScaledVector(across,-half).toArray(),...p.clone().addScaledVector(across,half).toArray());
        if(i)index.push((i-1)*2,i*2,(i-1)*2+1,(i-1)*2+1,i*2,i*2+1);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute("uv",new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
      geometry.setIndex(index);geometry.computeVertexNormals();
      const material=new THREE.MeshStandardMaterial({color:spec.color,roughness:.95,metalness:0,side:THREE.DoubleSide});
      object=new THREE.Mesh(geometry,material);object.frustumCulled=false;
      // Owned geometry/material go to the director's dispose lists when it has them (it disposes those
      // on Reset/Dispose); otherwise to this.owned (Dispose()).
      for(const [list,item] of [[s.ownedGeometry,geometry],[s.owned,material]])(Array.isArray(list)?list:this.owned).push(item);
    }
    if(!object)return null;
    object.name=`OpeningFirstPerson_${name}`;object.visible=false;root.add(object);
    return {object};
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
    const now=Number.isFinite(r.time)?r.time:a;
    // The debug bench (Pose) overrides the director's beat; its clock starts at its first frame.
    const override=this.override;
    if(override&&override.at==null)override.at=now;
    const phaseBeat=HANDS.beats[p];
    // The loading rifle is in his hands until the near miss throws it out of them (Blast +0.12 s), unless the
    // director gives those phases hand keys (then the beat, e.g. palmClip with the rifle on his legs, rules).
    const legacySupply=phase=>SUPPLY_PHASES.has(phase)&&!HandKeys(HANDS.beats[phase]);
    const supply=!override&&(legacySupply(p)||p==="Blast"&&a<.12&&legacySupply("Incoming")),body=s.playerBody.root;
    body.visible=s.ready;body.position.copy(cam.position);body.quaternion.copy(cam.quaternion);body.updateWorldMatrix(true,true);
    const Local=(x,y,z)=>V(x,y,z).applyQuaternion(cam.quaternion).add(cam.position);
    const Direction=(x,y,z)=>V(x,y,z).applyQuaternion(cam.quaternion).normalize();
    const look=V(0,0,-1).applyQuaternion(cam.quaternion),camUp=V(0,1,0).applyQuaternion(cam.quaternion);
    // Heading that stays defined at any pitch: look*cos(pitch) - up*sin(pitch) is the level forward.
    const level=look.clone().multiplyScalar(camUp.y).addScaledVector(camUp,-look.y);
    const bodyQ=Q().setFromAxisAngle(V(0,1,0),Math.atan2(-level.x,-level.z));
    const eyeGround=cam.position.y-C.shunzi.lieEyeM;
    const Ground=(x,z)=>{const y=r.battlefield?.GroundHeight?.(x,z);return Number.isFinite(y)?y:eyeGround;};
    const frames={cam,bodyQ,Ground};
    const frameClock=now;
    if(this.frameClock!==frameClock){this.frameClock=frameClock;this.previousFrameFrames=Object.fromEntries(Object.entries(this.lastFrames).map(([side,q])=>[side,q.clone()]));this.previousFramePartners={...this.lastPartners};}
    const poseKey=override?"Debug":supply?"Supply":p;
    if(this.phase!==poseKey){this.phase=poseKey;this.partnerEntryFrom={};this.transitionAt=frameClock;this.transitionFrom=Object.fromEntries(Object.entries(this.lastTargets).map(([side,v])=>[side,v.clone()]));
      this.transitionFrames=Object.fromEntries(Object.entries(this.lastFrames).map(([side,q])=>[side,q.clone()]));
      this.transitionShoulders=Object.fromEntries(Object.entries(this.lastShoulders).map(([side,v])=>[side,v.clone()]));}
    if(this.instant){this.transitionFrom={};this.transitionFrames={};this.transitionShoulders={};this.previousFrameFrames={};this.instant=false;}
    const transitionAge=Math.max(0,frameClock-this.transitionAt);
    let beat=null,bodyBeat=null;
    if(override){
      const sampled=SampleBeat(override.beat,now-override.at);
      beat=sampled.hands?{t:sampled.t,...sampled.hands}:null;bodyBeat={t:sampled.t,legs:sampled.legs,props:sampled.props};
    }else{
      beat=supply?null:OpeningHandBeat(s,p);
      bodyBeat=OpeningBodyBeat(s,p);
    }
    this.report={available:true,phase:p,pose:poseKey,age:a,beat:beat?.names||null,hands:{}};
    // Legs first: moving the pelvis moves every parent of the arms, whose shoulders are then placed in world.
    const bodyClock=override?now-override.at:bodyBeat?.t??a;
    const legReport=this.UpdateLegs(bodyBeat,frames,frameClock);
    this.report.legs=legReport;
    // Supply overlays (Banter: dirt in the collar; Orders: the bolt pushed home).
    const flags=s.flags||{};
    const dig=supply&&flags.dirtAt!=null?now-flags.dirtAt:null;
    const digWeight=dig==null?0:Smooth((dig-.2)/.6)*(1-Smooth((dig-1.7)/.6));
    const bolt=supply&&p!=="Banter"&&flags.exitAt!=null?now-flags.exitAt:null;
    const boltWeight=bolt==null?0:Smooth(bolt/.25)*(1-Smooth((bolt-.75)/.3));
    const loading=p==="Banter"||p==="Orders"&&bolt==null;
    for(const side of ["l","r"]){
      const sign=side==="l"?-1:1;
      let shoulder=Local(sign*fp.shoulderHalfWidthM,-fp.shoulderDropM,fp.shoulderBackM);
      let target=Local(sign*.18,-.46,-.15),forward=Direction(0,-.4,-1),normal=Direction(sign*.25,.65,.1),curl=[14,24,14],grasp=false,shape=null,partner=null,partnerPose=null,poseName=null;
      const pole=Local(sign*.43,-.51,.1);
      if(supply){
        const cycle=loading?(Math.sin(a*2.2)+1)*.5:.5;
        target=Local(sign*.13,side==="l"?-.18:-.11+.025*cycle,-.35);
        if(side==="l"&&boltWeight>0)target.lerp(this.Resolve(HANDS.poses.boltRifle,"r",frames,now).target,boltWeight);
        forward=Direction(side==="l"?.55:-.3,.68,-.2);normal=Direction(0,-.3,1);
        curl=side==="l"?[45,67,37]:[39,51,31];
        // 「伸手往外掏」 / 「推上枪栓」 layered on the loading hand, each with its own weight.
        for(const [w,t,keys] of [[digWeight,dig-.25,[[0,"digCollar"],[.8,"digCollar"],[1.3,"dig"]]],[boltWeight,bolt,[[0,"boltGrip"],[.3,"boltPush"],[.5,"boltDown"]]]]){
          if(side!=="r"||!(w>0))continue;
          const k=SampleKeys(keys.map(([at,name])=>[at,name,name]),t);
          const over=this.BeatPose({r:[HANDS.poses[k.a[1]],HANDS.poses[k.b[1]]],mix:k.mix},"r",frames,now);
          target.lerp(over.target,w);
          const frame=FrameQuaternion(forward,normal).slerp(over.frame,w);
          forward=V(0,0,1).applyQuaternion(frame);normal=V(0,1,0).applyQuaternion(frame);
          curl=curl.map((v,i)=>v+(over.curl[i]-v)*w);
        }
      }else if(beat){
        const pose=this.BeatPose(beat,side,frames,now);
        target=pose.target;forward=V(0,0,1).applyQuaternion(pose.frame);normal=V(0,1,0).applyQuaternion(pose.frame);curl=pose.curl;grasp=pose.grasp;shape=pose.shape;
        partner=pose.partner;partnerPose=pose.partnerPose;poseName=beat.names?.[side]||null;
        shoulder=this.Shoulder(pose,side,Local);
        // A partner grip that has slipped (the partner turned out of reach) eases to its fallback pose.
        if(this.slipPose[side]!==poseName){this.slipPose[side]=poseName;this.slip[side]=0;}
        if(partnerPose&&this.slip[side]>0){
          const fallback=this.Resolve(Mirror(POSES[partnerPose.fallback||"rest"],side),side,frames,now),w=Smooth(this.slip[side]);
          target.lerp(fallback.target,w);const frame=FrameQuaternion(forward,normal).slerp(fallback.frame,w);
          forward=V(0,0,1).applyQuaternion(frame);normal=V(0,1,0).applyQuaternion(frame);
          if(shape)shape=MixShape(shape,fallback.shape,w);
        }
      }
      let otherRig,otherSide,otherShoulder;
      if(grasp&&side==="l"){otherRig=Anatomy(DragPartner(s));otherSide="l";if(!otherRig)grasp=false;}
      // A new beat eases in over HAND_BLEND_S from where the hand was (position and palm frame).
      if(this.transitionFrom?.[side]&&transitionAge<HAND_BLEND_S)target.lerpVectors(this.transitionFrom[side],target,Smooth(transitionAge/HAND_BLEND_S));
      if(this.transitionShoulders?.[side]&&transitionAge<HAND_BLEND_S){
        // The shoulder root is camera-local: blend it in the camera frame so a moving camera is not dragged.
        const from=cam.worldToLocal(this.transitionShoulders[side].clone()),to=cam.worldToLocal(shoulder.clone());
        shoulder=cam.localToWorld(from.lerp(to,Smooth(transitionAge/HAND_BLEND_S)));
      }
      // The solver must receive the same orthogonal palm basis both during and
      // after blending. Returning to the raw normal at the blend boundary can
      // change wrist-limit projection and produce a one-frame hand turn.
      const desiredFrame=FrameQuaternion(forward,normal);
      forward=V(0,0,1).applyQuaternion(desiredFrame);normal=V(0,1,0).applyQuaternion(desiredFrame);
      if(this.transitionFrames?.[side]&&transitionAge<HAND_BLEND_S){
        const frame=this.transitionFrames[side].clone().slerp(desiredFrame,Smooth(transitionAge/HAND_BLEND_S));
        forward=V(0,0,1).applyQuaternion(frame);normal=V(0,1,0).applyQuaternion(frame);
      }
      if(otherRig){
        delete this.partnerReleases[side];
        otherShoulder=Pos(otherRig.bones[otherSide].upperArm);
        const shared=Shared(target.clone(),shoulder,Reach(this.rig,side),otherShoulder,Reach(otherRig,otherSide));
        target.lerp(shared,Smooth(transitionAge/.25));
      }
      let player=Solve(this.rig,side,shoulder,target,forward,normal,pole);
      const shown=this.previousFrameFrames[side],turnCap=HAND_TURN_DEG/Degrees*Math.min(3,Math.max(.1,dt*60));
      if(shown&&player){
        const solved=FrameQuaternion(player.forward,player.dorsal);
        if(shown.angleTo(solved)>turnCap){
          const limited=shown.clone().rotateTowards(solved,turnCap);
          player=Solve(this.rig,side,shoulder,target,V(0,0,1).applyQuaternion(limited),V(0,1,0).applyQuaternion(limited),pole,true,true)||player;
        }
      }
      if(shape)Fingers(this.rig,side,curl,undefined,shape);else Fingers(this.rig,side,curl);
      const entry={contactError:player.contactError,wristBend:player.wristBend,wristTwist:player.wristTwist,reachRatio:player.reachRatio,
        upperLength:player.upperLength,lowerLength:player.lowerLength,shoulderBehind:cam.worldToLocal(shoulder.clone()).z,
        palm:player.palm.toArray(),wrist:player.wrist.toArray(),elbow:player.elbow.toArray(),dorsal:player.dorsal.toArray(),forward:player.forward.toArray(),
        pose:supply?"supply":beat?.names?.[side]||"rest",eyeDistance:player.palm.distanceTo(cam.position)};
      if(partner){
        entry.partner={who:partner.who,bone:partner.bone,missing:!!partner.missing,reason:partner.reason||null,
          gap:partner.missing?null:player.palm.distanceTo(partner.target),slip:this.slip[side]||0};
        // Slip only once the grip has eased in: an out-of-reach contact then lets go (one way until the pose changes).
        if(!partner.missing&&partnerPose&&transitionAge>=HAND_BLEND_S&&(this.slip[side]>0||player.contactError>(partnerPose.slipM??.09)))
          this.slip[side]=Math.min(1,(this.slip[side]||0)+dt/X.slipBlendS);
      }
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
        // A grasp carried over a phase change (Drag -> Snag -> KickBeam, same hand on the same collar) goes on
        // from the palm frame shown last frame; only a new grasp starts from the partner's own clip hand
        // (restarting from the clip at KickBeam turned ijaA's palm 132 deg in one frame, 09-24 run).
        const carried=previous?.rig===otherRig&&previous?.mode==="grasp";
        if(!carried&&(previous?.rig!==otherRig||previous?.phase!==p))previous=this.partnerEntryFrom[side] ||= {
          rig:otherRig,phase:p,shoulder:otherShoulder.clone(),elbow:Pos(otherRig.bones[otherSide].forearm),palm:Palm(otherRig,otherSide),
          frame:otherRig.bones[otherSide].hand.getWorldQuaternion(Q()).multiply(otherRig.anatomy[otherSide].frame.quaternion)};
        const reaching=transitionAge<.35,stepScale=Math.min(3,Math.max(.1,dt*60));
        if(reaching){
          const travel=otherTarget.clone().sub(previous.palm),distance=travel.length();
          if(distance>.055*stepScale)otherTarget.copy(previous.palm).addScaledVector(travel,.055*stepScale/distance);
        }
        let partner=Solve(otherRig,otherSide,otherShoulder,otherTarget,player.forward.clone().negate(),player.dorsal.clone().negate(),otherPole,true);
        let partnerFrame=FrameQuaternion(partner.forward,partner.dorsal);
        // A not-yet-reachable grasp has no fixed palm plane, and a held grasp can switch wrist-limit
        // branches when the partner's own clip swings his arm (ijaA's kick in KickBeam turned the palm
        // 132 deg in one frame, 09-24 run): the partner's palm turns at most HAND_TURN_DEG a frame, as
        // the player's does.
        if(previous.frame.angleTo(partnerFrame)>HAND_TURN_DEG/Degrees*stepScale){
          const limited=previous.frame.clone().rotateTowards(partnerFrame,HAND_TURN_DEG/Degrees*stepScale);
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
      this.report.hands[side]=entry;this.lastTargets[side]=player.palm.clone();this.lastFrames[side]=currentFrame;this.lastShoulders[side]=shoulder.clone();
    }
    this.report.props=this.UpdateProps(bodyBeat,frames,bodyClock,legReport.sides?legReport:null);
    if(s.supplyRoot)s.supplyRoot.visible=supply;
    if(r.bunkerRifle?.view)r.bunkerRifle.view.visible=!supply;
    if(supply){
      s.loadingRifle.quaternion.copy(cam.quaternion).multiply(Q().setFromAxisAngle(V(0,1,0),Math.PI/2));
      s.loadingRifle.position.copy(Palm(this.rig,"l")).sub(s.loadingRifleGrip.clone().applyQuaternion(s.loadingRifle.quaternion));
      // The clips are loaded by the end of the orders; the right hand leaves its clip to dig at the collar.
      s.clips[0].visible=loading&&digWeight<.05;
      s.clips[0].position.copy(Palm(this.rig,"r"));s.clips[0].quaternion.copy(cam.quaternion);
      s.clips[0].position.add(Direction(0,.027,0).multiplyScalar(.027));
      const yaowa=r.companion?.Handle?.("yaowa")?.actor?.characterRig?.bones?.handL;
      s.clips[1].visible=!!yaowa&&loading;
      if(yaowa){yaowa.getWorldPosition(s.clips[1].position);s.clips[1].position.y+=.04;}
    }
    body.updateWorldMatrix(true,true);s.firstPersonState=this.report;
  }
}
