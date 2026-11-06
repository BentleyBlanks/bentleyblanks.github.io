// Adapt the all-fours crawl to soldier C limb lengths and actual surfaces.
// The registered override stores the resulting bone rotations and hip curve.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/build/three.module.js";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { LoadGlb, SerializeGlb } from "./Script_LugouGlbPose.mjs";
import { ClipForCharacter } from "../Script_XBotCharacters.mjs";
import { XBOT_CHARACTERS } from "../Data_XBotCharacters.mjs";

const project = path.resolve(import.meta.dirname,"..");
const modelFile = path.join(project,"Model/Character/Model_JapaneseSoldierC.glb");
const sourceFile = path.join(project,"Animation/Mixamo/Animation_Mixamo_Crawling_V1.glb");
const outputDir = path.join(project,"Animation/JapaneseSoldierC");
const Hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
async function ReadSkeleton(file) {
  const glb = LoadGlb(file), doc = glb.json;
  for (const mesh of doc.meshes||[]) for (const primitive of mesh.primitives) delete primitive.material;
  for (const key of ["materials","textures","images","samplers"]) delete doc[key];
  doc.extensionsRequired = (doc.extensionsRequired||[]).filter(name=>name!=="EXT_texture_webp");
  const b = SerializeGlb(doc,glb.bin);
  return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),"");
}
const { scene } = await ReadSkeleton(modelFile);
const source = await ReadSkeleton(sourceFile);
const def = XBOT_CHARACTERS.ijaC;
let mesh; scene.traverse(object=>{if(object.isSkinnedMesh)mesh=object;});
scene.updateMatrixWorld(true);
const bones = mesh.skeleton.bones, byName = new Map(bones.map(b=>[b.name,b]));
const Point = bone => bone.getWorldPosition(new THREE.Vector3());
const groups = { LeftFoot:[], RightFoot:[], LeftHand:[], RightHand:[] };
const p = new THREE.Vector3();
for (let i=0; i<mesh.geometry.attributes.position.count; i++) {
  p.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
  const side = p.x>=0?"Left":"Right";
  if (p.y<.105) groups[side+"Foot"].push(i);
  if (Math.abs(p.x)>.710) groups[side+"Hand"].push(i);
}
function MinY(indices) {
  let min=Infinity;
  for (const index of indices) {mesh.getVertexPosition(index,p).applyMatrix4(mesh.matrixWorld);min=Math.min(min,p.y);}
  return min;
}
function SetWorldQuaternion(bone,world) {
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(world)); scene.updateMatrixWorld(true);
}
function AimBone(bone,child,target) {
  const a=Point(bone),from=Point(child).sub(a).normalize(),to=target.clone().sub(a).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from,to);
  SetWorldQuaternion(bone,delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
}
function ArmIk(side,target) {
  const root=byName.get(side+"Arm"),middle=byName.get(side+"ForeArm"),hand=byName.get(side+"Hand");
  const a=Point(root),b=Point(middle),c=Point(hand),handQ=hand.getWorldQuaternion(new THREE.Quaternion());
  const l1=a.distanceTo(b),l2=b.distanceTo(c),direction=target.clone().sub(a);
  const distance=THREE.MathUtils.clamp(direction.length(),Math.abs(l1-l2)+1e-5,l1+l2-1e-5);
  direction.normalize(); target=a.clone().addScaledVector(direction,distance);
  const pole=b.clone().sub(a).addScaledVector(direction,-b.clone().sub(a).dot(direction));
  if(pole.lengthSq()<1e-9)pole.set(side==="Left"?1:-1,0,0).addScaledVector(direction,-direction.x*(side==="Left"?1:-1));
  pole.normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
  const height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const elbow=a.clone().addScaledVector(direction,along).addScaledVector(pole,height);
  AimBone(root,middle,elbow); AimBone(middle,hand,target); SetWorldQuaternion(hand,handQ);
}
const mixer=new THREE.AnimationMixer(scene),clip=ClipForCharacter(source.animations[0],def),action=mixer.clipAction(clip);
action.play(); action.paused=true;
const duration=clip.duration,frames=Math.ceil(duration*30),times=[];
const rotations=new Map(bones.map(b=>[b.name,[]])),hips=[];
let maxLift=0,minSkin=Infinity,minFeet=Infinity,minHands=Infinity,maxLegError=0;
const restLengths=new Map(bones.filter(b=>b.parent?.isBone).map(b=>[b.name,b.position.length()]));
for(let frame=0;frame<=frames;frame++) {
  const time=Math.min(frame/30,duration-1e-5); times.push(frame===frames?duration:time);
  action.time=time;mixer.update(0);scene.updateMatrixWorld(true);
  // A kneeling crawl is supported on its knees, not the standing soles. Raise
  // the pelvis only as far as the lower kneecap's clothing radius requires.
  const kneeMin=Math.min(Point(byName.get("LeftLeg")).y,Point(byName.get("RightLeg")).y);
  const lift=Math.max(0,.075-kneeMin),hip=byName.get("Hips");
  const hipWorld=Point(hip);hipWorld.y+=lift;hip.position.copy(hip.parent.worldToLocal(hipWorld));
  maxLift=Math.max(maxLift,lift);scene.updateMatrixWorld(true);
  for(const side of ["Left","Right"]) {
    const leg=byName.get(side+"Leg"),foot=byName.get(side+"Foot"),footQ=foot.getWorldQuaternion(new THREE.Quaternion());
    const min=MinY(groups[side+"Foot"]),raise=Math.max(0,.002-min);
    if(raise>1e-5) {
      const knee=Point(leg),v=Point(foot).sub(knee),length=v.length();
      const y=THREE.MathUtils.clamp(v.y+raise,-length+.001,length-.001);
      v.setY(0).normalize().multiplyScalar(Math.sqrt(length*length-y*y));v.y=y;
      AimBone(leg,foot,knee.clone().add(v));SetWorldQuaternion(foot,footQ);
    }
    const handMin=MinY(groups[side+"Hand"]);
    if(handMin<.002) {const target=Point(byName.get(side+"Hand"));target.y+=.002-handMin;ArmIk(side,target);}
  }
  scene.updateMatrixWorld(true);mesh.skeleton.update();
  let floor=Infinity;
  for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
    mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,p.y);
  }
  minSkin=Math.min(minSkin,floor);
  minFeet=Math.min(minFeet,MinY(groups.LeftFoot),MinY(groups.RightFoot));
  minHands=Math.min(minHands,MinY(groups.LeftHand),MinY(groups.RightHand));
  for(const b of bones) {
    rotations.get(b.name).push(...b.quaternion.toArray());
    if(restLengths.has(b.name))maxLegError=Math.max(maxLegError,Math.abs(b.position.length()-restLengths.get(b.name))*.01);
  }
  hips.push(...hip.position.toArray().map(value=>value/def.hipsScale));
}
assert.ok(minFeet>-.008,`Crawl feet ${minFeet}`);
assert.ok(minHands>-.012,`Crawl hands ${minHands}`);
assert.ok(minSkin>-.045,`Crawl body ${minSkin}`);
assert.ok(maxLegError<1e-6,`Body bone length changed ${maxLegError}`);
const xb=LoadGlb(path.join(project,"Animation/Mixamo/Model_MixamoXBot.glb")).json;
const nodes=structuredClone(xb.nodes);for(const node of nodes){delete node.mesh;delete node.skin;}
const views=[],accessors=[],chunks=[];let length=0;
function Add(values,type,width) {
  const data=new Float32Array(values),bytes=Buffer.from(data.buffer);
  views.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;
  accessors.push({bufferView:views.length-1,componentType:5126,count:values.length/width,type,
    ...(type==="SCALAR"?{min:[values[0]],max:[values.at(-1)]}:{})});return accessors.length-1;
}
const timeAccessor=Add(times,"SCALAR",1),samplers=[],channels=[];
for(const [name,values] of rotations) {
  samplers.push({input:timeAccessor,output:Add(values,"VEC4",4),interpolation:"LINEAR"});
  channels.push({sampler:samplers.length-1,target:{node:nodes.findIndex(n=>n.name===name),path:"rotation"}});
}
samplers.push({input:timeAccessor,output:Add(hips,"VEC3",3),interpolation:"LINEAR"});
channels.push({sampler:samplers.length-1,target:{node:nodes.findIndex(n=>n.name==="Hips"),path:"translation"}});
const doc={asset:{version:"2.0",generator:"Script_BakeJapaneseSoldierCContacts.mjs"},scene:0,scenes:structuredClone(xb.scenes),nodes,
  animations:[{name:source.animations[0].name,samplers,channels}],accessors,bufferViews:views,buffers:[{byteLength:length}]};
fs.mkdirSync(outputDir,{recursive:true});
const output=path.join(outputDir,"Animation_JapaneseSoldierC_Crawling.glb");
fs.writeFileSync(output,SerializeGlb(doc,Buffer.concat(chunks)));
const report={schema:1,script:"_import/Script_BakeJapaneseSoldierCContacts.mjs",character:"ijaC",
  model:{file:path.relative(project,modelFile).replaceAll("\\","/"),sha256:Hash(modelFile)},
  source:{file:path.relative(project,sourceFile).replaceAll("\\","/"),sha256:Hash(sourceFile)},
  output:{file:path.relative(project,output).replaceAll("\\","/"),sha256:Hash(output)},
  duration,frames:times.length,kneeContactJointHeightM:.075,maxPelvisLiftM:maxLift,
  minSkinnedY:minSkin,minFeetY:minFeet,minHandsY:minHands,maxBodyBoneLengthErrorM:maxLegError};
fs.writeFileSync(path.join(outputDir,"Data_JapaneseSoldierCContacts.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
