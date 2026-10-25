import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {HANYANG_173R as D} from './Data_HanYang173R.mjs';
import {MaterialLibrary} from './Script_Materials.mjs';
import {PatchesOf} from './Script_MaterialPatches.mjs';
import {ConfigureHanYang173R} from './Script_HanYang173R.mjs';
import * as THREE from 'three';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'Model/HanYang173R');
const report=JSON.parse(fs.readFileSync(path.join(dir,'Data_GameGeometry.json'),'utf8'));
const bytes=fs.readFileSync(path.join(dir,'Model_HanYang173R.glb'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),report.gameSha256);
assert.equal(report.sourceSha256,D.sourceSha256);
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
assert.equal(doc.meshes.length,44);assert.equal(doc.images.length,132);assert(!doc.skins?.length&&!doc.animations?.length);
assert(doc.buffers.every(b=>!b.uri)&&doc.images.every(i=>!i.uri));
const required=new Set([...D.wood,...D.bolt,...D.cocking,D.trigger,...D.frontSight,...D.rearSight]);
for(const n of doc.nodes)required.delete(n.name);assert.equal(required.size,0,`missing ${[...required]}`);
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function Read(index){const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],width=widths[a.type],stride=v.byteStride||width*4,offset=(v.byteOffset||0)+(a.byteOffset||0);assert.equal(a.componentType,5126);return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,c)=>bin.readFloatLE(offset+i*stride+c*4)));}
let triangles=0,vertices=0;
for(const mesh of doc.meshes)for(const p of mesh.primitives){
 triangles+=doc.accessors[p.indices].count/3;
 const ps=Read(p.attributes.POSITION),ns=Read(p.attributes.NORMAL),ts=Read(p.attributes.TANGENT),uvs=Read(p.attributes.TEXCOORD_0);vertices+=ps.length;
 assert.equal(ps.length,ts.length);assert.equal(ps.length,uvs.length);
 for(let i=0;i<ps.length;i++){
  assert([...ps[i],...ns[i],...ts[i],...uvs[i]].every(Number.isFinite));
  assert(Math.abs(Math.hypot(...ns[i])-1)<1e-3);
  assert(Math.abs(Math.hypot(...ts[i].slice(0,3))-1)<1e-3);
  assert(Math.abs(ns[i].reduce((s,x,j)=>s+x*ts[i][j],0))<2e-4);
  assert.equal(Math.abs(ts[i][3]),1);
 }
}
assert.equal(triangles,report.triangles);assert(triangles>=59000&&triangles<=60000);
for(const image of doc.images){const v=doc.bufferViews[image.bufferView],raw=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),expected=report.texturePayloads.find(i=>i.name===image.name);assert(expected);assert.equal(createHash('sha256').update(raw).digest('hex'),expected.sha256);}
for(const p of report.parts.filter(p=>!p.gameplayAdaptation))assert(Math.max(p.gameToSourceMaxM,p.sourceToGameMaxM)<=.0005,p.part);
// A no-effects material must still decode the folded packed metalness channel.
const library=new MaterialLibrary(null),orm=new THREE.Texture(),mat=new THREE.MeshStandardMaterial({roughnessMap:orm,metalnessMap:orm});
library.ConfigureExternalPbr(mat);assert.equal(mat.metalnessMap,null);
assert(PatchesOf(mat).some(p=>String(p.key).includes('orm')),'folded ORM must keep its shader patch without post effects');
const calibration=JSON.parse(fs.readFileSync(path.join(dir,'Data_MaterialCalibration.json'),'utf8'));
assert.equal(calibration.gameSha256,report.gameSha256);assert.equal(calibration.parts.length,40);
// Loading another level reuses the source material. Calibration must not
// accumulate, and its energy bound must survive alongside packed ORM decoding.
const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({metalness:1,roughness:1,roughnessMap:orm,metalnessMap:orm}));
mesh.name='ReceiverOuterCollar';const scene=new THREE.Group();scene.add(mesh);
const asset={gltf:{scene},materials:new Map()};ConfigureHanYang173R(asset,library);
const once={color:mesh.material.color.toArray(),roughness:mesh.material.roughness};ConfigureHanYang173R(asset,library);
assert.deepEqual({color:mesh.material.color.toArray(),roughness:mesh.material.roughness},once);
assert.equal(PatchesOf(mesh.material).filter(p=>p.key==='hanYangReflectance1').length,1);
assert(PatchesOf(mesh.material).some(p=>String(p.key).includes('orm')));
const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
mesh.material.onBeforeCompile(shader,{});assert(shader.fragmentShader.includes('min(diffuseColor.rgb, vec3(0.950))'));
mesh.geometry.dispose();mesh.material.dispose();
console.log(`ok HanYang173R: ${triangles} triangles, ${vertices} vertices, 44 parts, 132 byte-exact source PBR images, finite tangent frames and ORM decoding`);
