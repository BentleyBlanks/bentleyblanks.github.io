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
assert.equal(doc.meshes.length,D.renderMeshes);assert.equal(doc.meshes.length,contract.renderMeshes);
assert.equal(doc.images.length,contract.images);assert.equal(doc.images.length,contract.imagePayloads.length);
assert(D.renderMeshes<D.parts,'the game GLB must contain fewer rendering meshes than source parts');
const aoImages=new Set();
for(const material of doc.materials){
 const orm=material.pbrMetallicRoughness.metallicRoughnessTexture;
 assert.deepEqual(material.occlusionTexture,{...orm,strength:1},'AO must share the ORM texture and UVs');
 aoImages.add(doc.textures[orm.index].source);
}
assert.equal(contract.ambientOcclusion.materials,doc.materials.length);
assert.equal(contract.ambientOcclusion.channel,'R');
assert.deepEqual(contract.ambientOcclusion.images,[...aoImages].sort((a,b)=>a-b));
const woodAoImages=D.wood.map(part=>{
 const node=doc.nodes.find(item=>item.extras.SourceObject===part);
 const material=doc.materials[doc.meshes[node.mesh].primitives[0].material];
 return doc.textures[material.occlusionTexture.index].source;
});
assert.deepEqual(contract.ambientOcclusion.woodCavityImages,woodAoImages.sort((a,b)=>a-b));
const edgeFinish=contract.edgeHighlights;
assert(edgeFinish.ormImages.length>12&&edgeFinish.ormImages.every(index=>aoImages.has(index)));
const woodCoatImages=D.wood.map(part=>{
 const node=doc.nodes.find(item=>item.extras.SourceObject===part);
 const coat=doc.materials[doc.meshes[node.mesh].primitives[0].material].extensions.KHR_materials_clearcoat;
 assert.equal(coat.clearcoatTexture.index,coat.clearcoatRoughnessTexture.index);
 return doc.textures[coat.clearcoatTexture.index].source;
});
assert.deepEqual(edgeFinish.clearcoatImages,woodCoatImages.sort((a,b)=>a-b));
const rear=contract.rearContact;
assert(rear.samples>=128&&rear.atlasLimit>=1536,'rear contact bake must use dense sampling');
assert(rear.images.every(index=>aoImages.has(index))&&rear.images.length>=8);
const normalImages=new Set(doc.materials.flatMap(mat=>mat.normalTexture?[doc.textures[mat.normalTexture.index].source]:[]));
assert(rear.normalImages.length>=3&&rear.normalImages.every(index=>normalImages.has(index)));
assert([...D.bolt,...D.dustCover,'T38_433E_VisibleSideBlockRimInset',D.wood[0]].every(part=>rear.parts.includes(part)));
const seat = contract.stockSeat;
assert(seat.edgeSamples>=400&&seat.seatedEdgeSamples>=seat.edgeSamples*.98);
assert(seat.visibleFaceSamples>50000&&seat.coveredFaceSamples===0);
assert.equal(seat.aoImages.length,2);
assert(seat.aoImages.every(index=>aoImages.has(index)));
const wear=contract.serviceWear;
assert([...D.wood,...D.dustCover,'Exterior_SeatedTang05','T38_440D2_IndependentVisibleRecess']
 .every(part=>wear.parts.includes(part)));
assert(wear.images.length>=10&&wear.images.every(index=>doc.images[index]));
assert(wear.contactImages.every(index=>aoImages.has(index)));
assert(wear.diskOutlineRatio>1.035&&wear.diskOutlineRatio<1.135);
const compactTail=contract.compactTail;
assert(compactTail.diskClearanceSamples>75_000);
assert(compactTail.contactImages.length>=5&&compactTail.contactImages.every(index=>aoImages.has(index)));
const atlasParts=['T38_430B_ContinuousLowerFacing_VisualOnly','T38_340_VisibleStaticSkin_Nonfunctional','T38_349_OpaqueExteriorWeb_VisualOnly'];
const insetPrimitives=atlasParts.map(part=>doc.meshes[doc.nodes.find(node=>node.extras?.SourceObject===part||
 node.extras?.SourceRanges?.some(section=>section.part===part)).mesh].primitives[0]);
const atlasMaterial=doc.materials[insetPrimitives[0].material].pbrMetallicRoughness;
for(const primitive of insetPrimitives.slice(1)){
 const material=doc.materials[primitive.material].pbrMetallicRoughness;
 const uv=doc.accessors[primitive.attributes.TEXCOORD_0];
 assert.equal(uv.count,doc.accessors[primitive.attributes.POSITION].count);
 assert(uv.min[0]>.26&&uv.max[0]<.95&&uv.min[1]>.10&&uv.max[1]<.36,'inset UVs must stay inside the padded steel chart');
 assert.deepEqual(material.baseColorTexture,atlasMaterial.baseColorTexture);
 assert.deepEqual(material.metallicRoughnessTexture,atlasMaterial.metallicRoughnessTexture);
}
assert.equal(doc.meshes.flatMap(mesh=>mesh.primitives).reduce((sum,p)=>sum+doc.accessors[p.indices].count/3,0),D.triangles);
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
assert.equal(npc.tris,D.npcTriangles);assert.equal(npc.meshes.length,D.renderMeshes);
for(let i=0;i<npc.meshes.length;i++){
 assert.equal(npc.meshes[i].material,fps.meshes[i].material);
 if(npc.meshes[i].userData.type38Part!==D.npcLodPart)assert.deepEqual(npc.meshes[i].geometry.attributes.position.array,world.meshes[i].geometry.attributes.position.array,'the other batches retain full geometry');
}
assert.equal(fps.tris,D.triangles);assert.equal(world.tris,D.triangles);assert.equal(fps.meshes.length,D.renderMeshes);
assert(fps.meshes.every((mesh,i)=>mesh.geometry!==world.meshes[i].geometry&&mesh.material===world.meshes[i].material));
const logicalParts=meshes=>meshes.flatMap(mesh=>mesh.userData.type38Parts).sort();
assert.equal(new Set(logicalParts(fps.meshes)).size,D.parts);
assert.deepEqual(logicalParts(fps.nodes.get('boltBody').children),[...D.bolt].sort());
assert.deepEqual(logicalParts(fps.nodes.get('dustCover').children),[...D.dustCover].sort());
assert.equal(fps.nodes.get('dustCover').children.length,1,'both cover halves should use a single rendering mesh');
assert(fps.meshes.every((mesh,index)=>{
 const source=doc.materials[doc.meshes[index].primitives[0].material].pbrMetallicRoughness;
 const expected=(source.baseColorFactor||[1,1,1]).slice(0,3);
 return mesh.material.color.toArray().every((channel,component)=>Math.abs(channel-expected[component])<1e-6);
}));
assert(fps.meshes.every(mesh=>mesh.material.userData.externalMaterialClass==='authored'&&!mesh.material.userData.materialShadingSurface.skin));
const namedShell=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshPhysicalMaterial({clearcoat:.6,clearcoatRoughness:.3,specularIntensity:.4}));
namedShell.material.name='Head_Skin_VisualMetalShell';const sourceMaterial=namedShell.material;
const taggedNormal=new THREE.Texture(),taggedRoughness=new THREE.Texture(),taggedBase=new THREE.Texture();
taggedNormal.colorSpace=THREE.LinearSRGBColorSpace;taggedRoughness.colorSpace=THREE.LinearSRGBColorSpace;taggedBase.colorSpace=THREE.SRGBColorSpace;
sourceMaterial.normalMap=taggedNormal;sourceMaterial.roughnessMap=taggedRoughness;sourceMaterial.map=taggedBase;namedShell.userData.SourceObject='Head_Skin_VisualMetalShell';
const taggedScene=new THREE.Group();taggedScene.add(namedShell);ConfigureType38_511({gltf:{scene:taggedScene},materials:new Map()},library);
assert.equal(taggedNormal.colorSpace,THREE.NoColorSpace);assert.equal(taggedRoughness.colorSpace,THREE.NoColorSpace);assert.equal(taggedBase.colorSpace,THREE.SRGBColorSpace);
library.ConfigureExternalPbr(sourceMaterial,{mesh:namedShell,preserveAuthored:true});
assert.equal(namedShell.material,sourceMaterial);assert.equal(sourceMaterial.clearcoat,.6);assert.equal(sourceMaterial.specularIntensity,.4);
library.ConfigureExternalPbr(sourceMaterial,{mesh:namedShell});
assert.equal(sourceMaterial.userData.externalMaterialClass,'authored','explicit PBR policy persists across repeated configuration');
namedShell.geometry.dispose();namedShell.material.dispose();
taggedNormal.dispose();taggedRoughness.dispose();taggedBase.dispose();
// Read the packed slices for the existing individual silhouette and contact checks.
const inspectionGeometry=[];
const inspectionParts=fps.meshes.flatMap(mesh=>{
 const ranges=mesh.userData.type38SourceRanges;
 if(!ranges)return [mesh];
 return ranges.map(({part,vertexStart,vertexCount,indexStart,indexCount,tile})=>{
  const slice=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(mesh.geometry.attributes)){
   const first=vertexStart*attribute.itemSize,last=first+vertexCount*attribute.itemSize;
   const data=attribute.array.slice(first,last);
   if(name==='uv'&&tile){
    for(let i=0;i<data.length;i+=2)for(let axis=0;axis<2;axis++){
     data[i+axis]=(data[i+axis]*tile.atlasSize[axis]-tile.atlasOrigin[axis]+tile.sourceRect[axis])/tile.sourceSize[axis];
    }
   }
   slice.setAttribute(name,new THREE.BufferAttribute(data,attribute.itemSize,attribute.normalized));
  }
  const indices=mesh.geometry.index.array.slice(indexStart,indexStart+indexCount);
  for(let i=0;i<indices.length;i++)indices[i]-=vertexStart;
  slice.setIndex(new THREE.BufferAttribute(indices,1));
  inspectionGeometry.push(slice);
  const source=new THREE.Mesh(slice,mesh.material);
  source.userData.type38Part=part;
  return source;
 });
});
const head=inspectionParts.find(mesh=>mesh.userData.type38Part==='Exterior_ShortTransverseHead71');
fps.root.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(-.000284,.055,0),new THREE.Vector3(0,0,-1));ray.layers.enableAll();
assert.equal(ray.intersectObject(head).length,0,'real open sight notch at the eye line');
ray.ray.origin.x=.006;assert(ray.intersectObject(head).length>0,'both solid sight shoulders remain');
assert(Math.abs(fps.bounds.max.z-fps.bounds.min.z-1.276)<.002);
const exteriorCrown=inspectionParts.find(mesh=>mesh.userData.type38Part==='T38_430J_Exterior_ImportedRemainder_Plate72');
const exteriorSeat=inspectionParts.find(mesh=>mesh.userData.type38Part==='Exterior_FrontUpperRoot80');
const crownPositions=exteriorCrown.geometry.attributes.position,tipPoints=[];
for(let index=0;index<crownPositions.count;index++){
 const point=new THREE.Vector3().fromBufferAttribute(crownPositions,index);
 if(point.z<D.frontSightRegion.z+.01)tipPoints.push(point);
}
const crownBounds=new THREE.Box3().setFromPoints(tipPoints);
exteriorSeat.geometry.computeBoundingBox();
assert(crownBounds.intersectsBox(exteriorSeat.geometry.boundingBox),'visible crown meets its authored base');
const seamProbe=new THREE.Raycaster(new THREE.Vector3(.04,(crownBounds.max.y+exteriorSeat.geometry.boundingBox.max.y)/2,crownBounds.getCenter(new THREE.Vector3()).z),new THREE.Vector3(-1,0,0));
seamProbe.layers.enableAll();assert(seamProbe.intersectObject(exteriorCrown).length>0,'side silhouette spans the old visible air gap');
assert(Math.abs(crownBounds.max.y-.05245)<.0001,'original visual tip height retained');
const capPlanes=[];
for(let i=0;i<exteriorCrown.geometry.index.count;i+=3){
  const corners=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(crownPositions,exteriorCrown.geometry.index.getX(i+offset)));
  if(corners.some(point=>point.y<crownBounds.max.y-.0039||point.z>crownBounds.max.z+.002))continue;
  const n=corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).normalize();
  if(n.y>.90)capPlanes.push(n);
}
assert(capPlanes.length>=3&&capPlanes.every(n=>n.dot(capPlanes[0])>.9999),'the visible cap should have one consistent facing plane');
assert(contract.triangles<=80000 && doc.asset.extras.runtimeTriangles===contract.triangles);
const woodRim=inspectionParts.find(mesh=>mesh.userData.type38Part==='Wood_UpperFittedCrown05');
const middleBand=inspectionParts.find(mesh=>mesh.userData.type38Part==='Exterior_MiddleBand57');
const windowTrim=inspectionParts.find(mesh=>mesh.userData.type38Part==='Exterior_FrontWindowBacking49');
windowTrim.geometry.computeBoundingBox();
const trimBounds=windowTrim.geometry.boundingBox,windowCenter=trimBounds.getCenter(new THREE.Vector3());
const windowExtent=trimBounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
const windowProbe=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
windowProbe.layers.enableAll();
for(const [longitudinal,expected] of [[-.34,woodRim],[.075,windowTrim],[.445,woodRim]]){
 for(const lateral of [-.24,0,.24]){
  windowProbe.ray.origin.set(windowCenter.x+lateral*windowExtent.x,trimBounds.max.y+.08,windowCenter.z+longitudinal*windowExtent.z);
  assert.equal(windowProbe.intersectObjects(inspectionParts)[0]?.object,expected,'both exterior windows reveal the actual handguard, with a steel divider between them');
 }
}
assert.equal(windowTrim.geometry.index.count/3,1000);
for(const part of [woodRim,middleBand])part.geometry.computeBoundingBox();
const bandBox=middleBand.geometry.boundingBox,rimBox=woodRim.geometry.boundingBox;
const bandSpan=bandBox.max.z-bandBox.min.z,rimFraction=(bandBox.min.z-rimBox.min.z)/bandSpan;
assert(rimFraction>.65&&rimFraction<1.05,'rounded wood lip must remain visible beyond the grey band');
const woodProbe=new THREE.Raycaster(new THREE.Vector3(.06,bandBox.max.y-.38*bandSpan,bandBox.min.z-.42*bandSpan),new THREE.Vector3(-1,0,0));
woodProbe.layers.enableAll();
assert.equal(woodProbe.intersectObjects(inspectionParts)[0]?.object,woodRim,'wood, not metal, is visible in the lip profile');
const bandCenter=bandBox.getCenter(new THREE.Vector3());
const bandPosition=middleBand.geometry.attributes.position;
const bandUv=middleBand.geometry.attributes.uv;
const bandBacking=inspectionParts.filter(mesh=>[woodRim.userData.type38Part,'T38_460G_WoodGroove_VisualCandidate','Exterior_LongRound44'].includes(mesh.userData.type38Part));
const contactRay=new THREE.Raycaster();contactRay.layers.enableAll();
let upperSamples=0,backedSamples=0;
for(let i=0;i<bandPosition.count;i++){
  if(bandUv.getX(i)<.965||bandPosition.getY(i)<bandCenter.y+.15*(bandBox.max.y-bandBox.min.y))continue;
  const edge=new THREE.Vector3().fromBufferAttribute(bandPosition,i);
  const radial=edge.clone().sub(bandCenter).setZ(0).normalize();
  edge.z=bandBox.min.z+.0002;
  contactRay.set(edge.addScaledVector(radial,.010),radial.multiplyScalar(-1));
  const contact=contactRay.intersectObjects(bandBacking)[0];
  upperSamples++;
  if(contact&&contact.distance<=.010+.045*bandSpan)backedSamples++;
}
assert(upperSamples>8&&backedSamples>=.9*upperSamples,'the upper band lip should seat on the visible stock contours');
const FindPart=name=>inspectionParts.find(mesh=>mesh.userData.type38Part===name);
const rimRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(-1,0,0));
rimRay.layers.enableAll();
for(const band of [middleBand,FindPart('T38_407F_VisualSkin_Exterior_FrontBandBody78')]){
  band.geometry.computeBoundingBox();
  const box=band.geometry.boundingBox,mid=box.getCenter(new THREE.Vector3());
  const normalAt=phase=>{
    rimRay.ray.origin.set(box.max.x+.03,mid.y,box.min.z+phase*(box.max.z-box.min.z));
    return -rimRay.intersectObject(band)[0]?.normal?.normalize().z;
  };
  const outerNormal=normalAt(.38);
  const normals=[.002,.017,.032,.047,.062,.082].map(normalAt);
  assert(Math.abs(outerNormal)<.18&&normals[0]>.90&&Math.abs(normals.at(-1)-outerNormal)<.105&&
    normals.every((value,i)=>i===0||value<normals[i-1]-.02),
    'the band fillet must turn smoothly from the rim onto the outer face');
}
const cap=FindPart('Exterior_ButtCap04');
cap.geometry.computeBoundingBox();
const capBox=cap.geometry.boundingBox,capCenter=capBox.getCenter(new THREE.Vector3());
const capRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,-1));
capRay.layers.enableAll();
const facingNormals=[];
for(const height of [-.3,0,.3])for(const side of [-.24,0,.24]){
  capRay.ray.origin.set(capCenter.x+side*(capBox.max.x-capBox.min.x),
    capCenter.y+height*(capBox.max.y-capBox.min.y),capBox.max.z+.08);
  const hit=capRay.intersectObject(cap)[0];
  assert(hit?.normal,'heel plate must present a continuous outer face');
  facingNormals.push(hit.normal.normalize());
}
assert(facingNormals.every(n=>n.angleTo(facingNormals[4])<.16),'heel plate must have a smooth broad facing');
const crownParts=D.dustCover.map(FindPart);
const topRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
topRay.layers.enableAll();
for(const z of [-.225,-.193,-.161,-.121]){
  const normals=[-.0002,.0002].map(x=>{
    topRay.ray.origin.set(x,.12,z);
    return topRay.intersectObjects(crownParts)[0]?.normal?.normalize();
  });
  assert(normals.every(Boolean)&&normals[0].angleTo(normals[1])<.16,'visible top faces must share a smooth highlight across the split');
}
const edgeStart=new THREE.Vector3(),edgeEnd=new THREE.Vector3(),corner=new THREE.Vector3(),normal=new THREE.Vector3(),tangent=new THREE.Vector3();
for(const mesh of inspectionParts.filter(item=>item===woodRim||item===windowTrim||Object.hasOwn(contract.exteriorTriangleDeltas,item.userData.type38Part))){
 const geometry=mesh.geometry,{position,normal:normalAttr,tangent:tangentAttr}=geometry.attributes;
 for(let index=0;index<position.count;index++){
  normal.fromBufferAttribute(normalAttr,index);tangent.fromBufferAttribute(tangentAttr,index);
  assert(Math.abs(tangent.length()-1)<.0001&&Math.abs(normal.dot(tangent))<.0001,`invalid exterior tangent: ${mesh.name}`);
 }
 for(let index=0;index<geometry.index.count;index+=3){
  corner.fromBufferAttribute(position,geometry.index.getX(index));
  edgeStart.fromBufferAttribute(position,geometry.index.getX(index+1)).sub(corner);
  edgeEnd.fromBufferAttribute(position,geometry.index.getX(index+2)).sub(corner);
  assert(edgeStart.cross(edgeEnd).length()>1e-12,`collapsed exterior bevel: ${mesh.name}`);
 }
}
assert.deepEqual(Object.keys(contract.finishRoughnessP10P50P90).sort(),inspectionParts.map(m=>m.userData.type38Part).sort());
assert.deepEqual(contract.markings,['scale graduations and numerals only']);
const grip=inspectionParts.find(mesh=>mesh.userData.type38Part==='Exterior_HandleOval08').geometry;
const gripPoints=grip.attributes.position, gripNormals=grip.attributes.normal;
grip.computeBoundingBox();
const gripBox=grip.boundingBox,gripSpan=gripBox.max.x-gripBox.min.x,angles=new Set();
for(let index=0;index<gripPoints.count;index++){
 const phase=(gripPoints.getX(index)-gripBox.min.x)/gripSpan;
 if(phase>.32&&phase<.38)angles.add(Math.round(Math.atan2(gripNormals.getZ(index),gripNormals.getY(index))*100));
}
assert(angles.size>=28,'handle neck must give a continuous round highlight, not the old four-flat silhouette');
assert.equal(grip.index.count/3,2304);
const rearShell=inspectionParts.find(mesh=>mesh.userData.type38Part==='T38_440D2_IndependentVisibleRecess').geometry;
rearShell.computeBoundingBox();
const shellBox=rearShell.boundingBox,shellRadius=(shellBox.max.y-shellBox.min.y)/2;
const shellCenterY=(shellBox.max.y+shellBox.min.y)/2,shellCenterX=shellBox.max.x-shellRadius;
const surfaceDepth=[],rimDepth=[];
let lowerLeftTip=0,upperLeftReach=0,rearBaseRadius=0;
for(let index=0;index<rearShell.attributes.position.count;index++){
 const vertices=rearShell.attributes.position;
 const horizontal=(vertices.getX(index)-shellCenterX)/shellRadius,vertical=(vertices.getY(index)-shellCenterY)/shellRadius;
 const depth=vertices.getZ(index),radius=Math.hypot(horizontal,vertical);
 if(Math.abs(depth-shellBox.min.z)<1e-6)rearBaseRadius=Math.max(rearBaseRadius,radius);
 if(depth<shellBox.max.z-shellRadius*.20)continue;
 if(vertical<0&&vertical>-.48)lowerLeftTip=Math.max(lowerLeftTip,-horizontal);
 if(horizontal<0&&vertical>.36&&vertical<.72)upperLeftReach=Math.max(upperLeftReach,-horizontal);
 if(radius<.06)surfaceDepth.push(depth);
 if(radius>.16&&radius<.19)rimDepth.push(depth);
}
assert.equal(rearShell.index.count/3,3168);
const shellDepth=(shellBox.max.z-shellBox.min.z)/shellRadius;
assert(shellDepth>.38&&shellDepth<.48,'the rear disk needs a short sidewall relative to its face');
assert(rearBaseRadius>.88&&rearBaseRadius<.96,'the rear disk needs a broad shoulder with a slight taper');
assert(lowerLeftTip>1.025&&lowerLeftTip<1.135&&upperLeftReach<1,
 'the rear exterior needs a near-circular contour with a small lower-left shoulder');
assert(surfaceDepth.length&&rimDepth.length&&Math.max(...rimDepth)-Math.max(...surfaceDepth)>shellRadius*.023,
 'central depression and rim must exist in vertex positions, independent of the normal map');
const stock=inspectionParts.find(mesh=>mesh.userData.type38Part==='T38_460G_WoodGroove_VisualCandidate').geometry;
const loop=inspectionParts.find(mesh=>mesh.userData.type38Part==='Exterior_RetainedImportedBody74').geometry;
loop.computeBoundingBox();
const loopBox=loop.boundingBox,loopHeight=loopBox.max.y-loopBox.min.y;
const bottomRows=new Set();
for(let i=0;i<loop.attributes.position.count;i++){
 const vertices=loop.attributes.position;
 if(vertices.getY(i)<loopBox.min.y+loopHeight*.18)bottomRows.add(Math.round(1000*(vertices.getX(i)-loopBox.min.x)/loopHeight));
}
assert.equal(loop.index.count/3,1296);
assert(bottomRows.size>12,'the visible bottom bow needs vertex samples between its two bends');
const stockUv=stock.attributes.uv;
let stockArea=0;
for(let corner=0;corner<stock.index.count;corner+=3){
 const first=stock.index.getX(corner),second=stock.index.getX(corner+1),third=stock.index.getX(corner+2);
 stockArea+=Math.abs((stockUv.getX(second)-stockUv.getX(first))*(stockUv.getY(third)-stockUv.getY(first))
                    -(stockUv.getY(second)-stockUv.getY(first))*(stockUv.getX(third)-stockUv.getX(first)))/2;
}
assert(stockArea>.30&&stockArea<.34,'stock pore detail must use the widened non-overlapping UV charts');
for(const part of [...D.wood,'T38_430B_IndependentLeftCoverSkin','Exterior_MiddleBand57']){
 const [low,,high]=contract.finishRoughnessP10P50P90[part];assert(high-low>24,`flat surface response: ${part}`);
}
for(const range of Object.values(contract.finishRoughnessP10P50P90))assert(range[2]>range[0] && range.every(Number.isFinite));
for(const geometry of inspectionGeometry)geometry.dispose();
for(const built of [fps,world,npc])for(const mesh of built.meshes)mesh.geometry.dispose();
console.log(`ok Type38 511: ${D.triangles} triangles, ${fps.meshes.length} draw meshes from ${inspectionParts.length} source parts, ${doc.images.length} verified PBR images, continuous heel and crown shading`);
