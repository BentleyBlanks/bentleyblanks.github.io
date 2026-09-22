// Read the production GLB skeletons without WebGL. This catches scale loss,
// mirrored palm frames, axial wrist twisting and arm stretching independently
// of the director's point-distance assertions. Real-scene contact remains a
// browser acceptance requirement.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as THREE from "three";
import {OpeningFirstPerson,OpeningActorAnatomy,SolveOpeningActorArm} from "./Script_OpeningFirstPerson.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(here,"Model/Character/Data_LugouCharacterManifest.json"),"utf8"));
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
const missingFinger=Actor("LugouNra02");
missingFinger.characterRig.root.traverse(node=>{if(node.name.endsWith("L Finger1"))node.name="UnavailableDigit";});
assert.equal(OpeningActorAnatomy(missingFinger),null,"incomplete hands cannot use uncalibrated palm frames");
let samples=0,maxBend=0,maxTwist=0,maxRotation=0;
for(const model of ["LugouNra01","LugouNra02"]){
  const playerBody=Actor(model),other=Actor("LugouNra02");
  other.root.position.set(-40,-.5,-126.9);other.root.updateMatrixWorld(true);
  const show={playerBody,ready:true,phase:"Supply",Age:0,supplyRoot:new THREE.Group(),loadingRifle:new THREE.Group(),loadingRifleGrip:new THREE.Vector3(),clips:[new THREE.Group(),new THREE.Group()],
    r:{player:{camera},companion:{Handle:()=>({actor:other})}}};
  const firstPerson=new OpeningFirstPerson(show),lengths={};
  for(const phase of ["Supply","Orders","Blast","Advance","Captive","Discover","Butt","Black","Interrogate","Pull","Kick"]){
    show.phase=phase;
    for(let frame=0;frame<(phase==="Pull"?190:50);frame++){
      show.Age=frame/60;firstPerson.Update(1/60);
      for(const [side,hand] of Object.entries(firstPerson.report.hands)){
        lengths[side]??=[hand.upperLength,hand.lowerLength];
        assert.ok(hand.upperLength>.15&&hand.upperLength<.35&&hand.lowerLength>.15&&hand.lowerLength<.35,`${model} uses metre-scale production arm lengths`);
        assert.ok(Math.abs(hand.upperLength-lengths[side][0])<.00001&&Math.abs(hand.lowerLength-lengths[side][1])<.00001,`${phase} preserves arm bone lengths`);
        assert.ok(hand.wristBend<=42.1,`${phase} ${side} wrist bend ${hand.wristBend}`);
        assert.ok(Math.abs(hand.wristTwist)<.1,`${phase} ${side} wrist twist ${hand.wristTwist}`);
        assert.ok(hand.reachRatio<=.971,`${phase} ${side} arm reach ${hand.reachRatio}`);
        assert.ok(hand.shoulderBehind>.08,`${phase} keeps the sleeve root behind the camera`);
        assert.ok(hand.rotationStepDegrees<20,`${phase} at ${show.Age} ${side} changes hand orientation continuously (${hand.rotationStepDegrees} degrees/frame)`);
        maxBend=Math.max(maxBend,hand.wristBend);maxTwist=Math.max(maxTwist,Math.abs(hand.wristTwist));maxRotation=Math.max(maxRotation,hand.rotationStepDegrees);samples++;
      }
    }
  }
}
// A helper approaching from the side must meet a clasp's palm plane even when
// the preferred elbow pole would make the wrist-flexion clamp roll that plane.
// Exercise both production skins and hands with continuously moving contacts.
let claspSamples=0,maxClaspError=0,minClaspAlignment=1,maxClaspBend=0,freeReachSamples=0,maxFreeFrameError=0;
for(const model of ["LugouNra01","LugouNra02"])for(const side of ["l","r"]){
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
console.log(JSON.stringify({samples,maxBend,maxTwist,maxRotation,claspSamples,maxClaspError,minClaspAlignment,maxClaspBend,freeReachSamples,maxFreeFrameError}));
console.log("ok production opening arms preserve anatomical length, wrist axes and hidden shoulder roots");
