import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {HANYANG_173R as D} from './Data_HanYang173R.mjs';
import {MaterialLibrary} from './Script_Materials.mjs';
import {PatchesOf} from './Script_MaterialPatches.mjs';
import {ConfigureHanYang173R,InstantiateHanYang173R,RepairHanYangWinding} from './Script_HanYang173R.mjs';
import {MESHES,AllMeshUrls} from './Data_Meshes.mjs';
import {DEFAULT_PLAYER_WEAPON,LOADOUTS} from './Data_Weapons.mjs';
import * as THREE from 'three';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'Model/HanYang173R');
const report=JSON.parse(fs.readFileSync(path.join(dir,'Data_GameGeometry.json'),'utf8'));
assert(!fs.existsSync(path.join(dir,'../Model_HanYang.tzm.json'))&&!MESHES.HanYang,'retired HanYang TZM must not be shipped or registered');
assert(AllMeshUrls().every(url=>!url.includes('Model_HanYang.tzm.json')));
assert.equal(DEFAULT_PLAYER_WEAPON,'HanYang');
assert(Object.values(LOADOUTS).every(loadout=>loadout.primary===null||loadout.primary===DEFAULT_PLAYER_WEAPON),'all armed player defaults use HanYang');
assert.throws(()=>InstantiateHanYang173R(null),/173R/,'missing authored model must fail explicitly, never resurrect the old gun');
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
assert(!D.wood.includes('SideWoodButton'),'source ORM defines the side button as metal');
// Island texels are the delivered bytes; only empty texels outside the islands are filled.
assert(report.texturePayloads.every(t=>/^[0-9a-f]{64}$/.test(t.sourceSha256)&&t.sourceSha256!==t.sha256&&t.islandCoverage>0));
// One shared exposure gain; roughness and metalness stay authored.
const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({metalness:1,roughness:1,map:new THREE.Texture(),roughnessMap:orm,metalnessMap:orm}));
mesh.name='ReceiverOuterCollar';const scene=new THREE.Group();scene.add(mesh);
const asset={gltf:{scene},materials:new Map()};library.anisotropy=16;ConfigureHanYang173R(asset,library);ConfigureHanYang173R(asset,library);
assert.deepEqual([mesh.material.color.toArray(),mesh.material.roughness,mesh.material.metalness],[[D.exposureGain,D.exposureGain,D.exposureGain],1,1]);
assert.equal(mesh.material.map.anisotropy,16);assert.equal(mesh.material.roughnessMap.anisotropy,16);
assert(PatchesOf(mesh.material).some(p=>String(p.key).includes('orm')));
assert(!PatchesOf(mesh.material).some(p=>/hanYang/.test(String(p.key))),'retired reflectance clamp must not return');
// A triangle wound against its authored normals is re-wound; a consistent one is untouched.
const tri=new THREE.BufferGeometry();tri.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1,0,0],3));
tri.setAttribute('normal',new THREE.Float32BufferAttribute(Array(6).fill([0,0,1]).flat(),3));tri.setIndex([0,1,2,3,4,5]);
RepairHanYangWinding(tri);assert.deepEqual(Array.from(tri.index.array),[0,1,2,3,5,4]);
mesh.geometry.dispose();mesh.material.dispose();
console.log(`ok HanYang173R: ${triangles} triangles, ${vertices} vertices, 44 parts, 132 island-exact PBR images with filled margins, authored materials, finite tangent frames and ORM decoding`);
