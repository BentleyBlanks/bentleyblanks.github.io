import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {TYPE38_511 as D} from './Data_Type38_511.mjs';
import {WEAPON_MESH_BY_ID} from './Data_Meshes.mjs';
const vendor=new URL('./vendor/three/',import.meta.url);
const hooks=registerHooks({resolve(id,context,next){if(id==='three')return {url:new URL('build/three.module.js',vendor).href,shortCircuit:true};return next(id,context);},load(url,context,next){if(url.startsWith(vendor.href)&&url.endsWith('.js'))return {format:'module',source:fs.readFileSync(new URL(url),'utf8'),shortCircuit:true};return next(url,context);}});
const THREE=await import('three');
const {GLTFLoader}=await import('./vendor/three/examples/jsm/loaders/GLTFLoader.js');
const {InstantiateType38_511,ConfigureType38_511}=await import('./Script_Type38_511.mjs');
const {MaterialLibrary}=await import('./Script_Materials.mjs');
hooks.deregister();
const bytes=fs.readFileSync(new URL('./Model/Type38_511/Model_Type38_511.glb',import.meta.url));
const contract=JSON.parse(fs.readFileSync(new URL('./Model/Type38_511/Data_Type38_511.json',import.meta.url),'utf8'));
const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n)),bin=bytes.subarray(28+n);
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
assert.equal(createHash('sha256').update(bytes).digest('hex'),D.sourceSha256);
assert.equal(contract.runtimeSha256,D.sourceSha256);
assert.equal(contract.approvedReductionTriangles,69454);assert.equal(contract.triangles,D.triangles);
assert.equal(WEAPON_MESH_BY_ID.Type38,'Type38_511');
assert.equal(doc.meshes.length,45);assert.equal(doc.images.length,116);
assert.equal(doc.meshes.flatMap(mesh=>mesh.primitives).reduce((sum,p)=>sum+doc.accessors[p.indices].count/3,0),69586);
assert(!doc.animations?.length&&!doc.skins?.length);
for(const [index,image]of doc.images.entries()){assert.equal(image.uri,undefined);const v=doc.bufferViews[image.bufferView],raw=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),expected=contract.imagePayloads[index];assert.equal(expected.index,index);assert.equal(expected.name,image.name);assert.equal(createHash('sha256').update(raw).digest('hex'),expected.sha256);}
assert.equal(contract.adaptation.notchWidthM,.0045);assert.equal(contract.adaptation.runtimeTriangles-contract.adaptation.sourceTriangles,132);
// Node has no image decoder: retain the complete real geometry and strip only
// texture references for the factory/ownership and physical notch checks.
const clean=structuredClone(doc);delete clean.images;delete clean.textures;delete clean.samplers;
for(const material of clean.materials){for(const key of ['normalTexture','occlusionTexture','emissiveTexture'])delete material[key];delete material.extensions;delete material.pbrMetallicRoughness.baseColorTexture;delete material.pbrMetallicRoughness.metallicRoughnessTexture;}
delete clean.extensionsRequired;delete clean.extensionsUsed;
let j=Buffer.from(JSON.stringify(clean));j=Buffer.concat([j,Buffer.alloc((-j.length)&3,32)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+bin.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
const stripped=Buffer.concat([header,j,binHeader,bin]);
const gltf=await new GLTFLoader().parseAsync(stripped.buffer.slice(stripped.byteOffset,stripped.byteOffset+stripped.byteLength),'');
const lodBytes=fs.readFileSync(new URL('./Model/Type38_511/Model_Type38_511NpcLod.glb',import.meta.url));
const lodContract=JSON.parse(fs.readFileSync(new URL('./Model/Type38_511/Data_Type38NpcLod.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(lodBytes).digest('hex'),lodContract.sha256);
assert.equal(lodContract.sourceSha256,D.sourceSha256);assert.equal(lodContract.after,1152);assert(lodContract.maxSampledSurfaceDeviationM<.0002);
const lodGltf=await new GLTFLoader().parseAsync(lodBytes.buffer.slice(lodBytes.byteOffset,lodBytes.byteOffset+lodBytes.byteLength),'');
const npcLod=new Map();lodGltf.scene.updateMatrixWorld(true);lodGltf.scene.traverse(mesh=>{if(mesh.isMesh)npcLod.set(mesh.userData.SourceObject,mesh);});
assert.equal(npcLod.size,1);assert(npcLod.has(D.npcLodPart));
const npcGeometry=npcLod.get(D.npcLodPart).geometry;
for(const name of ['position','normal','uv','tangent'])assert([...npcGeometry.attributes[name].array].every(Number.isFinite));
for(let i=0;i<npcGeometry.attributes.normal.count;i++){
 const normal=new THREE.Vector3().fromBufferAttribute(npcGeometry.attributes.normal,i),tangent=new THREE.Vector3().fromBufferAttribute(npcGeometry.attributes.tangent,i);
 assert(Math.abs(normal.length()-1)<1e-4&&Math.abs(tangent.length()-1)<1e-4&&Math.abs(normal.dot(tangent))<1e-4);
}
const asset={gltf,npcLod,materials:new Map()},library=new MaterialLibrary(null);
ConfigureType38_511(asset,library);
const fps=InstantiateType38_511(asset),world=InstantiateType38_511(asset,{batch:true});
const npc=InstantiateType38_511(asset,{batch:true,npcLod:true});
assert.equal(npc.tris,D.npcTriangles);assert.equal(npc.tris,64978);assert.equal(npc.meshes.length,45);
for(let i=0;i<npc.meshes.length;i++){
 assert.equal(npc.meshes[i].material,fps.meshes[i].material);
 if(npc.meshes[i].userData.type38Part!==D.npcLodPart)assert.deepEqual(npc.meshes[i].geometry.attributes.position.array,world.meshes[i].geometry.attributes.position.array,'all other44 parts retain exact full geometry');
}
assert.equal(fps.tris,69586);assert.equal(world.tris,69586);assert.equal(fps.meshes.length,45);
assert(fps.meshes.every((mesh,i)=>mesh.geometry!==world.meshes[i].geometry&&mesh.material===world.meshes[i].material));
assert.equal(fps.nodes.get('boltBody').children.length,4);assert.equal(fps.nodes.get('dustCover').children.length,2);
assert(fps.meshes.every(mesh=>mesh.material.color.r===D.exposureGain));
assert(fps.meshes.every(mesh=>mesh.material.userData.externalMaterialClass==='authored'&&!mesh.material.userData.materialShadingSurface.skin));
const namedShell=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshPhysicalMaterial({clearcoat:.6,clearcoatRoughness:.3,specularIntensity:.4}));
namedShell.material.name='Head_Skin_VisualMetalShell';const sourceMaterial=namedShell.material;
library.ConfigureExternalPbr(sourceMaterial,{mesh:namedShell,preserveAuthored:true});
assert.equal(namedShell.material,sourceMaterial);assert.equal(sourceMaterial.clearcoat,.6);assert.equal(sourceMaterial.specularIntensity,.4);
library.ConfigureExternalPbr(sourceMaterial,{mesh:namedShell});
assert.equal(sourceMaterial.userData.externalMaterialClass,'authored','explicit PBR policy persists across repeated configuration');
namedShell.geometry.dispose();namedShell.material.dispose();
const head=fps.meshes.find(mesh=>mesh.userData.type38Part==='Exterior_ShortTransverseHead71');
fps.root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(-.000284,.055,0),new THREE.Vector3(0,0,-1));ray.layers.enableAll();
assert.equal(ray.intersectObject(head).length,0,'real open sight notch at the eye line');
ray.ray.origin.x=.006;assert(ray.intersectObject(head).length>0,'both solid sight shoulders remain');
assert(Math.abs(fps.bounds.max.z-fps.bounds.min.z-1.276)<.002);
for(const built of [fps,world,npc])for(const mesh of built.meshes)mesh.geometry.dispose();
console.log('ok Type38 511: 69586 real triangles, 45 parts, 116 unchanged PBR images, private geometry/shared materials, open 4.5mm sight notch and independent bolt/cover');
