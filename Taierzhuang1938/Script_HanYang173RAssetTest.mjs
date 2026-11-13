import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {HANYANG_173R as D} from './Data_HanYang173R.mjs';
import {MaterialLibrary} from './Script_Materials.mjs';
import {PatchesOf} from './Script_MaterialPatches.mjs';
import {ConfigureHanYang173R,HanYang173RBaseGain,InstantiateHanYang173R,RepairHanYangWinding} from './Script_HanYang173R.mjs';
import { MESHES } from './Data_Meshes.mjs';
import { AllMeshUrls } from './Script_Meshes.mjs';
import {DEFAULT_PLAYER_WEAPON,LOADOUTS} from './Data_Weapons.mjs';
import {StrictRule} from './Script_StrictTextureRules.mjs';
import sharp from 'sharp';
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
// Clean reduced wood plus the complete high-source cocking cover fit the 69k allocation.
assert.equal(triangles,report.triangles);assert.equal(triangles,64266);
for(const image of doc.images){const v=doc.bufferViews[image.bufferView],raw=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),expected=report.texturePayloads.find(i=>i.name===image.name);assert(expected);assert.equal(createHash('sha256').update(raw).digest('hex'),expected.sha256);}
const publishRules=JSON.parse(fs.readFileSync(new URL('./Data_PublishPathRules.json',import.meta.url),'utf8'));
for(const index of [57,58,59]){
 assert(doc.images[index].name.startsWith('MainWood_ContinuousLowerShoulder_'),'4K selectors track the actual stock maps');
 const rule=StrictRule(publishRules,'Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb',index);
 assert.equal(rule.maxSize,4096);assert.equal(rule.format,'ktx2-bc7');
}
const reshaped=new Set(report.mechanismRepair.shapeParts);
for(const p of report.parts.filter(p=>!p.gameplayAdaptation&&p.part!=='RearBand_ControlledCrown'&&!reshaped.has(p.part)))assert(Math.max(p.gameToSourceMaxM,p.sourceToGameMaxM)<=.0005,p.part);
assert.equal(report.mechanismRepair.version,'173R-20261113');
assert.equal(report.materialMatch.version,D.version);
assert.equal(doc.asset.extras.materialMatch,D.version);
assert.equal(report.materialMatch.sourceAssets.length,2);
assert(report.materialMatch.sourceAssets.every(source=>source.tier===1&&/^[0-9a-f]{64}$/.test(source.sha256)));
for(const name of D.wood){
 const part=report.parts.find(part=>part.part===name);
 assert(part.rebake.tiledUv&&part.rebake.tileMeters===.06&&part.rebake.textureSize===2048);
 const node=doc.nodes.find(node=>node.name===name),primitive=doc.meshes[node.mesh].primitives[0];
 const material=doc.materials[primitive.material];
 for(const slot of [material.pbrMetallicRoughness.baseColorTexture,material.pbrMetallicRoughness.metallicRoughnessTexture,material.normalTexture]){
  const sampler=doc.samplers[doc.textures[slot.index].sampler];
  assert.equal(sampler.wrapS,10497);assert.equal(sampler.wrapT,10497);
 }
 const uv=Read(primitive.attributes.TEXCOORD_0);
 assert(Math.max(...uv.map(value=>value[0]))-Math.min(...uv.map(value=>value[0]))>1,'stock UVs retain reference detail by repeating along their length');
 const normalTexture=doc.textures[material.normalTexture.index];
 const normalImage=doc.images[normalTexture.extensions?.EXT_texture_webp?.source??normalTexture.source];
 const normalView=doc.bufferViews[normalImage.bufferView];
 const normalBytes=bin.subarray(normalView.byteOffset||0,(normalView.byteOffset||0)+normalView.byteLength);
 const dimensions=await sharp(normalBytes).metadata(),stats=await sharp(normalBytes).stats();
 assert.equal(dimensions.width,2048);assert.equal(dimensions.height,2048);
 assert(stats.channels[0].stdev>2&&stats.channels[1].stdev>2,'wood fibres retain a two-direction normal response');
}
for(const name of Object.keys(report.surfaceRepair.sourceSurfaceErrors)){
 const part=report.parts.find(p=>p.part===name);
 assert(part.rebake.uvCoverage>0,name);
 for(const texture of report.texturePayloads.filter(t=>t.name.startsWith(name+'_')))
  assert(texture.islandCoverage>=part.rebake.uvCoverage*.8,`${name}: bake and export use the same UV layer`);
}
const coverBake=report.parts.find(p=>p.part==='RearOuterCover_RoundedSideReturn').rebake;
assert(coverBake.uvCoverage>.5&&coverBake.pxPerMm>=15,'degenerate cover triangles must not collapse the texture atlas into thin strips');
function PartPositions(name){
 const node=doc.nodes.find(n=>n.name===name),matrix=node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(new THREE.Vector3().fromArray(node.translation||[0,0,0]),new THREE.Quaternion().fromArray(node.rotation||[0,0,0,1]),new THREE.Vector3().fromArray(node.scale||[1,1,1]));
 return Read(doc.meshes[node.mesh].primitives[0].attributes.POSITION).map(p=>new THREE.Vector3(...p).applyMatrix4(matrix));
}
const cheeks=PartPositions('RearOuterCover_RoundedSideReturn');
assert(cheeks.every(p=>Math.abs(p.x)>.009),'protective cheeks leave the central cocking body exposed');
const cap=PartPositions('RearSmallCover'),capBox=new THREE.Box3().setFromPoints(cap),capSize=capBox.getSize(new THREE.Vector3());
assert(capSize.x>.015&&capSize.y>.015,'rear disc has a complete circular silhouette');
const flag=PartPositions('RearTab'),flagSize=new THREE.Box3().setFromPoints(flag).getSize(new THREE.Vector3());
assert(flagSize.z<.0025,'safety flag has the reference thin-section profile');
assert.equal(report.parts.find(p=>p.part==='HandleSphere').gameTriangles,2208,'bolt knob silhouette uses the refined surface');
for(const name of ['RearOuterCover_RoundedSideReturn','HandleSphere','RearSmallCover']){
 const node=doc.nodes.find(n=>n.name===name),primitive=doc.meshes[node.mesh].primitives[0],material=doc.materials[primitive.material];
 const texture=doc.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index];
 const image=doc.images[texture.extensions?.EXT_texture_webp?.source??texture.source],view=doc.bufferViews[image.bufferView];
 const {data,info}=await sharp(bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength)).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let sum=0,squared=0;for(let index=1;index<data.length;index+=info.channels){const value=data[index]/255;sum+=value;squared+=value*value;}
 const count=info.width*info.height,mean=sum/count,deviation=Math.sqrt(Math.max(0,squared/count-mean*mean));
 assert(mean>.4&&mean<.75&&deviation>.015&&deviation<.2,`${name}: aged steel retains spatially varying roughness`);
}
assert.equal(report.parts.find(p=>p.part==='MainWood_ContinuousLowerShoulder').gameTriangles,32211,'use clean wood before the slicing regression');
assert.equal(report.parts.find(p=>p.part==='UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront').gameTriangles,11893);
assert(report.surfaceRepair.band.maximumDisplacementMm>1&&report.surfaceRepair.band.maximumDisplacementMm<22,'the band is deliberately fitted to the timber profile');
const bandNode=doc.nodes.find(n=>n.name==='RearBand_ControlledCrown');
assert(!bandNode.matrix&&!bandNode.translation&&!bandNode.rotation&&!bandNode.scale,'band geometry is in the shared rifle frame');
const bandPoints=Read(doc.meshes[bandNode.mesh].primitives[0].attributes.POSITION);
const frontCrown=bandPoints.filter(([x,y,z])=>Math.abs(x)<.002&&-z>.5905);
const upperCrown=frontCrown.filter(p=>p[1]>.03857);
assert(upperCrown.length>0,'the band encloses the barrel crown');
const barrelNode=doc.nodes.find(n=>n.name==='LongOuterSteel_TrueRound'),barrelPrimitive=doc.meshes[barrelNode.mesh].primitives[0];
const barrelIndices=doc.accessors[barrelPrimitive.indices],barrelView=doc.bufferViews[barrelIndices.bufferView];
const indexBytes={5123:2,5125:4}[barrelIndices.componentType];assert(indexBytes);
const barrelGeometry=new THREE.BufferGeometry();
barrelGeometry.setAttribute('position',new THREE.Float32BufferAttribute(Read(barrelPrimitive.attributes.POSITION).flat(),3));
barrelGeometry.setIndex(Array.from({length:barrelIndices.count},(_,i)=>bin.readUIntLE((barrelView.byteOffset||0)+(barrelIndices.byteOffset||0)+i*indexBytes,indexBytes)));
const barrelMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),barrelMesh=new THREE.Mesh(barrelGeometry,barrelMaterial);
for(const point of upperCrown){
 const position=new THREE.Vector3(...point),axis=new THREE.Vector3(0,.03857,point[2]),outward=position.clone().sub(axis).normalize();
 const ray=new THREE.Raycaster(axis.clone().addScaledVector(outward,.04),outward.clone().negate());
 const hit=ray.intersectObject(barrelMesh,false)[0];assert(hit,'barrel surface is sampled at the band');
 assert(position.clone().sub(hit.point).dot(outward)>5e-6,'the fitted band clears the actual tapered barrel');
}
barrelGeometry.dispose();barrelMaterial.dispose();
// Read the real two inlet meshes in glTF coordinates, including every vertex near the bolt.
for(const name of ['MainWood_ContinuousLowerShoulder','ReceiverOuterCollar']){
 const node=doc.nodes.find(n=>n.name===name),primitive=doc.meshes[node.mesh].primitives[0];
 const inlet=Read(primitive.attributes.POSITION).filter(([x,y,z])=>-z>.131&&-z<.231&&y>=.024&&Math.abs(x)>.006);
 assert(inlet.length>0,name);
 assert(inlet.every(([x,y])=>Math.hypot(x,y-.04194)>=.00935-1e-6),`${name}: inlet clears the 8.69 mm bolt radius`);
}
// A no-effects material must still decode the folded packed metalness channel.
const library=new MaterialLibrary(null),orm=new THREE.Texture(),mat=new THREE.MeshStandardMaterial({roughnessMap:orm,metalnessMap:orm});
library.ConfigureExternalPbr(mat);assert.equal(mat.metalnessMap,null);
assert(PatchesOf(mat).some(p=>String(p.key).includes('orm')),'folded ORM must keep its shader patch without post effects');
assert(!D.wood.includes('SideWoodButton'),'source ORM defines the side button as metal');
// Island texels are the delivered bytes (or, for the 18 rebaked parts, the raw rebake); only texels outside the islands are filled.
assert(report.texturePayloads.every(t=>/^[0-9a-f]{64}$/.test(t.sourceSha256)&&t.sourceSha256!==t.sha256&&t.islandCoverage>0));
// Base colour (2026-11-03): only the material colour multiplier changes; roughness, metalness and texture bytes stay authored.
const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({metalness:1,roughness:1,map:new THREE.Texture(),roughnessMap:orm,metalnessMap:orm}));
mesh.name='ReceiverOuterCollar';const scene=new THREE.Group();scene.add(mesh);
const asset={gltf:{scene},materials:new Map()};library.anisotropy=16;ConfigureHanYang173R(asset,library);ConfigureHanYang173R(asset,library);
assert.deepEqual([mesh.material.color.toArray(),mesh.material.roughness,mesh.material.metalness],[HanYang173RBaseGain('ReceiverOuterCollar'),1,1]);
{
  const C=D.baseCandidate,g=D.exposureGain;
  // Every metal part is listed; each gain stays within [exposureGain, exposureGain*maxGain] and keeps the authored order.
  const metal=Object.keys(C.partBaseY);assert.equal(metal.length+D.wood.length,44);
  const after=metal.map(p=>[C.partBaseY[p],C.partBaseY[p]*HanYang173RBaseGain(p)[0]]).sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<after.length;i++)assert(after[i][1]>=after[i-1][1]-1e-9,'steel calibration must keep the part order');
  for(const p of metal){const k=HanYang173RBaseGain(p)[0]/g;assert(k>=1&&k<=C.steel.maxGain+1e-9,p);}
  assert(Math.abs(HanYang173RBaseGain('HandleSphere')[0]-g)<1e-9,'parts already above the target stay as authored');
  assert(C.partBaseY.ReceiverOuterCollar*HanYang173RBaseGain('ReceiverOuterCollar')[0]>0.15,'large receiver steel reaches the blued-steel range');
  // Wood: one shared per-channel multiplier, less orange than the source scan (blue lifted most).
  for(const p of D.wood)assert.deepEqual(HanYang173RBaseGain(p),C.wood);
  assert(C.wood[2]>C.wood[1]&&C.wood[1]>C.wood[0]&&C.wood[0]>g*2);
  // `authored` keeps the retired single gain as the comparison reference.
  assert.deepEqual(HanYang173RBaseGain('ReceiverOuterCollar','authored'),[g,g,g]);
}
assert.equal(mesh.material.map.anisotropy,16);assert.equal(mesh.material.roughnessMap.anisotropy,16);
assert(PatchesOf(mesh.material).some(p=>String(p.key).includes('orm')));
assert(!PatchesOf(mesh.material).some(p=>/hanYang/.test(String(p.key))),'retired reflectance clamp must not return');
// A triangle wound against its authored normals is re-wound; a consistent one is untouched.
const tri=new THREE.BufferGeometry();tri.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1,0,0],3));
tri.setAttribute('normal',new THREE.Float32BufferAttribute(Array(6).fill([0,0,1]).flat(),3));tri.setIndex([0,1,2,3,4,5]);
RepairHanYangWinding(tri);assert.deepEqual(Array.from(tri.index.array),[0,1,2,3,5,4]);
mesh.geometry.dispose();mesh.material.dispose();
console.log(`ok HanYang173R: ${triangles} triangles, ${vertices} vertices, 44 parts, 132 PBR images, aligned bake/export UVs, restored source surfaces, finite tangent frames and ORM decoding`);
