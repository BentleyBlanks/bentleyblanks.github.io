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
assert.equal(doc.meshes.length,44);assert.equal(doc.images.length,134);assert(!doc.skins?.length&&!doc.animations?.length);
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
assert.equal(triangles,report.triangles);assert.equal(triangles,77396);
assert.equal(doc.asset.extras.gameTriangles,triangles);
assert.equal(report.exteriorFinish.triangleLimit,80000);assert(triangles<=report.exteriorFinish.triangleLimit);
for(const node of doc.nodes.filter(node=>node.mesh!==undefined)){
 const primitive=doc.meshes[node.mesh].primitives[0];
 assert.equal(doc.accessors[primitive.indices].count/3,report.parts.find(part=>part.part===node.name).gameTriangles,node.name);
}
for(const image of doc.images){const v=doc.bufferViews[image.bufferView],raw=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),expected=report.texturePayloads.find(i=>i.name===image.name);assert(expected);assert.equal(createHash('sha256').update(raw).digest('hex'),expected.sha256);}
const detailCharts=new Set(['HY150_ExteriorSideRelief_Neg','HY150_ExteriorSideRelief_Pos','HY151_LowRearShoulder','Trigger_FlatCurvedExternalStrip']);
const heelName='RearBand_ExternalAttachmentBridge';
const contactImages=new Set(['ButtCap_LimitedProfileBlend_ORM','LongOuterSteel_TrueRound_ORM']);
const retainedImages=report.texturePayloads.filter(image=>!image.name.startsWith('FrontBand_')
 && !D.wood.some(part=>image.name.startsWith(part+'_')) && !contactImages.has(image.name))
 .map(image=>image.name+':'+image.sha256+'\n').sort();
assert.equal(retainedImages.length,118);
assert.equal(createHash('sha256').update(retainedImages.join('')).digest('hex'),'5d3fce8cdfca6320387323e082cb161d0399e5324007b3dfca86b15c7b9b76ac','untouched R25 texture payloads remain byte-identical');
assert.equal(doc.asset.extras.calibratedBaseColor,true);
assert(doc.materials.every(mat=>(mat.pbrMetallicRoughness.baseColorFactor||[1,1,1,1]).every(v=>v===1)),'native albedo is stored in the texture');
// Compare real surface samples with R23 after its calibrated linear multiplier.
// An atlas average would also measure the padded pixels outside the UV islands.
for(const [name,expected] of [
 ['HandleSphere',[.019742,.022657,.022446]],
 ['LowerPlateGuard_FlatSideNarrowReturn',[.055666,.057063,.050782]],
]){
 const node=doc.nodes.find(n=>n.name===name),primitive=doc.meshes[node.mesh].primitives[0];
 const positions=Read(primitive.attributes.POSITION),uvs=Read(primitive.attributes.TEXCOORD_0);
 const slot=doc.materials[primitive.material].pbrMetallicRoughness.baseColorTexture;
 const image=doc.images[doc.textures[slot.index].extensions.EXT_texture_webp.source];
 const {data,info}=await sharp(Payload(image.bufferView)).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const indices=doc.accessors[primitive.indices],bytes=Payload(indices.bufferView);
 const triangle=new THREE.Triangle(),centre=new THREE.Vector2(),total=new THREE.Vector3(),colour=new THREE.Color();
 let surface=0;
 for(let corner=0;corner<indices.count;corner+=3){
  centre.set(0,0);
  for(const [j,point] of [triangle.a,triangle.b,triangle.c].entries()){
   const id=indices.componentType===5125?bytes.readUInt32LE((corner+j)*4):bytes.readUInt16LE((corner+j)*2);
   point.fromArray(positions[id]);centre.x+=uvs[id][0];centre.y+=uvs[id][1];
  }
  const x=Math.min(info.width-1,Math.floor(centre.x/3*info.width)),y=Math.min(info.height-1,Math.floor(centre.y/3*info.height));
  const offset=(x+y*info.width)*info.channels,area=triangle.getArea();
  colour.setRGB(data[offset]/255,data[offset+1]/255,data[offset+2]/255,THREE.SRGBColorSpace);
  total.x+=area*colour.r;total.y+=area*colour.g;total.z+=area*colour.b;surface+=area;
 }
 assert(total.divideScalar(surface).toArray().every((v,c)=>Math.abs(v-expected[c])<.002),name+' stores the calibrated pigment at unit colour gain');
}
const publishRules=JSON.parse(fs.readFileSync(new URL('./Data_PublishPathRules.json',import.meta.url),'utf8'));
for(const index of [57,58,59]){
 assert(doc.images[index].name.startsWith('MainWood_ContinuousLowerShoulder_'),'4K selectors track the actual stock maps');
 const rule=StrictRule(publishRules,'Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb',index);
 assert.equal(rule.maxSize,4096);assert.equal(rule.format,'ktx2-bc7');
}
const reshaped=new Set(report.mechanismRepair.shapeParts);
const frontWood='FrontWood_ContinuousOval';
const profiledBands=new Set(['FrontBand_ContinuousEnvelopeContact','RearBand_ControlledCrown']);
for(const part of report.parts){
 const delta=report.exteriorFinish.surfaceComparisons[part.part];
 assert.equal(part.gameToSourceMaxM,delta.toDotsM);assert.equal(part.sourceToGameMaxM,delta.fromDotsM);
 if(part.part.startsWith('MainWood_')||part.part.startsWith('ButtCap_')){
  assert(delta.toR2M<.014&&delta.fromR2M<.014&&Math.max(delta.toR2M,delta.fromR2M)>.001,'rounded rear profile is localized');
  continue;
 }
 if(part.part===heelName){
  assert(delta.toR2M>.005&&delta.toR2M<.012&&delta.fromR2M<.003,'solid lower face stays local to the band display trim');
  continue;
 }
 if(profiledBands.has(part.part)){
  assert(delta.toR2M<.005&&delta.fromR2M<.005&&Math.max(delta.toR2M,delta.fromR2M)>.001,part.part);
  continue;
 }
 if(part.part===frontWood){assert(delta.toR2M>.018&&delta.toR2M<.019&&delta.fromR2M<.002);continue;}
 if(part.part==='UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront'){
  assert(delta.fromR2M>.0045&&delta.fromR2M<.0056&&delta.toR2M<.0055,'the visible timber shoulder is deliberately lowered');
  const timber=doc.nodes.find(node=>node.name===part.part),coords=Read(doc.meshes[timber.mesh].primitives[0].attributes.POSITION);
  const crown=Math.max(...coords.filter(point=>-point[2]<.277).map(point=>point[1]));
  assert(crown>.058&&crown<.0595,'few-millimetre shoulder transition, not an abrupt raised block');
  assert(Math.max(...coords.filter(point=>-point[2]>.39).map(point=>point[1]))>.063,'upper wood away from the edited shoulder keeps its height');
  continue;
 }
 assert(Math.max(delta.toR2M,delta.fromR2M)<=.0005,`${part.part}: retain previous silhouette`);
 if(!part.gameplayAdaptation&&part.part!=='RearBand_ControlledCrown'&&!reshaped.has(part.part))assert(Math.max(delta.toDotsM,delta.fromDotsM)<=.0005,part.part);
}
assert.equal(report.mechanismRepair.version,'173R-20261113');
assert.equal(report.materialMatch.version,D.version);
assert.equal(doc.asset.extras.materialMatch,D.version);
const scanManifest=JSON.parse(fs.readFileSync(path.resolve(dir,'../../_import/Data_HanYangScanSources.json'),'utf8'));
assert.deepEqual(report.materialMatch.sourceAssets,scanManifest);
assert(report.materialMatch.previousSourceAssets.length===2&&report.materialMatch.previousSourceAssets.every(source=>source.tier===1));
for(const [asset,roles] of Object.entries({black_walnut_veneer_02:['Diffuse','Rough','nor_gl'],fine_grained_wood:['Diffuse','Rough','nor_gl'],metal_plate_02:['Diffuse','Metal','Rough','nor_gl'],rusty_metal_04:['Diffuse','Metal','Rough','nor_gl']})){
 const sources=scanManifest.filter(item=>item.asset===asset);assert.deepEqual(sources.map(item=>item.role).sort(),roles);
 assert(sources.every(item=>item.license==='CC0-1.0'&&/^[0-9a-f]{64}$/.test(item.sha256)&&new URL(item.url).hostname==='dl.polyhaven.org'));
}
const woodBases=new Set();
for(const name of D.wood){
 const part=report.parts.find(part=>part.part===name);
 const size=name.startsWith('MainWood_')?4096:2048;
 assert.equal(part.rebake.tiledUv,false);assert.equal(part.rebake.tileMeters,null);
 assert.equal(part.rebake.textureSize,size);assert(part.rebake.uvCoverage>.15);
 const node=doc.nodes.find(node=>node.name===name),primitive=doc.meshes[node.mesh].primitives[0];
 const material=doc.materials[primitive.material];
 assert.equal(material.extensions?.KHR_materials_specular?.specularFactor,.17,'all three walnut parts share the authored dielectric response');
 for(const slot of [material.pbrMetallicRoughness.baseColorTexture,material.pbrMetallicRoughness.metallicRoughnessTexture,material.normalTexture]){
  const sampler=doc.samplers[doc.textures[slot.index].sampler];
  assert.equal(sampler.wrapS,33071);assert.equal(sampler.wrapT,33071);
  const texture=doc.textures[slot.index],image=doc.images[texture.extensions.EXT_texture_webp.source],view=doc.bufferViews[image.bufferView];
  const payload=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),meta=await sharp(payload).metadata();
  assert.equal(meta.width,size);assert.equal(meta.height,size);
  if(slot===material.pbrMetallicRoughness.metallicRoughnessTexture){
   const woodOrm=await sharp(payload).stats();
   assert.equal(woodOrm.channels[2].max,0,'polished timber is never metallic');
   assert(woodOrm.channels[1].stdev>5,'local polish must vary wood roughness');
  }
  if(slot===material.pbrMetallicRoughness.baseColorTexture)woodBases.add(createHash('sha256').update(payload).digest('hex'));
 }
 const uv=Read(primitive.attributes.TEXCOORD_0);
 assert(uv.every(pair=>pair.every(component=>component>=-1e-5&&component<=1+1e-5)),'wood uses its own bounded atlas');
 const normalTexture=doc.textures[material.normalTexture.index];
 const normalImage=doc.images[normalTexture.extensions?.EXT_texture_webp?.source??normalTexture.source];
 const normalView=doc.bufferViews[normalImage.bufferView];
 const normalBytes=bin.subarray(normalView.byteOffset||0,(normalView.byteOffset||0)+normalView.byteLength);
 const stats=await sharp(normalBytes).stats();
 assert(stats.channels[0].stdev>2&&stats.channels[1].stdev>2,'wood fibres retain a two-direction normal response');
}
assert.equal(woodBases.size,3,'three unique timber base maps');
const lacquered=doc.materials.filter(material=>material.extensions?.KHR_materials_clearcoat);
assert.equal(lacquered.length,2);
const oilFilm=lacquered.find(material=>material.name.includes('MainWood_')).extensions.KHR_materials_clearcoat;
assert.equal(oilFilm.clearcoatFactor,.20);assert.equal(oilFilm.clearcoatRoughnessFactor,.33);
assert(!oilFilm.clearcoatNormalTexture&&!oilFilm.clearcoatRoughnessTexture,'only one additional sampler');
const oilTexture=doc.textures[oilFilm.clearcoatTexture.index],oilImage=doc.images[oilTexture.extensions.EXT_texture_webp.source];
const oilBufferView=doc.bufferViews[oilImage.bufferView],oilBytes=bin.subarray(oilBufferView.byteOffset,oilBufferView.byteOffset+oilBufferView.byteLength);
const {data:oilMask,info:oilInfo}=await sharp(oilBytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(oilInfo.width,1024);assert.equal(oilInfo.height,1024);
const mainStock=doc.nodes.find(node=>node.name.startsWith('MainWood_')),stockPrim=doc.meshes[mainStock.mesh].primitives[0];
const stockPoints=Read(stockPrim.attributes.POSITION),stockUvs=Read(stockPrim.attributes.TEXCOORD_0),stockNormals=Read(stockPrim.attributes.NORMAL);
const topOil=[],sideOil=[];
for(let index=0;index<stockPoints.length;index++){
 const point=stockPoints[index],normal=stockNormals[index],uv=stockUvs[index];
 if(point[2]<.075)continue;
 const col=Math.min(1023,Math.max(0,Math.floor(1024*uv[0]))),row=Math.min(1023,Math.max(0,Math.floor(1024*uv[1])));
 const value=oilMask[(row*1024+col)*oilInfo.channels];
 if(normal[1]>.85)topOil.push(value);
 if(Math.abs(normal[0])>.93&&Math.abs(normal[1])<.13)sideOil.push(value);
}
assert(topOil.length>40&&sideOil.length>40);
assert(MedianOil(topOil)>115&&MedianOil(sideOil)<15,'oil film follows the actual crest, not the whole timber atlas');
const foreFilm=lacquered.find(material=>material.name.includes('FrontWood_')).extensions.KHR_materials_clearcoat;
assert.equal(foreFilm.clearcoatFactor,.20);assert.equal(foreFilm.clearcoatRoughnessFactor,.36);
assert(!foreFilm.clearcoatRoughnessTexture&&!foreFilm.clearcoatNormalTexture);
const foreFilmImage=doc.textures[foreFilm.clearcoatTexture.index].extensions.EXT_texture_webp.source;
assert.equal(foreFilmImage,133);assert.equal(doc.textures[oilFilm.clearcoatTexture.index].extensions.EXT_texture_webp.source,132);
assert.equal(StrictRule(publishRules,'Taierzhuang1938/Model/HanYang173R/Model_HanYang173R.glb',foreFilmImage).format,'ktx2-bc7');
const {data:foreMask,info:foreInfo}=await sharp(Payload(doc.images[foreFilmImage].bufferView)).removeAlpha().raw().toBuffer({resolveWithObject:true});
assert.equal(foreInfo.width,1024);assert.equal(foreInfo.height,1024);
const forePrimitive=doc.meshes[doc.nodes.find(node=>node.name===frontWood).mesh].primitives[0];
const forePos=Read(forePrimitive.attributes.POSITION),foreNorm=Read(forePrimitive.attributes.NORMAL),foreUv=Read(forePrimitive.attributes.TEXCOORD_0),foreBounds=doc.accessors[forePrimitive.attributes.POSITION];
const foreSamples={side:[],ends:[],underside:[]};
for(let index=0;index<forePos.length;index++){
 const height=(forePos[index][1]-foreBounds.min[1])/(foreBounds.max[1]-foreBounds.min[1]);
 const along=(foreBounds.max[2]-forePos[index][2])/(foreBounds.max[2]-foreBounds.min[2]);
 const [col,row]=foreUv[index].map(value=>Math.max(0,Math.min(1023,Math.floor(1024*value))));
 const weight=foreMask[(row*1024+col)*foreInfo.channels];
 if(Math.abs(foreNorm[index][0])>.85&&height>.33&&height<.70&&along>.14&&along<.87)foreSamples.side.push(weight);
 if(along<.02||along>.98)foreSamples.ends.push(weight);
 if(height<.10)foreSamples.underside.push(weight);
}
assert(Object.values(foreSamples).every(samples=>samples.length>40));
assert(MedianOil(foreSamples.side)>105&&MedianOil(foreSamples.ends)<18&&MedianOil(foreSamples.underside)<18,'the satin film is localized to the sides');
assert(foreSamples.side[Math.floor(.1*foreSamples.side.length)]<85&&foreSamples.side[Math.floor(.9*foreSamples.side.length)]>135,'worn and intact film remain visible in the satin mask');
const foreSurface=new THREE.BufferGeometry();
foreSurface.setAttribute('position',new THREE.Float32BufferAttribute(forePos.flat(),3));
foreSurface.setAttribute('uv',new THREE.Float32BufferAttribute(foreUv.flat(),2));
const foreIndices=doc.accessors[forePrimitive.indices],foreIndexBytes=Payload(foreIndices.bufferView);
foreSurface.setIndex(Array.from({length:foreIndices.count},(_,i)=>foreIndices.componentType===5125?foreIndexBytes.readUInt32LE(i*4):foreIndexBytes.readUInt16LE(i*2)));
const foreDetail=doc.materials[forePrimitive.material].pbrMetallicRoughness.metallicRoughnessTexture;
const foreOrmImage=doc.images[doc.textures[foreDetail.index].extensions.EXT_texture_webp.source];
const foreOrm=await sharp(Payload(foreOrmImage.bufferView)).removeAlpha().raw().toBuffer({resolveWithObject:true});
const foreMesh=new THREE.Mesh(foreSurface,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
function ForeFinishAt(section,height){
 const creaseHeight=THREE.MathUtils.lerp(.011292,.0363,height);
 const origin=new THREE.Vector3(1,creaseHeight,THREE.MathUtils.lerp(foreBounds.max[2],foreBounds.min[2],section));
 const hit=new THREE.Raycaster(origin,new THREE.Vector3(-1,0,0)).intersectObject(foreMesh,false)[0];
 assert(hit&&hit.point.x>0,'marks fall on the visible timber flank');
 function Texel(info,channel){return (Math.floor(hit.uv.y*info.height)*info.width+Math.floor(hit.uv.x*info.width))*info.channels+channel;}
 return [foreMask[Texel(foreInfo,0)],foreOrm.data[Texel(foreOrm.info,1)]];
}
const wearLandmarks=[[.2812,.5033],[.3265,.4615],[.3689,.6864],[.3736,.5303],[.5314,.7145],[.5619,.7034],[.5235,.3122],[.5301,.3578],[.5723,.1989],[.1909,.4042]];
const impressed=wearLandmarks.map(([section,height])=>ForeFinishAt(section,height));
const surrounding=wearLandmarks.map(([section,height])=>ForeFinishAt(section+.014,height+.095));
assert(impressed.every(([film])=>film<20),'both branches of the fork and the other registered impressions interrupt the oil film on the actual UV islands');
assert(MedianOil(impressed.map(v=>v[1]))>MedianOil(surrounding.map(v=>v[1]))+17,'abraded fibre beds remain rougher than the surrounding satin finish');
foreSurface.dispose();foreMesh.material.dispose();
function MedianOil(samples){return samples.sort((left,right)=>left-right)[Math.floor(samples.length/2)];}
const baselineSurface=createHash('sha256');
const frontBandPrimitive=doc.meshes[doc.nodes.find(node=>node.name==='FrontBand_ContinuousEnvelopeContact').mesh].primitives[0];
function Payload(viewId){
 const view=doc.bufferViews[viewId],offset=view.byteOffset||0;
 return bin.subarray(offset,offset+view.byteLength);
}
for(const node of doc.nodes.filter(node=>node.mesh!==undefined)){
 const primitive=doc.meshes[node.mesh].primitives[0],attrs=primitive.attributes;
 const indexAccessor=doc.accessors[primitive.indices],indexData=Payload(indexAccessor.bufferView);
 const IndexAt=offset=>indexAccessor.componentType===5125?indexData.readUInt32LE(offset*4):indexData.readUInt16LE(offset*2);
 if(!/^(MainWood_|FrontWood_|FrontBand_)/.test(node.name)){
  baselineSurface.update(indexData);
  for(const semantic of ['POSITION','NORMAL','TEXCOORD_0','TANGENT'])baselineSurface.update(Payload(doc.accessors[attrs[semantic]].bufferView));
 }
 if(detailCharts.has(node.name)){
  const points=Read(attrs.POSITION),uvs=Read(attrs.TEXCOORD_0);
  for(let offset=0;offset<indexAccessor.count;offset+=3){
   const corners=[IndexAt(offset),IndexAt(offset+1),IndexAt(offset+2)];
   const [a,b,c]=corners.map(i=>new THREE.Vector3(...points[i]));
   const [ta,tb,tc]=corners.map(i=>new THREE.Vector2(...uvs[i]));
   const e1=b.sub(a),e2=c.sub(a),length=e1.length(),u=e1.dot(e2)/length,v=e1.clone().cross(e2).length()/length;
   const du=tb.sub(ta).multiplyScalar(1/length),dv=tc.sub(ta).addScaledVector(du,-u).multiplyScalar(1/v);
   const squared=du.lengthSq()+dv.lengthSq(),det=Math.abs(du.cross(dv));
   const ratio=(squared+Math.sqrt(Math.max(0,squared*squared-4*det*det)))/(2*det);
   assert(det>0&&ratio<1.45,node.name+' detail atlas has bounded directional stretch');
  }
 }
 if(/^(MainWood_|UpperWood_)/.test(node.name)){
  const positions=Read(attrs.POSITION),normals=Read(attrs.NORMAL);
  const firstEdge=new THREE.Vector3(),secondEdge=new THREE.Vector3(),origin=new THREE.Vector3(),cornerNormal=new THREE.Vector3();
  for(let offset=0;offset<indexAccessor.count;offset+=3){
   const corners=[IndexAt(offset),IndexAt(offset+1),IndexAt(offset+2)];
   origin.fromArray(positions[corners[0]]);
   firstEdge.fromArray(positions[corners[1]]).sub(origin);secondEdge.fromArray(positions[corners[2]]).sub(origin);
   const plane=firstEdge.cross(secondEdge);
   if(plane.lengthSq()<=1e-24)continue;
   plane.normalize();const dots=corners.map(corner=>plane.dot(cornerNormal.fromArray(normals[corner])));
   assert(!(Math.min(...dots)<-.65&&Math.max(...dots)>.65),`${node.name}: opposing corner normals on face ${offset/3}`);
  }
 }

}
assert.equal(baselineSurface.digest('hex'),'0bee4319f970847f21d16f48067e66b25bf8ae8aa739ffad75648a6be316b60f','meshes outside the three local contour edits retain their R25 streams');
assert.deepEqual(report.exteriorFinish.closedFittings,{RearBand_ExternalAttachmentBridge:{before:18,after:76},RearStock_ExternalAttachmentBridge:{before:18,after:68}});
for(const node of doc.nodes.filter(item=>item.name?.endsWith('ExternalAttachmentBridge'))){
 const prim=doc.meshes[node.mesh].primitives[0],positions=Read(prim.attributes.POSITION),uvs=Read(prim.attributes.TEXCOORD_0),indices=doc.accessors[prim.indices],bytes=Payload(indices.bufferView),edges=new Map();
 const key=point=>point.map(value=>Math.round(value*1e7)).join(',');
 for(let offset=0;offset<indices.count;offset+=3){
  const verts=[0,1,2].map(corner=>indices.componentType===5125?bytes.readUInt32LE((offset+corner)*4):bytes.readUInt16LE((offset+corner)*2));
  for(let corner=0;corner<3;corner++){
   const first=key(positions[verts[corner]]),next=key(positions[verts[(corner+1)%3]]),edge=[first,next].sort().join(';'),entry=edges.get(edge)||[0,0];
   entry[0]++;entry[1]+=first<next?1:-1;edges.set(edge,entry);
  }
  const [first,second,third]=verts.map(index=>uvs[index]);
  assert(Math.abs((second[0]-first[0])*(third[1]-first[1])-(second[1]-first[1])*(third[0]-first[0]))>1e-10,'closed shell triangle has nondegenerate UVs');
 }
 assert([...edges.values()].every(([count,balance])=>count===2&&balance===0),`${node.name}: no open bevel edges or inverted neighbours after welding chart splits`);
}
for(const node of doc.nodes.filter(item=>item.name?.endsWith('ExternalAttachmentLoop'))){
 const pos=Read(doc.meshes[node.mesh].primitives[0].attributes.POSITION),turn=new THREE.Quaternion().fromArray(node.rotation),offset=new THREE.Vector3().fromArray(node.translation);
 assert(Math.abs(turn.length()-1)<1e-8&& !node.scale,'display pose is rigid');
 const travel=Math.max(...pos.map(point=>{const before=new THREE.Vector3().fromArray(point);return before.clone().applyQuaternion(turn).add(offset).distanceTo(before);}));
 assert(Math.abs(travel-report.exteriorFinish.ringPresentation[node.name].maxVertexTravelM)<1e-6);
}
assert.deepEqual(report.exteriorFinish.timberFrameRepairs,{MainWood_ContinuousLowerShoulder:52,UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront:9});
const contactParts=doc.nodes.filter(node=>node.mesh!==undefined&&/^(MainWood_|UpperWood_|FrontWood_|FrontBand_|RearBand_Controlled|ReceiverOuterCollar|LowerPlateGuard_|LongOuterSteel_|ButtCap_)/.test(node.name)).map(node=>node.name).sort();
assert.equal(contactParts.length,9);
assert.deepEqual(report.exteriorFinish.contactVisibility.parts,contactParts);
for(const node of doc.nodes.filter(node=>node.mesh!==undefined)){
 const material=doc.materials[doc.meshes[node.mesh].primitives[0].material],slot=material.occlusionTexture;
 if(!contactParts.includes(node.name)){assert(!slot,`${node.name}: no fixed contact baked onto independent parts`);continue;}
 assert.equal(slot.index,material.pbrMetallicRoughness.metallicRoughnessTexture.index);assert.equal(slot.strength,.85);
 const image=doc.images[doc.textures[slot.index].extensions.EXT_texture_webp.source];
 const red=(await sharp(Payload(image.bufferView)).stats()).channels[0];
 assert(red.min<227&&red.max===255&&red.stdev>1,`${node.name}: contact and unobscured regions both present`);
}
const bandMesh=doc.meshes[doc.nodes.find(node=>node.name==='RearBand_ControlledCrown').mesh].primitives[0];
const bandPbr=doc.materials[bandMesh.material].pbrMetallicRoughness;
const bandPlanes=await Promise.all([bandPbr.baseColorTexture,bandPbr.metallicRoughnessTexture].map(slot=>{
 const image=doc.images[doc.textures[slot.index].extensions.EXT_texture_webp.source];
 return sharp(Payload(image.bufferView)).removeAlpha().raw().toBuffer({resolveWithObject:true});
}));
const bandPositions=Read(bandMesh.attributes.POSITION),bandUvs=Read(bandMesh.attributes.TEXCOORD_0),bandBounds=doc.accessors[bandMesh.attributes.POSITION];
const indicesAccessor=doc.accessors[bandMesh.indices],indicesPayload=Payload(indicesAccessor.bufferView);
const bandIndex=offset=>indicesAccessor.componentType===5125?indicesPayload.readUInt32LE(4*offset):indicesPayload.readUInt16LE(2*offset);
const samples={polish:[],body:[],rightRidge:[],rightFlank:[],reverseRidge:[],reverseFlank:[]};
for(let offset=0;offset<indicesAccessor.count;offset+=3){
 const verts=[bandIndex(offset),bandIndex(offset+1),bandIndex(offset+2)];
 for(const weights of [[.6,.2,.2],[.2,.6,.2],[.2,.2,.6],[.48,.04,.48],[.48,.48,.04],[.04,.48,.48]]){
  const interpolate=(array,axis)=>verts.reduce((sum,vert,index)=>sum+array[vert][axis]*weights[index],0);
  const sidePosition=interpolate(bandPositions,0);
  if(Math.abs(sidePosition)<.55*bandBounds.max[0])continue;
  const section=(bandBounds.max[2]-interpolate(bandPositions,2))/(bandBounds.max[2]-bandBounds.min[2]);
  const height=(interpolate(bandPositions,1)-bandBounds.min[1])/(bandBounds.max[1]-bandBounds.min[1]);
  const stampedRegion=section>.62&&section<.88&&height>.56&&height<.68?'polish':section>.18&&section<.49&&height>.21&&height<.43?'body':null;
  const prefix=sidePosition>0?'right':'reverse';
  const profileRegion=height>.32&&height<.63?(section>.44&&section<.57?prefix+'Ridge':section>.15&&section<.32?prefix+'Flank':null):null;
  const regions=[sidePosition>0?stampedRegion:null,profileRegion].filter(Boolean);
  if(!regions.length)continue;
  const result=bandPlanes.map(({data,info},plane)=>{
   const col=Math.min(info.width-1,Math.max(0,Math.floor(interpolate(bandUvs,0)*info.width)));
   const row=Math.min(info.height-1,Math.max(0,Math.floor(interpolate(bandUvs,1)*info.height)));
   return data[(row*info.width+col)*info.channels+plane];
  });
  for(const region of regions)samples[region].push(result);
 }
}
function MedianChannel(region,channel){const values=samples[region].map(row=>row[channel]).sort((left,right)=>left-right);assert(values.length>=3,`band ${region} has surface samples`);return values[Math.floor(values.length/2)];}
assert(MedianChannel('polish',0)>MedianChannel('body',0)+12&&MedianChannel('polish',1)<MedianChannel('body',1)-18,'the photographed shoulder wear is localized in pigment and roughness, not uniform silver noise');
assert(MedianChannel('rightRidge',1)+20<MedianChannel('rightFlank',1),'the photographed knob-side ridge retains a narrow polished response in actual mesh UVs');
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
const buttNode=doc.nodes.find(node=>node.name.startsWith('ButtCap_'));
const butt=doc.meshes[buttNode.mesh].primitives[0],endPoints=Read(butt.attributes.POSITION);
const capBounds=doc.accessors[butt.attributes.POSITION],widthAcross=capBounds.max[0]-capBounds.min[0];
function SliceDepth(primitive,points,axis,at){
 const indices=doc.accessors[primitive.indices],bytes=Payload(indices.bufferView);
 const vertex=offset=>points[indices.componentType===5125?bytes.readUInt32LE(4*offset):bytes.readUInt16LE(2*offset)];
 let near=Infinity,far=-Infinity;
 for(let face=0;face<indices.count;face+=3)for(let edge=0;edge<3;edge++){
  const a=vertex(face+edge),b=vertex(face+(edge+1)%3),span=b[axis]-a[axis];
  if(Math.abs(span)<1e-10)continue;
  const t=(at-a[axis])/span;
  if(t<0||t>1)continue;
  const depth=THREE.MathUtils.lerp(a[2],b[2],t);
  near=Math.min(near,depth);far=Math.max(far,depth);
 }
 assert(Number.isFinite(near)&&Number.isFinite(far));
 return {near,far};
}
function RearOutlineAt(fraction){
 const across=(capBounds.max[0]+capBounds.min[0]+fraction*widthAcross)*.5;
 return -SliceDepth(butt,endPoints,0,across).far;
}
assert(RearOutlineAt(0)<(RearOutlineAt(-.65)+RearOutlineAt(.65))*.5-.01*widthAcross,'the top-view rear silhouette bows out through the centre');
const heelBounds=new THREE.Box3().setFromPoints(PartPositions(heelName));
const loopBounds=new THREE.Box3().setFromPoints(PartPositions('RearBand_ExternalAttachmentLoop'));
const bandBoundsWorld=new THREE.Box3().setFromPoints(PartPositions('RearBand_ControlledCrown'));
const bandHeight=bandBoundsWorld.max.y-bandBoundsWorld.min.y;
assert(heelBounds.min.y<bandBoundsWorld.min.y-.16*bandHeight&&heelBounds.max.y>bandBoundsWorld.min.y,'solid heel is visible below the rear band and meets its silhouette');
assert(loopBounds.min.y<heelBounds.min.y&&loopBounds.max.y>heelBounds.min.y,'the resting loop overlaps the lower face in side view');
const nose=new THREE.Box3().setFromPoints(PartPositions('FrontWood_ContinuousOval'));
const frontBand=new THREE.Box3().setFromPoints(PartPositions('FrontBand_ContinuousEnvelopeContact'));
const frontBandSize=frontBand.getSize(new THREE.Vector3());
assert(frontBandSize.x/frontBandSize.y>.71&&frontBandSize.x/frontBandSize.y<.78,'the front band has the taller profile visible in the reference photograph');
const bandCentres=[[],[],[]];
for(const point of PartPositions('FrontBand_ContinuousEnvelopeContact')){
 const height=(point.y-frontBand.min.y)/(frontBand.max.y-frontBand.min.y);
 if(height<.05)bandCentres[0].push(point.z);
 else if(height>.35&&height<.65)bandCentres[1].push(point.z);
 else if(height>.95)bandCentres[2].push(point.z);
}
const sectionCentres=bandCentres.map(values=>(Math.min(...values)+Math.max(...values))*.5);
assert(Math.min(sectionCentres[0],sectionCentres[2])-sectionCentres[1]>.0015,'both front-band ends roll back from the central silhouette');
const rearExtent=new THREE.Box3().setFromPoints(PartPositions('RearBand_ControlledCrown')).getSize(new THREE.Vector3());
assert(rearExtent.z/rearExtent.y>.28&&rearExtent.z/rearExtent.y<.31,'the photographed rear band has a slimmer side outline than the front band');
const frontTrim=new THREE.Box3().setFromPoints(PartPositions('FrontSideBoss_LowRoundedExterior'));
assert(frontTrim.min.y<frontBand.min.y&&frontTrim.max.y>frontBand.min.y,'the profile detail meets the lower outline of the front band');
assert(Math.abs(frontTrim.getCenter(new THREE.Vector3()).x)<.001&&frontTrim.min.z>frontBand.min.z&&frontTrim.max.z<frontBand.max.z,'the small trim is centred under the band in the authored display pose');
const bandVertices=Read(frontBandPrimitive.attributes.POSITION);
for(let i=1;i<32;i++){
 const level=THREE.MathUtils.lerp(nose.min.y,nose.max.y,i/32);
 assert(SliceDepth(forePrimitive,forePos,1,level).near>=SliceDepth(frontBandPrimitive,bandVertices,1,level).near-1e-6,'timber stays within the visible outer curve at each sampled height');
}
assert(Math.abs(nose.min.z-frontBand.min.z)<.002,'front wood visually fills the band instead of stopping behind it');
assert(cheeks.every(p=>Math.abs(p.x)>.009),'protective cheeks leave the central cocking body exposed');
const cap=PartPositions('RearSmallCover'),capBox=new THREE.Box3().setFromPoints(cap),capSize=capBox.getSize(new THREE.Vector3());
assert(capSize.x>.015&&capSize.y>.015,'rear disc has a complete circular silhouette');
const flag=PartPositions('RearTab'),flagSize=new THREE.Box3().setFromPoints(flag).getSize(new THREE.Vector3());
assert(flagSize.z<.0025,'safety flag has the reference thin-section profile');
assert.equal(report.parts.find(p=>p.part==='HandleSphere').gameTriangles,2208,'bolt knob silhouette uses the refined surface');
for(const name of ['RearOuterCover_RoundedSideReturn','HandleSphere','RearSmallCover','RearBand_ControlledCrown','FrontBand_ContinuousEnvelopeContact','LowerPlateGuard_FlatSideNarrowReturn']){
 const node=doc.nodes.find(n=>n.name===name),primitive=doc.meshes[node.mesh].primitives[0],material=doc.materials[primitive.material];
 const texture=doc.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index];
 const image=doc.images[texture.extensions?.EXT_texture_webp?.source??texture.source],view=doc.bufferViews[image.bufferView];
 const {data,info}=await sharp(bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength)).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let sum=0,squared=0;for(let index=1;index<data.length;index+=info.channels){const value=data[index]/255;sum+=value;squared+=value*value;}
 const count=info.width*info.height,mean=sum/count,deviation=Math.sqrt(Math.max(0,squared/count-mean*mean));
 if(name==='RearBand_ControlledCrown'||name==='FrontBand_ContinuousEnvelopeContact'){
  let polished=0,satin=0;for(let index=1;index<data.length;index+=info.channels){polished+=data[index]<83;satin+=data[index]>115;}
  assert(polished/count>.08&&satin/count>.12&&mean>.34&&mean<.55&&deviation>.05,`${name}: polished rim and satin body must both survive the bake`);
 }else assert(mean>.4&&mean<.75&&deviation>.015&&deviation<.2,`${name}: aged steel retains spatially varying roughness`);
 let brightSteel=0,maskCount=0;
 for(let index=2;index<data.length;index+=info.channels){if(data[index]>219)brightSteel++;maskCount++;}
 assert(brightSteel/maskCount>.5,`${name}: most exposed steel retains a metallic response`);
}
assert.equal(report.parts.find(p=>p.part==='MainWood_ContinuousLowerShoulder').gameTriangles,32211,'use clean wood before the slicing regression');
assert.equal(report.parts.find(p=>p.part==='UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront').gameTriangles,12107);
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
// The portable GLB works with a plain glTF loader and the calibrated and legacy game modes.
const handle=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());
handle.name='HandleSphere';const stockMaterial=new THREE.MeshPhysicalMaterial();
stockMaterial.map=new THREE.Texture();stockMaterial.clearcoatMap=new THREE.Texture();
const stockMesh=new THREE.Mesh(new THREE.BoxGeometry(),stockMaterial);stockMesh.name='MainWood_ContinuousLowerShoulder';
const nativeScene=new THREE.Group();nativeScene.add(handle,stockMesh);
const portable={gltf:{scene:nativeScene,asset:doc.asset},materials:new Map()};
ConfigureHanYang173R(portable,library);
for(const part of [handle,stockMesh]){
 assert.deepEqual(part.material.color.toArray(),[1,1,1]);
 assert.equal(part.material.userData.externalMaterialClass,'authored');
 assert.equal(part.material.userData.materialShadingSurface.skin,false);
 const oldGain=HanYang173RBaseGain(part.name,'candidate'),legacy=HanYang173RBaseGain(part.name,'authored',true);
 assert(legacy.every((v,i)=>Math.abs(v*oldGain[i]-D.exposureGain)<1e-10));
}
assert.equal(stockMesh.material.clearcoatMap.anisotropy,16);
ConfigureHanYang173R(portable,null,4);
assert.equal(stockMesh.material.clearcoatMap.anisotropy,4,'inspection paths also filter the oil mask');
for(const part of [handle,stockMesh]){part.geometry.dispose();part.material.dispose();}
stockMaterial.map.dispose();stockMaterial.clearcoatMap.dispose();
// A triangle wound against its authored normals is re-wound; a consistent one is untouched.
const tri=new THREE.BufferGeometry();tri.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,1,0,0],3));
tri.setAttribute('normal',new THREE.Float32BufferAttribute(Array(6).fill([0,0,1]).flat(),3));tri.setIndex([0,1,2,3,4,5]);
RepairHanYangWinding(tri);assert.deepEqual(Array.from(tri.index.array),[0,1,2,3,5,4]);
mesh.geometry.dispose();mesh.material.dispose();
console.log(`ok HanYang173R: ${triangles} triangles, ${vertices} vertices, 44 parts, 132 PBR images plus two localized finish masks, aligned UVs, finite tangent frames and ORM decoding`);
