// Inspect the current complete game bytes independently of the Blender author.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as T from "./vendor/three/build/three.module.js";
import { LoadGlb, ReadAccessor, ReadAccessorInt } from "./_import/Script_LugouGlbPose.mjs";
import { NAKAJIMA_KI4_ASSET as Asset } from "./Data_NakajimaKi4.mjs";
import { BindNakajimaKi4 } from "./Script_NakajimaKi4Motion.mjs";

const project=import.meta.dirname,asset=process.env.KI4_ASSET_ROOT??path.join(project,"Model/NakajimaKi4");
const glb=LoadGlb(path.join(asset,"Model_NakajimaKi4.glb")),g=glb.json;
const audit=JSON.parse(fs.readFileSync(path.join(asset,"Data_ExportAudit.json"),"utf8"));
const Hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
assert.equal(Hash(glb.buffer),audit.runtime.sha256);
assert.equal(audit.version,Asset.version);
assert.equal(audit.releaseProfile,"ReferenceV48GameRelease");
const nodes=g.nodes.map(n=>{
  const o=new T.Object3D();o.name=n.name??"";o.userData={...n.extras};
  if(n.matrix)new T.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);
  else {o.position.fromArray(n.translation??[0,0,0]);o.quaternion.fromArray(n.rotation??[0,0,0,1]);o.scale.fromArray(n.scale??[1,1,1]);}
  return o;
});
g.nodes.forEach((n,i)=>(n.children??[]).forEach(child=>nodes[i].add(nodes[child])));
const scene=new T.Group();for(const i of g.scenes[g.scene??0].nodes)scene.add(nodes[i]);scene.updateMatrixWorld(true);
const root=scene.getObjectByName("NakajimaKi4");assert.equal(root.userData.version,Asset.version);
assert.equal(root.userData.geometryAoReleaseRebaked,true);assert.equal(root.userData.geometryAoPending,false);
assert.equal(root.userData.referenceFidelityPassed,false,"Preserve the declared original photograph-fit failures");
assert.equal(Asset.campaignEnabled,false);
let triangles=0,vertices=0,tangentCorners=0;const bounds=new T.Box3(),parts=new Set();
const dimensions=new T.Vector3();
for(let i=0;i<g.nodes.length;i++){
 const node=g.nodes[i];if(node.mesh===undefined)continue;
 for(const name of node.extras?.sourceParts??[node.name])parts.add(name);
 for(const p of g.meshes[node.mesh].primitives){
  for(const key of ["POSITION","NORMAL","TEXCOORD_0","TEXCOORD_1"])assert.ok(p.attributes[key]!==undefined,node.name+" "+key);
  const pos=ReadAccessor(glb,p.attributes.POSITION).data,normals=ReadAccessor(glb,p.attributes.NORMAL).data;
  const uv=ReadAccessor(glb,p.attributes.TEXCOORD_0).data,uv1=ReadAccessor(glb,p.attributes.TEXCOORD_1).data;
  const indices=ReadAccessorInt(glb,p.indices).data,material=g.materials[p.material];
  for(const values of [pos,normals,uv,uv1])for(const v of values)assert.ok(Number.isFinite(v));
  assert.equal(normals.length,pos.length);assert.equal(uv.length,pos.length/3*2);assert.equal(uv1.length,uv.length);
  for(let k=0;k<pos.length;k+=3){assert.ok(Math.abs(Math.hypot(...normals.subarray(k,k+3))-1)<.001);bounds.expandByPoint(new T.Vector3(...pos.subarray(k,k+3)).applyMatrix4(nodes[i].matrixWorld));}
  if(material.normalTexture){
   assert.ok(p.attributes.TANGENT!==undefined,node.name+" explicit normal-map tangent");
   const tangents=ReadAccessor(glb,p.attributes.TANGENT).data;
   for(let k=0;k<pos.length/3;k++){
    const n=new T.Vector3(...normals.subarray(k*3,k*3+3)),t=new T.Vector3(...tangents.subarray(k*4,k*4+3));
    assert.ok(Math.abs(t.length()-1)<.001&&Math.abs(n.dot(t))<.001,`${node.name} tangent ${k}: length=${t.length()}, normalDot=${n.dot(t)}`);
    assert.ok(Math.abs(Math.abs(tangents[k*4+3])-1)<1e-6,"tangent handedness");tangentCorners++;
   }
  }
  for(let k=0;k<indices.length;k+=3){
   const ids=Array.from(indices.subarray(k,k+3));assert.ok(Math.max(...ids)<pos.length/3);
   const[a,b,c]=ids.map(j=>new T.Vector3(...pos.subarray(j*3,j*3+3)));
   assert.ok(new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)).length()>1e-12,"noncollapsed real triangle");
  }
  triangles+=indices.length/3;vertices+=pos.length/3;
 }
}
bounds.getSize(dimensions);
assert.ok(Math.abs(dimensions.x-12)<.002&&Math.abs(dimensions.y-3.31)<.04&&Math.abs(dimensions.z-8.25)<.05,"original manual metric envelope");
assert.ok(triangles<=180000&&triangles===audit.runtime.triangles);assert.equal(g.meshes.length,audit.runtime.meshes);
assert.ok(g.meshes.length<=40,"bounded draw-call grouping without merging control pivots");
assert.equal([...parts].filter(n=>n.startsWith("CylinderCoolingFin")).length,216,"all24 cooling fins on each of nine cylinders");
assert.equal([...parts].filter(n=>n.startsWith("Engine_Cylinder")).length,9);
assert.equal([...parts].filter(n=>n.startsWith("RockerCover")).length,9);
for(const name of ["Propeller_Blade-1","Propeller_Blade1","Propeller_DriveShaft","Rudder","VerticalFin","Fuselage_Monocoque"])assert.ok(parts.has(name),name);
for(const side of [-1,1])for(const[row,count]of [["Upper",6],["Lower",7]])assert.equal([...parts].filter(n=>n.startsWith(`EngineLouvreBank${row}Slat${side}_`)).length,count);
assert.ok(!g.animations?.length&&!g.cameras?.length&&!g.extensions?.KHR_lights_punctual);
for(const material of g.materials){
 if(/Shadow|InstrumentFaces|Windscreen/.test(material.name))continue;
 const pbr=material.pbrMetallicRoughness;
 for(const t of [pbr.baseColorTexture,pbr.metallicRoughnessTexture,material.normalTexture])assert.ok(t&&(t.texCoord??0)===0,"native PBR on primary UV");
 assert.equal(material.occlusionTexture?.texCoord,1,"baked occlusion on distinct UV1");
}
for(const image of g.images){assert.ok(image.bufferView!==undefined&&!image.uri);assert.ok(["image/png","image/webp"].includes(image.mimeType));}
assert.equal(g.images.length,audit.runtime.images);
const glass=g.materials.find(m=>m.name==="Material_Windscreen");
assert.equal(glass.alphaMode??"OPAQUE","OPAQUE");assert.equal(glass.pbrMetallicRoughness.baseColorFactor?.[3]??1,1);
assert.ok(glass.extensions?.KHR_materials_transmission?.transmissionFactor>.9);
assert.equal(audit.sourceServiceAudit.actualApertures,10);assert.equal(audit.sourceServiceAudit.retainedSkinObstructions,0);
assert.equal(audit.runtimeServiceAudit.runtimeObstructions,0);
assert.equal(audit.runtimeServiceAudit.sourceExitRaySamples,audit.sourceServiceAudit.unobstructedSourceExitRays);
assert.equal(audit.rigidMotionAudit.totalSamples,80);assert.equal(audit.rigidMotionAudit.trueTriangleIntersections,0);
assert.equal(audit.cowlEngineClearance.trueTriangleIntersections,0);
assert.equal(audit.cowlEngineClearance.actualImportedEngineParts,252);
assert.equal(audit.actualHighToGameNormalField.smoothHingeSamples.length,176);
assert.ok(audit.actualHighToGameNormalField.maxDifferenceDegrees<5&&audit.actualHighToGameNormalField.maxSurfaceDistanceM<.0015);
assert.ok(audit.savedLowToActualRuntimeNormalField.maxDifferenceDegrees<1);
assert.ok(audit.pbrImages.every(image=>image.allPixelsMatchBake));
assert.ok(audit.aoFieldAgreement.ok&&audit.aoFieldAgreement.samples===35&&audit.aoFieldAgreement.maxAoDifference<=1/255);
assert.equal(audit.aoFieldAgreement.runtimeSha256,audit.runtime.sha256);
for(const[name,digest]of Object.entries(audit.scripts))assert.equal(Hash(fs.readFileSync(path.join(project,"_blender",name),"utf8").replace(/\r\n/g,"\n")),digest,name);

const rig=BindNakajimaKi4(scene),rest=Object.fromEntries(Object.entries(rig.controls).map(([key,node])=>[key,node.quaternion.clone()]));
assert.equal(Object.keys(rig.controls).length,10);
const restPivots=Object.fromEntries(Object.entries(rig.controls).map(([key,node])=>[key,node.position.clone()]));
rig.SetPose({propellerRadians:Math.PI/3,wheelTravelM:2,rudderRadians:.25,elevatorRadians:.2,aileronRadians:.15,observerYawRadians:.1,observerElevationRadians:.08});
for(const[key,node]of Object.entries(rig.controls)){
 assert.ok(node.position.distanceTo(restPivots[key])<1e-6,"authored pivot remains fixed in its parent: "+key);
 const expected=node.parent.localToWorld(restPivots[key].clone());
 assert.ok(node.getWorldPosition(new T.Vector3()).distanceTo(expected)<1e-6,"nested pivot follows its real parent: "+key);
 assert.ok(node.quaternion.clone().normalize().angleTo(rest[key].clone().normalize())>.01,"authored pivot actually moves: "+key);
}
rig.SetPose({rudderRadians:100});assert.ok(Math.abs(rig.controls.rudder.quaternion.clone().normalize().angleTo(rest.rudder.clone().normalize())-Asset.limitsRadians.rudder)<1e-7);
const beforeInvalid=rig.Inspect();assert.throws(()=>rig.SetPose({elevatorRadians:NaN}),/finite/);assert.deepEqual(rig.Inspect(),beforeInvalid);
rig.Reset();for(const[key,node]of Object.entries(rig.controls))assert.ok(node.quaternion.toArray().every((value,index)=>Math.abs(value-rest[key].toArray()[index])<1e-15),"authored installation restored");
console.log(JSON.stringify({ok:true,version:Asset.version,triangles,vertices,meshes:g.meshes.length,images:g.images.length,tangentCorners,dimensionsM:dimensions.toArray(),controls:10}));
