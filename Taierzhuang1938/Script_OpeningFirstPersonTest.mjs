// Read the production GLB skeletons without WebGL. This catches scale loss,
// mirrored palm frames, axial wrist twisting and arm stretching independently
// of the director's point-distance assertions. Real-scene contact remains a
// browser acceptance requirement.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as THREE from "three";
import {OpeningFirstPerson,OpeningActorAnatomy,SolveOpeningActorArm,OpeningHandBeat,OPENING_HAND_POSES,TrimOpeningPlayerBody} from "./Script_OpeningFirstPerson.mjs";
import {OPENING_STORYBOARDS as C} from "./Data_OpeningStoryboards.mjs";
import {EXTRA_HAND_POSES,HAND_SHAPES,LEG_POSES,FP_PROPS,SHOULDER_BEHIND_MIN_M} from "./Data_OpeningFirstPersonExtra.mjs";
import {OPENING_GEAR_UP as GEAR} from "./Data_OpeningFirstPersonGear.mjs";
import {GearCamera,GearPoint,GearPose,GearPackRest,GearArrivalS,GearTrack,BuildGearPack} from "./Script_OpeningFirstPersonGear.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(here,"Model/Character/Data_TengxianCharacterManifest.json"),"utf8"));
function Actor(id){
  const record=manifest.models.find(row=>row.id===id),buffer=fs.readFileSync(path.join(here,record.url));
  const gltf=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());
  const jointIds=new Set(gltf.skins.flatMap(skin=>skin.joints));
  const Build=()=>{
    const nodes=gltf.nodes.map((data,i)=>{
      const node=jointIds.has(i)?new THREE.Bone():new THREE.Object3D();node.name=data.name||"";
      if(data.matrix)new THREE.Matrix4().fromArray(data.matrix).decompose(node.position,node.quaternion,node.scale);
      else{if(data.translation)node.position.fromArray(data.translation);if(data.rotation)node.quaternion.fromArray(data.rotation);if(data.scale)node.scale.fromArray(data.scale);}
      return node;
    });
    for(const [i,data] of gltf.nodes.entries())for(const child of data.children||[])nodes[i].add(nodes[child]);
    const root=new THREE.Group();for(const i of gltf.scenes[gltf.scene||0].nodes)root.add(nodes[i]);return root;
  };
  const source=Build(),rigRoot=Build(),root=new THREE.Group();root.add(rigRoot);
  rigRoot.scale.setScalar(1.68/record.bounds.size[2]);rigRoot.rotation.y=Math.PI;
  const bones=Object.fromEntries(Object.entries(record.boneRoles).map(([role,name])=>[role,rigRoot.getObjectByName(name)]));
  return {root,characterRig:{root:rigRoot,bones,asset:{gltf:{scene:source}}}};
}

const camera=new THREE.PerspectiveCamera();camera.position.set(-40,.9,-126);camera.lookAt(-40.4,.7,-128);camera.updateMatrixWorld(true);
for(const unavailable of [undefined,{root:new THREE.Group()},{root:new THREE.Group(),characterRig:{root:new THREE.Group(),bones:{}}}]){
  assert.equal(OpeningActorAnatomy(unavailable),null,"unavailable production skeleton is explicitly unavailable");
  const show={playerBody:unavailable,phase:"Supply",Age:0,supplyRoot:new THREE.Group(),r:{player:{camera}}};
  new OpeningFirstPerson(show).Update();assert.equal(show.firstPersonState.available,false);assert.equal(show.supplyRoot.visible,false);
  if(unavailable)assert.equal(unavailable.root.visible,false,"do not show an untrimmed procedural body in front of the camera");
}
const missingFinger=Actor("TengxianNra02");
missingFinger.characterRig.root.traverse(node=>{if(node.name.endsWith("L Finger1"))node.name="UnavailableDigit";});
assert.equal(OpeningActorAnatomy(missingFinger),null,"incomplete hands cannot use uncalibrated palm frames");
// Every hand beat of the 2026-09-23 director (contract §5.3 phases): all poses and keys exist.
const PHASES=[...C.phases.Trapped,...C.phases.BunkerRescue].filter(phase=>phase!=="Released");
// The base poses plus the storyboard round's extra poses (Data_OpeningFirstPersonExtra); a beat may also
// name legs (LEG_POSES) and first-person props (FP_PROPS).
const POSES=new Set(Object.keys(OPENING_HAND_POSES));
for(const [phase,beat] of Object.entries(C.firstPerson.hands.beats)){
  assert.ok(PHASES.includes(phase),`hand beat ${phase} is a director phase`);
  const keys=beat.keys||[];
  for(let i=0;i<keys.length;i++){
    assert.ok(keys[i].slice(1).every(name=>POSES.has(name)),`${phase} key ${i} names known poses`);
    if(i)assert.ok(keys[i][0]>keys[i-1][0],`${phase} keys are in time order`);
  }
  for(const name of typeof beat.legs==="string"?[beat.legs]:(beat.legs||[]).map(k=>k[1]))assert.ok(LEG_POSES[name],`${phase} names a known leg pose (${name})`);
  for(const name of beat.props||[])assert.ok(FP_PROPS[name],`${phase} names a known first-person prop (${name})`);
}
for(const phase of PHASES)assert.ok(C.firstPerson.hands.beats[phase]?.keys?.length||["Banter","Orders","Incoming"].includes(phase),`${phase} has hands (or holds the loading rifle)`);
let samples=0,maxBend=0,maxTwist=0,maxRotation=0,groundContacts=0,maxGroundError=0;
// Hands resting on the mud must really touch it: the ground under the eye is 0.42 m down here.
const GROUND_POSES=new Set(["flat","push","clawIn","clawOut","sit","brace","limp","scrape"]);
for(const model of ["TengxianNra05","TengxianNra02"]){
  const playerBody=Actor(model),other=Actor("TengxianNra02");
  other.root.position.set(-40,-.5,-126.9);other.root.updateMatrixWorld(true);
  const r={player:{camera},companion:{Handle:()=>({actor:other})},time:0};
  const show={playerBody,ready:true,phase:"Banter",Age:0,flags:{},supplyRoot:new THREE.Group(),loadingRifle:new THREE.Group(),loadingRifleGrip:new THREE.Vector3(),clips:[new THREE.Group(),new THREE.Group()],
    r,Ija:()=>({actor:other})};
  const firstPerson=new OpeningFirstPerson(show),lengths={};
  for(const phase of PHASES){
    // Orders after the order is the gear-up: it needs the dugout (the pack at the wall, the moving eye) and has its own block below.
    if(phase==="Orders")continue;
    show.phase=phase;
    const start=r.time,beat=C.firstPerson.hands.beats[phase];
    // Flag clocks start with the phase; supply overlays (dirt, bolt) likewise.
    show.flags={dirtAt:phase==="Banter"?start:null,exitAt:null,buttAt:start,collarReleasedAt:start,checkLineAt:start,kickRifleAt:start};
    // Banter covers the collar/dig overlay.
    const frames=Math.max(50,Math.ceil(((beat?.keys?.at(-1)[0]||0)+.6)*60),phase==="Banter"?150:0);
    for(let frame=0;frame<frames;frame++){
      show.Age=frame/60;r.time=start+frame/60;firstPerson.Update(1/60);
      if(frame===frames-1)for(const [side,hand] of Object.entries(firstPerson.report.hands))if(GROUND_POSES.has(hand.pose)){
        assert.ok(hand.contactError<.02,`${model} ${phase} ${side} ${hand.pose} palm reaches the mud (${hand.contactError})`);
        groundContacts++;maxGroundError=Math.max(maxGroundError,hand.contactError);
      }
      for(const [side,hand] of Object.entries(firstPerson.report.hands)){
        lengths[side]??=[hand.upperLength,hand.lowerLength];
        assert.ok(hand.upperLength>.15&&hand.upperLength<.35&&hand.lowerLength>.15&&hand.lowerLength<.35,`${model} uses metre-scale production arm lengths`);
        assert.ok(Math.abs(hand.upperLength-lengths[side][0])<.00001&&Math.abs(hand.lowerLength-lengths[side][1])<.00001,`${phase} preserves arm bone lengths`);
        assert.ok(hand.wristBend<=42.1,`${phase} ${side} wrist bend ${hand.wristBend}`);
        assert.ok(Math.abs(hand.wristTwist)<.1,`${phase} ${side} wrist twist ${hand.wristTwist}`);
        assert.ok(hand.reachRatio<=.971,`${phase} ${side} arm reach ${hand.reachRatio}`);
        assert.ok(hand.shoulderBehind>.08,`${phase} keeps the sleeve root behind the camera`);
        assert.ok(hand.rotationStepDegrees<12,`${phase} at ${show.Age} ${side} changes hand orientation continuously (${hand.rotationStepDegrees} degrees/frame)`);
        maxBend=Math.max(maxBend,hand.wristBend);maxTwist=Math.max(maxTwist,Math.abs(hand.wristTwist));maxRotation=Math.max(maxRotation,hand.rotationStepDegrees);samples++;
      }
    }
    r.time+=.5;
  }
}
assert.ok(groundContacts>=20,"ground beats were sampled at rest ("+groundContacts+")");
// Flag clocks: an unset flag holds the first key; the key after the flag follows it.
{
  // 2026-09-30: Hold counts from the first slap (wokenAt): shamming dead the hands lie still, then the right hand claws
  // and both hands push.
  const show={phase:"Hold",Age:3,flags:{},r:{time:10}};
  assert.equal(OpeningHandBeat(show).names.r,"flatFwd","shamming dead under the hair grab the hands lie still");
  show.flags.wokenAt=9.9;assert.equal(OpeningHandBeat(show).names.l,"push","slapped awake the left hand braces");
  show.flags.wokenAt=9;assert.equal(OpeningHandBeat(show).names.r,"push","then both hands strain against the mud");
}
// A cut between phases (the camera jumps, e.g. Blast -> Wake) must not carry last frame's world shoulder
// into the new view: the shoulder blend is camera-local (campaign probe minShoulderBehind was -0.003).
{
  const playerBody=Actor("TengxianNra02"),other=Actor("TengxianNra02");other.root.position.set(-40,-.5,-126.9);other.root.updateMatrixWorld(true);
  const eye=camera.clone();const r={player:{camera:eye},companion:{Handle:()=>({actor:other})},time:0};
  const show={playerBody,ready:true,phase:PHASES[0],Age:0,flags:{},supplyRoot:new THREE.Group(),loadingRifle:new THREE.Group(),loadingRifleGrip:new THREE.Vector3(),
    clips:[new THREE.Group(),new THREE.Group()],r,Ija:()=>({actor:other})};
  const firstPerson=new OpeningFirstPerson(show);let cuts=0,minBehind=Infinity;
  for(const [i,phase] of PHASES.entries()){
    if(i){eye.position.x+=3;eye.rotateY(Math.PI/2);eye.updateMatrixWorld(true);cuts++;}
    show.phase=phase;const start=r.time;show.flags={buttAt:start,collarReleasedAt:start,checkLineAt:start,kickRifleAt:start};
    for(let frame=0;frame<20;frame++){show.Age=frame/60;r.time=start+frame/60;firstPerson.Update(1/60);
      for(const hand of Object.values(firstPerson.report.hands))minBehind=Math.min(minBehind,hand.shoulderBehind);}
    r.time+=.1;
  }
  assert.ok(cuts>5&&minBehind>.08,`the sleeve roots stay behind the eye across ${cuts} camera cuts (${minBehind})`);
}
// A helper approaching from the side must meet a clasp's palm plane even when
// the preferred elbow pole would make the wrist-flexion clamp roll that plane.
// Exercise both production skins and hands with continuously moving contacts.
let claspSamples=0,maxClaspError=0,minClaspAlignment=1,maxClaspBend=0,freeReachSamples=0,maxFreeFrameError=0;
for(const model of ["TengxianNra05","TengxianNra02"])for(const side of ["l","r"]){
  const actor=Actor(model),rig=OpeningActorAnatomy(actor),sign=side==="l"?-1:1;
  const shoulder=rig.bones[side].upperArm.getWorldPosition(new THREE.Vector3());
  const lengths=rig.armRest[side];
  for(let frame=0;frame<80;frame++){
    const t=frame/79,palm=shoulder.clone().add(new THREE.Vector3(sign*(.10+.06*t),-.20+.10*t,.20+.03*t));
    const normal=new THREE.Vector3(sign,.1*t,0).normalize(),forward=new THREE.Vector3(0,0,1);
    const pole=shoulder.clone().add(new THREE.Vector3(sign*.4,-.45,.18));
    const result=SolveOpeningActorArm(rig,side,shoulder,palm,forward,normal,pole,true);
    const alignment=result.dorsal.dot(normal);
    assert.ok(alignment>.9999,`${model} ${side} preserves opposed clasp palm plane (${alignment})`);
    assert.ok(result.contactError<.005,`${model} ${side} clasp keeps the actual palm on its contact (${result.contactError})`);
    assert.ok(result.wristBend<=42.1,`${model} ${side} clasp wrist flexion ${result.wristBend}`);
    assert.ok(Math.abs(result.upperLength-lengths.upper)<.00001&&Math.abs(result.lowerLength-lengths.lower)<.00001,"clasp elbow adjustment cannot change bone lengths");
    assert.ok(Math.abs(result.wristTwist)<.1,"clasp plane correction cannot move the error into axial wrist twist");
    claspSamples++;maxClaspError=Math.max(maxClaspError,result.contactError);minClaspAlignment=Math.min(minClaspAlignment,alignment);maxClaspBend=Math.max(maxClaspBend,result.wristBend);
  }
  for(let frame=0;frame<60;frame++){
    const turn=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,sign*(-.8+frame*.03),-.2));
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(turn),normal=new THREE.Vector3(0,1,0).applyQuaternion(turn);
    const target=shoulder.clone().add(new THREE.Vector3(sign*.15,-.55,.3));
    const result=SolveOpeningActorArm(rig,side,shoulder,target,forward,normal,shoulder.clone().add(new THREE.Vector3(sign*.4,-.45,.18)),true,true);
    const frameError=Math.max(result.forward.angleTo(forward),result.dorsal.angleTo(normal))*180/Math.PI;
    assert.ok(frameError<.001,"an unreachable reach-in keeps the presented palm frame instead of switching wrist-limit branches");
    assert.ok(result.wristBend<=42.1&&Math.abs(result.wristTwist)<.1,"a free reaching wrist remains anatomical");
    assert.ok(Math.abs(result.upperLength-lengths.upper)<.00001&&Math.abs(result.lowerLength-lengths.lower)<.00001,"a free reach cannot stretch its bones");
    freeReachSamples++;maxFreeFrameError=Math.max(maxFreeFrameError,frameError);
  }
}
// ---- 2026-09-25 storyboard round (contract Data_FirstLevelStoryboard0103Contract §4.3) ------------------
// Frozen names exist; every extra pose resolves to a known frame and shape.
for(const name of ["palmClip","flingOpen","gripForearm","gripSleeve","gripArm","pressBody","reachLeft"])assert.ok(EXTRA_HAND_POSES[name]&&OPENING_HAND_POSES[name],`extra hand pose ${name}`);
for(const name of ["sitForward","sprawl","lieSide","sitCover"])assert.ok(LEG_POSES[name],`leg pose ${name}`);
for(const name of ["palmClipProp","loadingRifleOnLegs","rifleSlide","packStrap"])assert.ok(FP_PROPS[name],`first-person prop ${name}`);
// The cut sleeve root never comes into view: every shoulder override stays behind the eye by more than the
// campaign's minShoulderBehind guard (Script_FirstLevelCampaignOpening, > 0.08 m).
assert.ok(SHOULDER_BEHIND_MIN_M>.08,"the sleeve-root margin is above the campaign guard");
for(const [name,pose] of Object.entries(EXTRA_HAND_POSES)){
  if(pose.sh)assert.ok(pose.sh[2]>=SHOULDER_BEHIND_MIN_M,`${name}: shoulder root ${pose.sh[2]} m behind the eye (≥ ${SHOULDER_BEHIND_MIN_M})`);
  assert.ok(["cam","body","ground","partner"].includes(pose.in),`${name} frame`);
  if(pose.shape)assert.ok(HAND_SHAPES[pose.shape],`${name} shape ${pose.shape}`);
  if(pose.in==="partner")assert.ok([pose.bone,pose.boneLeft??pose.bone].every(bone=>["forearmL","forearmR","upperArmL","upperArmR","chest"].includes(bone))&&OPENING_HAND_POSES[pose.fallback],`${name} partner bone and fallback`);
}
assert.equal(FP_PROPS[FP_PROPS.rifleSlide.prop]?.kind,"rifle","rifleSlide moves the loading rifle");
{
  // Continuous clothing survives mixed weights, including a knee with a small spine influence.
  // Arms/body partition the source triangles; only the head is removed, without mutating shared geometry.
  const names=["Bip002 Pelvis","Bip002 Spine","Bip002 L UpperArm","Bip002 L Thigh","Bip002 L Calf","Bip002 Head"],bones=names.map(name=>{const b=new THREE.Bone();b.name=name;return b;});
  const geometry=new THREE.BufferGeometry(),tris=[[2,2,2],[3,4,3],[0,3,4],[1,1,0],[0,0,0],[5,5,5]];
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(new Float32Array(tris.length*9),3));
  const skinIndex=[],skinWeight=[];
  for(const [triangle,tri] of tris.entries())for(const bone of tri){
    // the third triangle blends pelvis with the thigh on its first vertex (a hip triangle)
    const mixedHip=bone===0&&triangle!==4;
    skinIndex.push(bone,mixedHip?3:1,0,0);skinWeight.push(mixedHip?.4:bone===4?.98:1,mixedHip?.6:bone===4?.02:0,0,0);
  }
  geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIndex,4));geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeight,4));
  geometry.setIndex([...Array(tris.length*3).keys()]);
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial()),root=new THREE.Group();root.add(mesh,bones[0]);mesh.bind(new THREE.Skeleton(bones));
  const actor={root},{geometries,legs}=TrimOpeningPlayerBody(actor);
  assert.deepEqual([...mesh.geometry.index.array],[0,1,2],"the arm mesh keeps only the arm triangle");
  assert.equal(legs.length,1);assert.deepEqual([...legs[0].geometry.index.array],[3,4,5,6,7,8,9,10,11,12,13,14],"body keeps blended knees, hips, waist and jacket without holes");
  assert.equal(geometry.index.count,18,"shared source mesh remains intact for NPCs");
  assert.ok(legs[0].isSkinnedMesh&&legs[0].skeleton===mesh.skeleton&&legs[0].visible===false&&legs[0].frustumCulled===false,"legs share the skeleton and start hidden");
  assert.equal(actor.openingLegMeshes,legs);assert.equal(geometries.length,2,"both new geometries are handed to the caller to dispose");
}
{
  // The seated body belongs under the eyes, and looking down moves neither the lap nor the clip hand.
  const playerBody=Actor("TengxianNra02"),eye=new THREE.PerspectiveCamera(65,16/9,.05,100);
  eye.position.set(0,.95,0);eye.rotation.order="YXZ";
  const show={playerBody,ready:true,phase:"Banter",Age:5,flags:{},r:{time:5,player:{camera:eye},battlefield:{GroundHeight:()=>0}}};
  const firstPerson=new OpeningFirstPerson(show);let lastHip=null;
  for(const pitch of [-15,-35,-55,-80]){
    eye.rotation.x=pitch*Math.PI/180;eye.updateMatrixWorld(true);
    firstPerson.Pose({left:"palmClip",right:"rest",legs:"sitForward",instant:true});firstPerson.Update(1/60);
    const hip=new THREE.Vector3(...firstPerson.report.legs.hip),palm=new THREE.Vector3(...firstPerson.report.hands.l.palm);
    assert.ok(hip.z>=.08,"seated hips stay behind the eye, not detached in front of it");
    if(lastHip)assert.ok(hip.distanceTo(lastHip)<1e-5,"head pitch cannot move the body");
    assert.ok(palm.y>.6&&palm.z<-.2,`clip hand stays above the lap and ahead of the jacket at ${pitch} degrees`);
    const legs=firstPerson.rig.legs;
    const up=new THREE.Vector3(0,1,0).applyQuaternion(legs.pelvis.getWorldQuaternion(new THREE.Quaternion()).multiply(legs.pelvisFrame));
    assert.ok(up.dot(new THREE.Vector3(...LEG_POSES.sitForward.up).normalize())>.9999,"the torso retains its authored seated lean");
    assert.ok(playerBody.characterRig.bones.neck.getWorldPosition(new THREE.Vector3()).z>.08,"collar stays behind the eyes");
    lastHip=hip;
  }
}
{
  // A partner grip lands on the partner's bone (the partner's own arm is not touched), eases to its
  // fallback once out of reach, and a missing partner is reported, never re-aimed.
  const warnings=[],warn=console.warn;console.warn=message=>warnings.push(String(message));
  globalThis.Tengxian={Debug:{}};
  const playerBody=Actor("TengxianNra02"),partnerActor=Actor("TengxianIja02"),partner={actor:partnerActor,alive:true};
  const eye=new THREE.PerspectiveCamera(65,16/9,.05,100);eye.position.set(10,1,-120);eye.rotation.set(-.1,0,0,"YXZ");eye.updateMatrixWorld(true);
  const Local=(x,y,z)=>new THREE.Vector3(x,y,z).applyQuaternion(eye.quaternion).add(eye.position);
  const PlacePartner=at=>{
    partnerActor.root.position.set(0,0,0);partnerActor.root.rotation.y=0;partnerActor.root.updateMatrixWorld(true);
    const mid=partnerActor.characterRig.bones.forearmL.getWorldPosition(new THREE.Vector3()).lerp(partnerActor.characterRig.bones.handL.getWorldPosition(new THREE.Vector3()),.55);
    partnerActor.root.position.copy(at.clone().sub(mid));partnerActor.root.updateMatrixWorld(true);
  };
  PlacePartner(Local(.08,-.22,-.36));
  const bunkerRifle={view:new THREE.Group()};
  const r={player:{camera:eye},time:0,bunkerRifle},show={playerBody,ready:true,phase:"Drag",Age:0,flags:{},supplyRoot:new THREE.Group(),r,
    loadingRifle:new THREE.Group(),loadingRifleGrip:new THREE.Vector3(),clips:[new THREE.Group(),new THREE.Group()],
    SpeakerActor:who=>who==="ijaA"?partner:null};
  const firstPerson=new OpeningFirstPerson(show);
  assert.equal(typeof globalThis.Tengxian.Debug.OpeningFirstPerson?.Pose,"function","the bench is on Debug.OpeningFirstPerson");
  assert.throws(()=>firstPerson.Pose({right:"noSuchPose"}),/unknown hand pose/);
  assert.throws(()=>firstPerson.Pose({legs:"noSuchLegs"}),/unknown leg pose/);
  const partnerBefore=partnerActor.characterRig.bones.forearmL.quaternion.clone();
  const Run=(frames,step=()=>{})=>{for(let i=0;i<frames;i++){r.time+=1/60;show.Age+=1/60;step(i);firstPerson.Update(1/60);}return show.firstPersonState;};
  for(const name of ["gripForearm","gripSleeve"]){
    firstPerson.Pose({right:name});
    const state=Run(60),hand=state.hands.r,pose=EXTRA_HAND_POSES[name];
    assert.equal(hand.partner?.who,"ijaA");assert.equal(hand.partner.missing,false);
    assert.ok(hand.partner.gap<.02&&hand.contactError<.02,`${name}: the palm is on ijaA's forearm (gap ${hand.partner.gap})`);
    const a=partnerActor.characterRig.bones.forearmL.getWorldPosition(new THREE.Vector3()),b=partnerActor.characterRig.bones.handL.getWorldPosition(new THREE.Vector3());
    const onBone=new THREE.Line3(a,b).closestPointToPoint(new THREE.Vector3(...hand.palm),true,new THREE.Vector3()).distanceTo(new THREE.Vector3(...hand.palm));
    assert.ok(onBone>.02&&onBone<.08,`${name}: the palm sits on the sleeve surface, not inside the arm (${onBone})`);
    assert.ok(hand.wristBend<=42.1&&Math.abs(hand.wristTwist)<.1&&hand.reachRatio<=.971,`${name}: anatomical wrist and reach`);
    assert.ok(new THREE.Vector3(...hand.dorsal).dot(eye.position.clone().sub(new THREE.Vector3(...hand.palm)).normalize())>.3,`${name}: the back of the hand faces the eye`);
    assert.equal(hand.partner.slip,0,`${name}: a reachable grip holds`);
    assert.ok(pose.slipM>0);
  }
  assert.ok(partnerActor.characterRig.bones.forearmL.quaternion.equals(partnerBefore),"a partner grip leaves the partner's own arm to his clip");
  // Both hands on his arm at the elbow (gripArm: right on the forearm just below, left on the upper arm above).
  {const elbow=partnerActor.characterRig.bones.forearmL.getWorldPosition(new THREE.Vector3());partnerActor.root.position.add(Local(0,-.22,-.4).sub(elbow));partnerActor.root.updateMatrixWorld(true);}
  firstPerson.Pose({left:"gripArm",right:"gripArm"});
  {const state=Run(60);for(const side of ["l","r"])assert.ok(state.hands[side].partner.gap<.03,`gripArm ${side} on the arm (${state.hands[side].partner.gap})`);
    assert.equal(state.hands.l.partner.bone,"upperArmL");assert.equal(state.hands.r.partner.bone,"forearmL");
    const elbow=partnerActor.characterRig.bones.forearmL.getWorldPosition(new THREE.Vector3());
    for(const side of ["l","r"])assert.ok(new THREE.Vector3(...state.hands[side].palm).distanceTo(elbow)<.16,`gripArm ${side} holds at the elbow`);}
  // He turns away: the grip slips off (one way) and the hand eases to its fallback.
  firstPerson.Pose({right:"gripForearm"});Run(40);
  {const from=partnerActor.root.position.clone(),state=Run(60,i=>{partnerActor.root.position.copy(from).add(new THREE.Vector3(.5*i/59,0,-.6*i/59));partnerActor.root.updateMatrixWorld(true);});
    assert.equal(state.hands.r.partner.slip,1,"out of reach the grip lets go");
    assert.ok(state.hands.r.wristBend<=42.1&&state.hands.r.rotationStepDegrees<12,"letting go stays anatomical and continuous");}
  PlacePartner(Local(.08,-.22,-.36));
  // pressBody goes onto his chest with the shoulder brought forward (a partner pose honours `sh`).
  firstPerson.Pose({right:"pressBody"});
  {const state=Run(60),hand=state.hands.r;assert.equal(hand.partner.bone,"chest");assert.equal(hand.partner.missing,false);
    assert.ok(Math.abs(hand.shoulderBehind-EXTRA_HAND_POSES.pressBody.sh[2])<1e-6,`pressBody brings the shoulder forward (${hand.shoulderBehind})`);}
  PlacePartner(Local(.08,-.22,-.36));
  // Missing partner: an explicit report and one warning, the hand on the fallback pose.
  firstPerson.Pose({right:"gripForearm",partner:"nobody"});
  {const state=Run(40);assert.equal(state.hands.r.partner.missing,true);assert.equal(state.hands.r.partner.reason,"noPartner");
    assert.ok(warnings.filter(w=>/partner grip nobody\.forearmL/.test(w)).length===1,"one warning names the missing partner");}
  // Legs: every pose solves with the rig's own bone lengths; the lying pose keeps the legs behind the eye;
  // sitting / sprawled legs are in front of it. The loading rifle lies on the right thigh, then slides.
  const legs=playerBody.characterRig.bones,rest={};
  for(const side of ["L","R"])rest[side]=[legs["thigh"+side].getWorldPosition(new THREE.Vector3()).distanceTo(legs["calf"+side].getWorldPosition(new THREE.Vector3())),
    legs["calf"+side].getWorldPosition(new THREE.Vector3()).distanceTo(legs["foot"+side].getWorldPosition(new THREE.Vector3()))];
  const shots={sitForward:[.95,-15],sprawl:[.75,-14],lieSide:[.26,5],sitCover:[.72,-8]};
  for(const [name,[height,pitch]] of Object.entries(shots)){
    eye.rotation.set(pitch/180*Math.PI,0,0,"YXZ");eye.updateMatrixWorld(true);
    r.battlefield={GroundHeight:()=>eye.position.y-height};
    firstPerson.Pose({left:"rest",right:"rest",legs:name,props:name==="sitForward"?["loadingRifleOnLegs","palmClipProp"]:[]});
    const state=Run(40);
    assert.equal(state.legs.pose,name);
    for(const side of ["l","r"]){
      const L=state.legs.sides[side],S=side.toUpperCase();
      assert.ok(Math.abs(L.thighLength-rest[S][0])<1e-4&&Math.abs(L.calfLength-rest[S][1])<1e-4,`${name} ${side}: leg bones keep their length`);
      assert.ok(L.ankleError<.02,`${name} ${side}: the ankle reaches its mark (${L.ankleError})`);
      const knee=eye.worldToLocal(new THREE.Vector3(...L.knee)),ankle=eye.worldToLocal(new THREE.Vector3(...L.ankle));
      if(name==="lieSide")assert.ok(knee.z>.2&&ankle.z>.2,`lieSide ${side}: the legs stay behind the eye`);
      else assert.ok(knee.z<-.1&&ankle.z<-.3,`${name} ${side}: the legs are out in front`);
    }
    if(name==="sitForward"){
      const rifle=new THREE.Vector3(...state.props.loadingRifleOnLegs.position),knee=new THREE.Vector3(...state.legs.sides.r.knee),spec=FP_PROPS.loadingRifleOnLegs;
      const hip=new THREE.Vector3(...state.legs.sides[spec.thigh].hip),rests=hip.clone().lerp(knee,spec.along).add(new THREE.Vector3(0,spec.lift,0));
      const expected=rests.clone().addScaledVector(new THREE.Vector3(...spec.muzzle).normalize(),spec.gripAheadM||0);
      assert.ok(spec.along>=.5&&spec.along<=1.05&&spec.lift>0&&spec.lift<.12,"the loading rifle rests on the thigh, not in the air beyond the knee");
      assert.ok(state.props.loadingRifleOnLegs.visible&&rifle.distanceTo(expected)<1e-3&&rests.y>knee.y-.05,"the loading rifle lies along the right thigh, over the knee");
      assert.ok(state.props.palmClipProp.visible,"the clip is in the palm");
      firstPerson.Pose({left:"rest",right:"flingOpen",legs:"sprawl",props:["loadingRifleOnLegs","rifleSlide"]});
      const before=Run(5).props.loadingRifleOnLegs.position,after=Run(60);
      assert.ok(after.props.rifleSlide.u===1&&Math.abs(after.props.rifleSlide.moved-FP_PROPS.rifleSlide.moveM)<.1,`the rifle slides off the legs (${after.props.rifleSlide.moved})`);
      assert.ok(Math.abs(after.props.loadingRifleOnLegs.position[1]-(eye.position.y-height+FP_PROPS.rifleSlide.restM))<.01,"and settles on the ground");
      assert.ok(new THREE.Vector3(...after.hands.r.palm).distanceTo(eye.position)>=.35,"the flung hand stays 0.35 m from the eye (no half-screen of skin)");
      assert.ok(before[1]>after.props.loadingRifleOnLegs.position[1]);
    }
  }
  // Clearing the bench hides the legs again and puts the pelvis back on the body.
  firstPerson.Pose(null);show.phase="Drag";
  {const state=Run(5);assert.equal(state.legs.pose,null);assert.equal(state.legs.visible,false);}
  // The pack strap is a first-person prop that follows the camera frame.
  firstPerson.Pose({left:"reachLeft",right:"rest",props:["packStrap"]});
  {eye.rotation.set(.07,0,0,"YXZ");eye.updateMatrixWorld(true);r.battlefield={GroundHeight:()=>eye.position.y-.18};
    const state=Run(40),strap=state.props.packStrap,hand=state.hands.l;
    assert.ok(strap.visible&&new THREE.Vector3(...strap.position).distanceTo(eye.position)<1e-6,"the strap hangs from the camera frame");
    // 0.45 m, not the task's ~0.55 m: with the sleeve root kept 0.1 m behind the eye the arm ends there
    // (review 09-25: the old forward shoulder showed the cut root).
    assert.ok(hand.contactError<.02&&hand.eyeDistance>.45,`reachLeft reaches the mud ahead of the eye (${hand.eyeDistance})`);
    assert.ok(hand.shoulderBehind>.08,`reachLeft keeps the sleeve root behind the eye (${hand.shoulderBehind})`);
    assert.ok(hand.wristBend<=42.1&&hand.reachRatio<=.971,"reachLeft stays anatomical");
    const shoulder=eye.worldToLocal(new THREE.Vector3(...hand.elbow));assert.ok(shoulder.x<0,"the left arm comes from the left");
    const strapMesh=playerBody.root.getObjectByName("OpeningFirstPerson_packStrap");
    const shades=new Set([...strapMesh.geometry.getAttribute("color").array].map(v=>v.toFixed(2)));
    assert.ok(shades.size>=3&&strapMesh.getObjectByName("OpeningFirstPerson_packStrapBuckle"),"the strap has hems, stitching and a buckle (not a flat black bar)");}
  // palmMud (SB03) touches the mud with the sleeve root behind the eye.
  firstPerson.Pose({left:"rest",right:"palmMud",legs:"lieSide"});
  {eye.rotation.set(5/180*Math.PI,0,0,"YXZ");eye.updateMatrixWorld(true);r.battlefield={GroundHeight:()=>eye.position.y-.26};
    const hand=Run(40).hands.r;
    assert.ok(hand.contactError<.02&&hand.shoulderBehind>.08&&hand.wristBend<=42.1,`palmMud lies in the mud, sleeve root behind the eye (${hand.contactError}, ${hand.shoulderBehind})`);
    assert.ok(new THREE.Vector3(...hand.dorsal).dot(eye.position.clone().sub(new THREE.Vector3(...hand.palm)).normalize())>.5,"palmMud shows the back of the hand to the eye");}
  eye.rotation.set(-.1,0,0,"YXZ");eye.updateMatrixWorld(true);r.battlefield=null;
  // A partner point out of reach, or inside minEyeM of the eye, is not reached for: the hand is on its fallback
  // from the first frame and never comes nearer the eye than minEyeM; once the point is reachable the grip
  // eases on and is held.
  {
    const minEye=EXTRA_HAND_POSES.gripForearm.minEyeM;assert.ok(minEye>=.35,"gripForearm keeps 0.35 m from the eye");
    Run(30);
    for(const [where,reason] of [[Local(.05,-.1,-.22),"nearEye"],[Local(.2,-.3,-1.6),"far"]]){
      PlacePartner(where);firstPerson.Pose({left:"rest",right:"gripForearm"});
      let first=null,closest=Infinity;
      Run(30,i=>{if(i===1)first={...show.firstPersonState.hands.r.partner};});
      for(let i=0;i<30;i++){Run(1);closest=Math.min(closest,show.firstPersonState.hands.r.eyeDistance);}
      const hand=show.firstPersonState.hands.r;
      assert.equal(first.out,reason,`${reason}: reported`);assert.equal(first.slip,1,`${reason}: on the fallback from the first frame`);
      assert.equal(hand.partner.held,false,`${reason}: not held`);
      assert.ok(closest>=minEye-1e-3,`${reason}: the hand keeps ${minEye} m from the eye (${closest})`);
      firstPerson.Pose({left:"rest",right:"rest"});Run(20);
    }
    PlacePartner(Local(.08,-.22,-.36));firstPerson.Pose({left:"rest",right:"gripForearm"});
    const state=Run(60);
    assert.ok(state.hands.r.partner.held&&state.hands.r.partner.slip===0&&state.hands.r.partner.gap<.02,`a reachable point is gripped and held (${state.hands.r.partner.gap})`);
  }
  // One loading rifle at a time: the world rifle is hidden in the loading phases whoever owns the hands (the
  // bench, director hand keys) and while the lap rifle shows; after Blast it is back.
  {
    eye.rotation.set(-15/180*Math.PI,0,0,"YXZ");eye.updateMatrixWorld(true);r.battlefield={GroundHeight:()=>eye.position.y-.95};
    for(const phase of ["Banter","Orders","Incoming"]){
      show.phase=phase;show.Age=0;firstPerson.Pose({left:"palmClip",right:"rest",legs:"sitForward",props:["palmClipProp","loadingRifleOnLegs"]});
      const state=Run(10);
      assert.ok(state.props.loadingRifleOnLegs.visible&&bunkerRifle.view.visible===false&&state.worldRifleVisible===false,`${phase}: the lap rifle shows, the world rifle does not`);
    }
    show.phase="Blast";show.Age=0;firstPerson.Pose({left:"rest",right:"flingOpen",legs:"sprawl",props:["loadingRifleOnLegs","rifleSlide"]});
    assert.equal(Run(50).props.loadingRifleOnLegs.visible,true);assert.equal(bunkerRifle.view.visible,false,"Blast: the sliding lap rifle, no world rifle");
    firstPerson.Pose(null);show.phase="Wake";show.Age=0;Run(5);
    assert.equal(bunkerRifle.view.visible,true,"after Blast the world rifle is the only one");
    // A loading phase whose hands still hold the rifle (supply) does not also draw it on the legs.
    firstPerson.Pose({left:"palmClip",right:"rest",legs:"sitForward"});const legs=Run(10).legs;
    const bodyQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),0);
    const report=firstPerson.UpdateProps({props:["loadingRifleOnLegs"]},{cam:eye,bodyQ,Ground:()=>eye.position.y-.95},0,legs,true);
    assert.equal(report.loadingRifleOnLegs.visible,false,"no lap rifle while the rifle is in the hands");
    assert.ok(warnings.some(w=>/loadingRifleOnLegs is hidden while the loading rifle is in the hands/.test(w)),"and it says why");
    firstPerson.Pose(null);show.phase="Drag";Run(5);
  }
  // A missing prop source is reported, not drawn as an empty stand-in.
  {
    const loading=show.loadingRifle;show.loadingRifle=null;delete firstPerson.props.loadingRifleOnLegs;
    firstPerson.Pose({left:"rest",right:"rest",legs:"sitForward",props:["loadingRifleOnLegs"]});
    const state=Run(5);
    assert.deepEqual(state.props.loadingRifleOnLegs,{visible:false,missing:true},"a missing loading rifle is reported missing");
    assert.ok(warnings.some(w=>/loadingRifleOnLegs: the director has no loading rifle/.test(w)),"one warning names the missing source");
    show.loadingRifle=loading;firstPerson.Pose(null);Run(2);
  }
  eye.rotation.set(-.1,0,0,"YXZ");eye.updateMatrixWorld(true);
  firstPerson.Dispose();console.warn=warn;delete globalThis.Tengxian;
}
// ---- 2026-09-27 the seated fill clip (ShunziSitFillCharger, BlenderMCP) on the player body ------------------------
// 「主角应该在给自己的弹夹装弹，手上的动作是自然延续的」: through Banter and Orders until the order the body plays the baked
// clip at the seat (not two held palm poses): the hands keep moving and stay continuous, five rounds go into the charger
// one by one, the eye stays over shunzi.seat, and the order's followUp eases in from where the hands were.
{
  // Node has no fetch for the repository files: read them from disk (the loaders ask for ./... and file: URLs).
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const text=String(url),file=text.startsWith("file:")?fileURLToPath(text.split("?")[0]):path.join(here,text.split("?")[0]);
    const ok=fs.existsSync(file);return {ok,status:ok?200:404,json:async()=>JSON.parse(fs.readFileSync(file,"utf8"))};
  };
  const {LoadOpeningStoryboardAnimation,OpeningClipMeta}=await import("./Script_OpeningStoryboardAnimation.mjs");
  await LoadOpeningStoryboardAnimation();globalThis.fetch=realFetch;
  const meta=OpeningClipMeta("ShunziSitFillCharger");
  assert.ok(meta?.loop&&meta.duration>=6,"the fill clip is a baked loop");
  assert.deepEqual(meta.events.filter(e=>e.kind==="roundIn").map(e=>e.n),[1,2,3,4,5],"five rounds go in, in order");
  for(const phase of ["Banter","Orders"])assert.equal(C.firstPerson.hands.beats[phase].fill,"ShunziSitFillCharger",`${phase} plays the fill clip`);
  const seat=C.shunzi.seat;
  for(const model of ["TengxianNra05","TengxianNra02"]){
    const playerBody=Actor(model);playerBody.characterRig.modelId=model;playerBody.characterRig.clipModelId="TengxianNra02";
    playerBody.openingLegMeshes=[];
    const clip=new THREE.Group();clip.add(new THREE.Object3D());for(let i=0;i<5;i++)clip.add(new THREE.Object3D());
    const eye=new THREE.PerspectiveCamera(55,16/9,.04,100),scene=new THREE.Group();scene.add(playerBody.root);
    const r={player:{camera:eye},battlefield:{GroundHeight:()=>0},time:100};
    const show={playerBody,ready:true,phase:"Banter",Age:0,flags:{dirtAt:null,exitAt:null},supplyRoot:new THREE.Group(),loadingRifle:new THREE.Group(),
      loadingRifleGrip:new THREE.Vector3(),clips:[clip,clip.clone()],r};
    const firstPerson=new OpeningFirstPerson(show);
    const Frame=()=>{
      const e=firstPerson.PoseFill(r.time);
      if(e){eye.position.copy(e);eye.rotation.set(-.3,C.banter.seatShot.yawDeg*Math.PI/180,0,"YXZ");eye.updateMatrixWorld(true);}
      firstPerson.Update(1/60);return firstPerson.report;
    };
    const last={},path={l:0,r:0},range={l:new THREE.Box3(),r:new THREE.Box3()},seen=new Set();
    let maxStep=0,maxTurn=0,turnAt="",maxEyeOff=0,maxChargerGap=0,roundsSeen=0,hidden=0,frames=0;
    const start=r.time,banterS=12;
    show.flags.dirtAt=start+2.3;
    for(let frame=0;frame<(banterS+6)*60;frame++){
      r.time=start+frame/60;
      if(frame===banterS*60){show.phase="Orders";show.Age=0;}
      show.Age+=1/60;
      const report=Frame();
      assert.equal(report.pose,"Fill",`${model} seated frame ${frame} plays the fill clip`);
      const F=report.fill;
      maxEyeOff=Math.max(maxEyeOff,Math.hypot(F.eye[0]-seat.x,F.eye[2]-seat.z));
      assert.ok(F.eye[1]>.85&&F.eye[1]<1.05,`${model} a seated eye on the crate (SB01 eyeM) (${F.eye[1].toFixed(3)} m)`);
      roundsSeen=Math.max(roundsSeen,F.rounds);seen.add(F.rounds);if(!F.charger)hidden++;
      // 2026-09-29: the pack he will put on at the order already lies at the foot of the west wall while he sits (the player may look round at it).
      assert.ok(report.props.packRest?.visible,`${model} the pack lies at the wall while he sits (frame ${frame})`);
      if(frame===0)assert.ok(new THREE.Vector3(...report.props.packRest.position).distanceTo(GearPackRest(()=>0,GEAR).position)<1e-4,`${model} at the pack's rest place (${report.props.packRest.position})`);
      for(const side of ["l","r"]){
        const hand=report.hands[side],palm=new THREE.Vector3(...hand.palm);
        if(last[side]){const step=palm.distanceTo(last[side]);maxStep=Math.max(maxStep,step);path[side]+=step;}
        last[side]=palm;range[side].expandByPoint(palm);
        if(frame&&hand.rotationStepDegrees>maxTurn){maxTurn=hand.rotationStepDegrees;turnAt=`${side} ${(r.time-start).toFixed(2)} s (clip ${F.seconds.toFixed(2)} s, dig ${F.dig.toFixed(2)})`;}
      }
      const charger=report.props.fillCharger;
      if(charger?.visible)maxChargerGap=Math.max(maxChargerGap,new THREE.Vector3(...charger.position).distanceTo(last.l));
      frames++;
    }
    const size=side=>range[side].getSize(new THREE.Vector3()).length();
    assert.ok(maxEyeOff<.08,`${model} the eye stays over shunzi.seat (${maxEyeOff.toFixed(3)} m)`);
    assert.ok(maxStep<.06,`${model} the palms move continuously (${maxStep.toFixed(3)} m in a frame)`);
    assert.ok(maxTurn<12,`${model} the palms turn continuously (${maxTurn.toFixed(1)} deg in a frame, ${turnAt})`);
    assert.ok(path.r>2.5&&size("r")>.2,`${model} the right hand keeps working, pouch to charger (${path.r.toFixed(2)} m, ${size("r").toFixed(2)} m)`);
    assert.ok(path.l>.3&&size("l")>.05,`${model} the left hand is not frozen either (${path.l.toFixed(2)} m, ${size("l").toFixed(2)} m)`);
    assert.deepEqual([...seen].sort(),[0,1,2,3,4,5],`${model} the charger fills round by round`);
    assert.ok(hidden>0&&hidden<frames*.1,`${model} the charger is out of sight only while it is in the pocket (${hidden} frames)`);
    assert.ok(maxChargerGap<.09,`${model} the charger stays in the left hand (${maxChargerGap.toFixed(3)} m)`);
    // Luo's order: the followUp's rifle hands ease in from where the fill hands were (no jump, no snap of the palm).
    show.flags.exitAt=r.time+1/60;
    let transitionStep=0,transitionTurn=0;
    for(let frame=1;frame<40;frame++){
      r.time+=1/60;show.Age+=1/60;
      eye.position.y=Math.max(eye.position.y,.7);eye.updateMatrixWorld(true);
      firstPerson.Update(1/60);const report=firstPerson.report;
      assert.notEqual(report.pose,"Fill",`${model} after the order the body is off the fill clip`);
      for(const side of ["l","r"]){
        const palm=new THREE.Vector3(...report.hands[side].palm);
        if(frame>1)transitionStep=Math.max(transitionStep,palm.distanceTo(last[side]));
        transitionTurn=Math.max(transitionTurn,report.hands[side].rotationStepDegrees);last[side]=palm;
      }
    }
    assert.ok(transitionTurn<12,`${model} the order's hands turn from the fill hands continuously (${transitionTurn.toFixed(1)} deg)`);
    console.log(JSON.stringify({fill:model,maxEyeOff,maxStep,maxTurn,pathR:path.r,pathL:path.l,roundsSeen,hidden,maxChargerGap,transitionStep,transitionTurn}));
    firstPerson.Dispose();
  }
}
// ---- 2026-09-29 the gear-up (Data_OpeningFirstPersonGear) ---------------------------------------------------------------------
// 「主角收拾装备增加一个转身背起自己的背包拿起枪然后匆匆往门口赶，不然现在的设定走的太慢了」: from Luo's order he stands, finishes
// loading, slings the rifle, turns round to the pack at the foot of the west wall, crouches for both shoulder loops, straightens up
// and swings it onto his back, pulls the rifle off his shoulder, turns back and runs to the mouth. Run here on the real skeleton with
// the real eye path over the measured pit (floor, west earth slope): the hands must be on what they hold whenever they are seen, the
// eye must turn and travel at the speeds asked, and the pack must be where the hands take it.
const gearReport={};
{
  const S=C.shunzi,ctx={seat:S.seat,followTo:S.followTo,seatEyeM:.97};
  // The pit's height at z -125.8 (Data_FirstLevelMissionTerrain sampled through the terrain, 2026-09-29): floor, then the west slope.
  const FLOOR=-1.93,SLOPE=[[-4,2],[-3.6,1.98],[-3.2,1.54],[-2.8,.67],[-2.4,.07],[-2,0]];
  const Ground=x=>{if(x>=-2)return FLOOR;for(let i=0;i<SLOPE.length-1;i++)if(x>=SLOPE[i][0]&&x<=SLOPE[i+1][0])return FLOOR+SLOPE[i][1]+(SLOPE[i+1][1]-SLOPE[i][1])*(x-SLOPE[i][0])/(SLOPE[i+1][0]-SLOPE[i][0]);return FLOOR+2;};
  const groundOf=(x)=>Ground(x);
  const arrival=GearArrivalS(ctx);
  assert.ok(arrival<GEAR.doneS-.2&&arrival>4,`the run arrives before the action is done (${arrival.toFixed(2)} s of ${GEAR.doneS})`);
  // Where each hand is on an object: consecutive keys on the same object (rifle / pack) and the time after the last key.
  const Holds=keys=>{const out=[];for(let i=0;i<keys.length;i++){const next=keys[i+1];if(keys[i][1]!=="cam"&&(!next||next[1]===keys[i][1]))out.push([keys[i][0],next?next[0]:Infinity,keys[i][1]]);}return out;};
  const holds={l:Holds(GEAR.hands.l),r:Holds(GEAR.hands.r)};
  assert.ok(holds.l.some(h=>h[2]==="pack")&&holds.r.some(h=>h[2]==="pack")&&holds.l.some(h=>h[2]==="rifle")&&holds.r.some(h=>h[2]==="rifle"),"both hands hold the rifle and the pack in turn");
  for(const model of ["TengxianNra05","TengxianNra02"]){
    const playerBody=Actor(model);playerBody.characterRig.modelId=model;playerBody.characterRig.clipModelId="TengxianNra02";playerBody.openingLegMeshes=[];
    const eye=new THREE.PerspectiveCamera(65,16/9,.04,100);eye.rotation.order="YXZ";
    const clip=new THREE.Group();clip.add(new THREE.Object3D());for(let i=0;i<5;i++)clip.add(new THREE.Object3D());
    const r={player:{camera:eye},battlefield:{GroundHeight:groundOf},time:0};
    const show={playerBody,ready:true,phase:"Orders",Age:0,flags:{exitAt:0},supplyRoot:new THREE.Group(),loadingRifle:new THREE.Group(),loadingRifleGrip:new THREE.Vector3(),clips:[clip,clip.clone()],r};
    const firstPerson=new OpeningFirstPerson(show),lengths={};
    const end=GEAR.doneS+.5,stat={yawRps:0,speed:0,step:0,minHeight:9,maxHeight:0,turnAway:0,seen:{l:0,r:0},worstSeen:{l:0,r:0},worstAll:{l:0,r:0},packSeen:0,packBackFacing:null};
    let last=null,lastYaw=null,yaw0=null,packVisibleUntil=-1,packHiddenAfter=Infinity,firstOnBack=null;
    for(let frame=0;frame*(1/60)<=end;frame++){
      const t=frame/60,c=GearCamera(t,ctx);
      eye.position.set(c.x,Ground(c.x)+c.height,c.z);eye.rotation.set(c.pitch,c.yaw,c.roll,"YXZ");eye.updateMatrixWorld(true);
      r.time=t;show.Age=t;firstPerson.Update(1/60);
      const rep=firstPerson.report,gear=rep.gear;
      assert.equal(rep.phase,"Orders");assert.ok(gear&&Math.abs(gear.t-t)<1e-9,`${model} the gear-up runs on the clock since the order (${t.toFixed(2)})`);
      // The eye: turn rate, speed, height, no jumps.
      if(last){
        const dy=Math.abs(((c.yaw-lastYaw+3*Math.PI)%(2*Math.PI))-Math.PI)*60;stat.yawRps=Math.max(stat.yawRps,dy);
        const step=Math.hypot(eye.position.x-last.x,eye.position.y-last.y,eye.position.z-last.z);stat.step=Math.max(stat.step,step);
      }
      last={x:eye.position.x,y:eye.position.y,z:eye.position.z};lastYaw=c.yaw;yaw0??=c.yaw;
      stat.speed=Math.max(stat.speed,c.speed);stat.minHeight=Math.min(stat.minHeight,c.height);stat.maxHeight=Math.max(stat.maxHeight,c.height);
      stat.turnAway=Math.max(stat.turnAway,Math.abs(c.yaw-yaw0)*180/Math.PI);
      for(const side of ["l","r"]){
        const hand=rep.hands[side];
        lengths[side]??=[hand.upperLength,hand.lowerLength];
        assert.ok(Math.abs(hand.upperLength-lengths[side][0])<.00001&&Math.abs(hand.lowerLength-lengths[side][1])<.00001,`${model} gear-up ${side} keeps the arm bone lengths (${t.toFixed(2)})`);
        assert.ok(hand.wristBend<=42.1,`${model} gear-up ${side} wrist bend ${hand.wristBend} at ${t.toFixed(2)}`);
        assert.ok(Math.abs(hand.wristTwist)<.1,`${model} gear-up ${side} wrist twist ${hand.wristTwist} at ${t.toFixed(2)}`);
        assert.ok(hand.reachRatio<=.971,`${model} gear-up ${side} reach ${hand.reachRatio} at ${t.toFixed(2)}`);
        assert.ok(hand.shoulderBehind>.08,`${model} gear-up ${side} sleeve root behind the eye (${hand.shoulderBehind} at ${t.toFixed(2)})`);
        if(t>.6)assert.ok(hand.rotationStepDegrees<12,`${model} gear-up ${side} palm turns continuously (${hand.rotationStepDegrees.toFixed(1)} deg at ${t.toFixed(2)})`);
        // On what he holds: whenever the palm is in view and both keys around it are on the same object, it is on it.
        const palm=new THREE.Vector3(...hand.palm),ndc=palm.clone().project(eye),inView=ndc.z<1&&ndc.z>-1&&Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1;
        const holding=holds[side].find(h=>t>=h[0]+.02&&t<=h[1]);
        if(holding){
          stat.worstAll[side]=Math.max(stat.worstAll[side],hand.contactError);
          if(inView){stat.seen[side]++;stat.worstSeen[side]=Math.max(stat.worstSeen[side],hand.contactError);
            assert.ok(hand.contactError<.005,`${model} gear-up: the ${side} hand is on the ${holding[2]} while seen (${(hand.contactError*1000).toFixed(1)} mm at ${t.toFixed(2)} s)`);}
        }
        maxBend=Math.max(maxBend,hand.wristBend);maxTwist=Math.max(maxTwist,Math.abs(hand.wristTwist));maxRotation=Math.max(maxRotation,hand.rotationStepDegrees);samples++;
      }
      // The charger stands in the guide until the bolt strips it; the rifle is drawn where the gear-up puts it.
      if(Math.abs(t-GEAR.rifle.charger.offS)>.02)assert.equal(show.clips[0].visible,t<GEAR.rifle.charger.offS,`${model} gear-up charger shown only until the bolt strips it (${t.toFixed(2)} s)`);
      assert.ok(show.loadingRifle.position.distanceTo(new THREE.Vector3(...gear.rifle.position))<1e-6&&show.supplyRoot.visible,`${model} the loading rifle is drawn where the gear-up has it`);
      // The pack: seen at the wall until it is on his back, then gone (it is behind him: from the black on the timber lies on it).
      const packProp=rep.props.packRest;
      if(t<GEAR.pack.onBackS-.02){assert.ok(packProp?.visible,`${model} the pack is drawn until it is on his back (${t.toFixed(2)} s)`);packVisibleUntil=t;}
      else if(t>GEAR.pack.onBackS+.02){assert.ok(!packProp?.visible,`${model} the pack is off the screen once it is on his back (${t.toFixed(2)} s)`);packHiddenAfter=Math.min(packHiddenAfter,t);}
      // When the hands take the pack it is in the middle of the picture, its straps towards the eye, within reach.
      if(Math.abs(t-(GEAR.hands.l.find(k=>k[1]==="pack")[0]+.15))<.009&&packProp?.visible){
        const p=new THREE.Vector3(...packProp.position).project(eye),n=new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion(...gear.pack.quaternion));
        assert.ok(p.z<1&&Math.abs(p.x)<.6&&p.y<.4&&p.y>-1,`${model} the pack is in the picture as the hands take it (ndc ${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
        assert.ok(n.dot(eye.position.clone().sub(new THREE.Vector3(...packProp.position)).normalize())>.3,`${model} the pack's strap side faces the eye`);
        stat.packSeen++;stat.packBackFacing=+n.dot(eye.position.clone().sub(new THREE.Vector3(...packProp.position)).normalize()).toFixed(2);
      }
      if(gear.pack&&gear.pack.visible&&t<.02){
        const rest=GearPackRest(groundOf,GEAR);
        assert.ok(new THREE.Vector3(...gear.pack.position).distanceTo(rest.position)<1e-6,`${model} the pack starts where it lay in Banter`);
        assert.ok(Math.hypot(rest.position.x-S.seat.x,rest.position.z-S.seat.z)<1.2&&rest.position.y-Ground(rest.position.x)<.4&&rest.position.y>Ground(rest.position.x),`${model} it lies within reach of the seat, on the ground (${rest.position.toArray().map(v=>v.toFixed(2))})`);
      }
    }
    assert.ok(stat.turnAway>=140&&stat.turnAway<=185,`${model} he turns round to the pack (${stat.turnAway.toFixed(0)} deg)`);
    assert.ok(stat.yawRps>1&&stat.yawRps<6,`${model} the turn is quick but not a spin (${stat.yawRps.toFixed(1)} rad/s)`);
    assert.ok(stat.speed>=1.4&&stat.speed<=2.05,`${model} he runs to the mouth (${stat.speed.toFixed(2)} m/s; it was 0.24)`);
    assert.ok(stat.step<.06,`${model} the eye never jumps (${stat.step.toFixed(3)} m in a frame)`);
    assert.ok(stat.minHeight>=.7&&stat.minHeight<=.85&&stat.maxHeight<=C.shunzi.standEyeM+.05,`${model} the eye crouches to the pack and stands ${stat.minHeight.toFixed(2)}..${stat.maxHeight.toFixed(2)} m`);
    assert.ok(stat.seen.l>=40&&stat.seen.r>=40,`${model} both hands are seen on their objects (${stat.seen.l}, ${stat.seen.r} frames)`);
    assert.ok(stat.packSeen>=1&&packVisibleUntil>GEAR.pack.onBackS-.1&&packHiddenAfter<GEAR.pack.onBackS+.1,`${model} the pack is taken, shown and put on`);
    // At the mouth: the eye has stopped on followTo, the rifle is in both hands.
    const end0=GearCamera(GEAR.doneS,ctx),rep=firstPerson.report;
    assert.ok(Math.hypot(end0.x-C.shunzi.followTo.x,end0.z-C.shunzi.followTo.z)<.03&&end0.speed<.05,`${model} he ends on followTo, standing`);
    for(const side of ["l","r"])assert.ok(rep.hands[side].contactError<.005,`${model} both palms on the rifle at the mouth (${side} ${rep.hands[side].contactError})`);
    gearReport[model]={arrival:+arrival.toFixed(2),turnDeg:+stat.turnAway.toFixed(0),yawRps:+stat.yawRps.toFixed(2),maxMps:+stat.speed.toFixed(2),minEyeM:+stat.minHeight.toFixed(2),seen:stat.seen,worstSeenMm:{l:+(stat.worstSeen.l*1000).toFixed(1),r:+(stat.worstSeen.r*1000).toFixed(1)},worstHeldMm:{l:+(stat.worstAll.l*1000).toFixed(0),r:+(stat.worstAll.r*1000).toFixed(0)},packFacing:stat.packBackFacing};
    firstPerson.Dispose();
  }
  // The pack model builds without a factory (plain stand-in materials) and stays a small canvas pack with two loops.
  {
    const owned=[],pack=BuildGearPack(GEAR.pack,null,item=>owned.push(item));
    const box=new THREE.Box3().setFromObject(pack),size=box.getSize(new THREE.Vector3());
    assert.ok(size.x>.3&&size.x<.45&&size.y>.4&&size.y<.6&&size.z>.12&&size.z<.35,`the pack is a knapsack (${size.toArray().map(v=>v.toFixed(2))})`);
    assert.equal(pack.children.filter(child=>child.name==="OpeningGearPack_Loop").length,2,"two shoulder loops on the back panel");
    for(const item of owned)item.dispose?.();
  }
  // Tracks: monotone (no overshoot between two keys), flat over a hold.
  assert.ok(Math.abs(GearTrack([[0,0],[1,10],[2,10],[3,0]],1.5)-10)<1e-9&&GearTrack([[0,0],[1,10],[2,20]],.5)>=0&&GearTrack([[0,0],[1,10],[2,20]],.5)<=10,"the eye tracks do not overshoot their keys");
  console.log(JSON.stringify({gearUp:gearReport}));
}
console.log(JSON.stringify({samples,maxBend,maxTwist,maxRotation,groundContacts,maxGroundError,claspSamples,maxClaspError,minClaspAlignment,maxClaspBend,freeReachSamples,maxFreeFrameError}));
console.log("ok production opening arms preserve anatomical length, wrist axes and hidden shoulder roots");
