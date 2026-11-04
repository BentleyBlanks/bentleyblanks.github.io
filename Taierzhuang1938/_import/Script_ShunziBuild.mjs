// Final conversion and preservation evidence for the cap-only Shunzi V5 revision.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/build/three.module.js';

const project = path.resolve(import.meta.dirname,'..');
const sourceDir = 'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/01_顺子';
const work = 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ShunziRevision_20261104';
const output = path.join(project,'Model/Character/Model_Shunzi.glb');
const reportPath = output.replace('Model_Shunzi.glb','Data_Shunzi.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function Read(file) {
  const bytes=fs.readFileSync(file),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));
  const bin=bytes.subarray(28+n),parent=doc.nodes.map(()=>-1),world=[];
  doc.nodes.forEach((nd,i)=>nd.children?.forEach(c=>parent[c]=i));
  const World=i=>world[i]??(world[i]=(parent[i]<0?new THREE.Matrix4():World(parent[i]).clone()).multiply(doc.nodes[i].matrix?new THREE.Matrix4().fromArray(doc.nodes[i].matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(doc.nodes[i].translation??[0,0,0])),new THREE.Quaternion(...(doc.nodes[i].rotation??[0,0,0,1])),new THREE.Vector3(...(doc.nodes[i].scale??[1,1,1])))));
  const View=i=>{const v=doc.bufferViews[i];return bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);};
  const Accessor=i=>{const a=doc.accessors[i],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],T={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array}[a.componentType];const out=new T(a.count*width),raw=View(a.bufferView).subarray(a.byteOffset??0);new Uint8Array(out.buffer).set(raw.subarray(0,out.byteLength));return out;};
  const prim=doc.meshes[0].primitives[0],meshNode=doc.nodes.findIndex(n=>n.mesh===0),positions=Accessor(prim.attributes.POSITION);
  const points=[];
  for(let i=0;i<positions.length;i+=3)points.push(new THREE.Vector3().fromArray(positions,i).applyMatrix4(World(meshNode)));
  return {doc,bin,World,Accessor,View,prim,points};
}
if(!process.argv.includes('--report-only')) {
  const result=spawnSync(process.execPath,[path.join(import.meta.dirname,'Script_BuildXBotRigCharacter.mjs'),path.join(sourceDir,'Shunzi_Merged_V5_Bones.glb'),'--crown','1.8312904834747314','--out','Model/Character/Model_Shunzi.glb'],{stdio:'inherit',windowsHide:true});
  if(result.status!==0)process.exit(result.status??1);
}
const original=Read(path.join(sourceDir,'Shunzi_Merged_V5.glb')),rigSource=Read(path.join(sourceDir,'Shunzi_Merged_V5_Bones.glb')),runtime=Read(output);
const grid=new Map(),cell=0.00002;
const Key=(x,y,z)=>`${x},${y},${z}`;
for(const p of original.points){const key=Key(Math.floor(p.x/cell),Math.floor(p.y/cell),Math.floor(p.z/cell));if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p);}
let worst=0;
for(const p of runtime.points){
  const cellX=Math.floor(p.x/cell),cellY=Math.floor(p.y/cell),cellZ=Math.floor(p.z/cell);let distance=Infinity;
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const q of grid.get(Key(cellX+x,cellY+y,cellZ+z))??[])distance=Math.min(distance,p.distanceTo(q));
  assert.ok(distance<0.000003,`Rest shape changed: ${distance} m`);worst=Math.max(worst,distance);
}
const ImageHash=(glb,role)=>{const mat=glb.doc.materials[0],index=role==='baseColor'?mat.pbrMetallicRoughness.baseColorTexture.index:role==='normal'?mat.normalTexture.index:mat.pbrMetallicRoughness.metallicRoughnessTexture.index;const texture=glb.doc.textures[index],image=glb.doc.images[texture.source??texture.extensions.EXT_texture_webp.source];return hash(glb.View(image.bufferView));};
for(const role of ['baseColor','normal','metallicRoughness'])assert.equal(ImageHash(original,role),ImageHash(rigSource,role),`Binding must retain original ${role} bytes`);
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
const names=runtime.doc.skins[0].joints.map(i=>runtime.doc.nodes[i].name),headIndex=names.indexOf('Head');
const headY=new THREE.Vector3().setFromMatrixPosition(runtime.World(runtime.doc.skins[0].joints[headIndex])).y;
const weights=runtime.Accessor(runtime.prim.attributes.WEIGHTS_0),joints=runtime.Accessor(runtime.prim.attributes.JOINTS_0);
let rigidCount=0;
runtime.points.forEach((p,i)=>{if(p.y<headY+.09)return;let headWeight=0;for(let k=0;k<4;k++)if(joints[4*i+k]===headIndex)headWeight+=weights[4*i+k];assert.ok(headWeight>.99999,'Upper head and cap must be rigid');rigidCount++;});
const cap=JSON.parse(fs.readFileSync(path.join(work,'Data_ShunziCapRevisionV5.json'),'utf8'));
const binding=JSON.parse(fs.readFileSync(path.join(work,'Data_ShunziBindingV5.json'),'utf8'));
Object.assign(report,{script:'_import/Script_ShunziBuild.mjs',rigidHead:{...report.rigidHead,correctedVertices:report.rigidHead.vertices,vertices:rigidCount},preservation:{restShapeMaxErrorM:worst,bindingPreservesEmbeddedImages:true,nonCapSourcePositionsUnchanged:cap.nonCapPositionsUnchanged,sourceHeadAboveChinMaxErrorM:cap.sourceHeadAboveChinMaxErrorM},capRevision:{source:'Shunzi_Merged_V4.glb',version:5,bandWidthIncrease:cap.bandWidthIncrease,liningTriangles:cap.liningTriangles,sourceSha256:cap.sourceSha256,mergedSha256:cap.outputSha256},binding:{method:binding.binding,skeletonAndWeightDonor:binding.weightDonor,donorAppearanceExported:false,sharedWristVertices:binding.sharedWristVertices}});
fs.writeFileSync(reportPath,JSON.stringify(report,null,1)+'\n');
console.log(JSON.stringify({output,rigidHeadVertices:rigidCount,restShapeMaxErrorM:worst,bindingPreservesEmbeddedImages:true}));
