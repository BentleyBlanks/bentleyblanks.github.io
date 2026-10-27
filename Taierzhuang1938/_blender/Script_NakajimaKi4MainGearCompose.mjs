// Compose the separately authored gear into protected V25 exports for GRAY QA.
// All retained geometry elements and all37 image payloads stay byte-identical.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from '../vendor/three/build/three.module.js';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from '../_import/Script_LugouGlbPose.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const baseline=process.env.KI4_BASELINE_ASSET_ROOT??path.join(repo,'tmp/NakajimaKi4/ReferenceV25'),output=process.env.KI4_ASSET_ROOT??path.join(repo,'tmp/NakajimaKi4/ReferenceV28');
const source=process.env.KI4_SOURCE_ROOT??'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV28';
const update=JSON.parse(fs.readFileSync(path.join(output,'Evidence/Data_MainGearSourceUpdate.json'))),patch=LoadGlb(path.join(output,'Model_MainGearPatch.glb'));
const removed=new Set(update.removed.map(row=>row.name)),newNames=new Set(update.new.map(row=>row.name));
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(Hash(patch.buffer),update.patchSha256);assert.equal(patch.json.images?.length??0,0);assert.equal(patch.json.materials.length,1);
assert.equal(Hash(fs.readFileSync(path.join(source,'Scene_NakajimaKi4.blend'))),update.sourceSha256);
const typeSize={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},componentSize={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
function Binary(glb){const first=12+8+glb.buffer.readUInt32LE(12);return glb.buffer.subarray(first+8,first+8+glb.buffer.readUInt32LE(first));}
function Worlds(json){const world=new Map();function Visit(index,parent){const n=json.nodes[index],local=n.matrix?new T.Matrix4().fromArray(n.matrix):new T.Matrix4().compose(new T.Vector3(...(n.translation??[0,0,0])),new T.Quaternion(...(n.rotation??[0,0,0,1])),new T.Vector3(...(n.scale??[1,1,1]))),matrix=parent.clone().multiply(local);world.set(index,matrix);for(const child of n.children??[])Visit(child,matrix);}for(const index of json.scenes[json.scene??0].nodes)Visit(index,new T.Matrix4());return world;}
const high=LoadGlb(path.join(baseline,'Model_NakajimaKi4High.glb')),oldWorld=Worlds(high.json),oldSets=new Map(),oldPoints=new Map();
const PointKey=p=>p.map(v=>Math.round(v*1e4)).join(',');
for(let index=0;index<high.json.nodes.length;index++){
 const n=high.json.nodes[index];if(!removed.has(n.name))continue;const points=new Set(),raw=[];
 for(const primitive of high.json.meshes[n.mesh].primitives){const a=ReadAccessor(high,primitive.attributes.POSITION).data;for(let k=0;k<a.length;k+=3){const point=new T.Vector3(a[k],a[k+1],a[k+2]).applyMatrix4(oldWorld.get(index)).toArray();points.add(PointKey(point));raw.push(point);}}
 oldSets.set(n.name,points);oldPoints.set(n.name,raw);
}assert.equal(oldSets.size,4);

function WriteGlb(file,json,binary){const a=Buffer.from(JSON.stringify(json)),text=Buffer.concat([a,Buffer.alloc((4-a.length%4)%4,32)]),bin=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]),head=Buffer.alloc(20),binHead=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(20+text.length+8+bin.length,8);head.writeUInt32LE(text.length,12);head.writeUInt32LE(0x4e4f534a,16);binHead.writeUInt32LE(bin.length);binHead.writeUInt32LE(0x004e4942,4);fs.writeFileSync(file,Buffer.concat([head,text,binHead,bin]));}

function Compose(baseFile,outFile,kind,expectedSha){
 const base=LoadGlb(baseFile),g=structuredClone(base.json),baseBin=Binary(base),segments=[baseBin];let length=baseBin.length;
 assert.equal(Hash(base.buffer),expectedSha);assert(!g.skins?.length&&!g.animations?.length);
 function Append(bytes){const padding=(4-length%4)%4;if(padding){segments.push(Buffer.alloc(padding));length+=padding;}const offset=length;segments.push(bytes);length+=bytes.length;return offset;}
 function AccessorBytes(index,kept){const accessor=base.json.accessors[index],view=base.json.bufferViews[accessor.bufferView];assert(!accessor.sparse);const size=typeSize[accessor.type]*componentSize[accessor.componentType],stride=view.byteStride??size,start=(view.byteOffset??0)+(accessor.byteOffset??0),bytes=Buffer.alloc(kept.length*size);for(let i=0;i<kept.length;i++)baseBin.copy(bytes,i*size,start+kept[i]*stride,start+kept[i]*stride+size);return bytes;}
 function AddFilteredAccessor(index,kept){const original=base.json.accessors[index],bytes=AccessorBytes(index,kept),view=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:Append(bytes),byteLength:bytes.length,target:34962});const accessor={...structuredClone(original),bufferView:view,byteOffset:0,count:kept.length};if(original.min||original.max){const values=ReadAccessor(base,index).data,count=typeSize[original.type];accessor.min=Array.from({length:count},(_,k)=>Math.min(...kept.map(i=>values[i*count+k])));accessor.max=Array.from({length:count},(_,k)=>Math.max(...kept.map(i=>values[i*count+k])));}g.accessors.push(accessor);return g.accessors.length-1;}
 const removalCounts=Object.fromEntries([...removed].map(name=>[name,0]));
 if(kind==='low'){
  const world=Worlds(base.json);let affected=0;
  for(let index=0;index<g.nodes.length;index++){
   const n=g.nodes[index],parts=n.extras?.sourceParts??[n.name];if(!parts.some(name=>removed.has(name)))continue;affected++;
   assert(n.mesh!==undefined);for(const primitive of g.meshes[n.mesh].primitives){
    const values=ReadAccessor(base,primitive.attributes.POSITION).data,owners=[];for(let k=0;k<values.length;k+=3){const q=new T.Vector3(values[k],values[k+1],values[k+2]).applyMatrix4(world.get(index)).toArray();owners.push([...oldPoints].find(([,points])=>points.some(p=>(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2<4e-12))?.[0]);}
    const indices=ReadAccessorInt(base,primitive.indices).data,remaining=[];
    for(let k=0;k<indices.length;k+=3){const tri=[indices[k],indices[k+1],indices[k+2]],owner=owners[tri[0]];if(owner&&tri.every(i=>owners[i]===owner))removalCounts[owner]++;else remaining.push(...tri);}
    const kept=[...new Set(remaining)].sort((a,b)=>a-b),remap=new Map(kept.map((index,k)=>[index,k]));
    for(const [name,accessor] of Object.entries(primitive.attributes))primitive.attributes[name]=AddFilteredAccessor(accessor,kept);
    const nextIndices=Uint32Array.from(remaining,index=>remap.get(index)),bytes=Buffer.from(nextIndices.buffer),view=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:Append(bytes),byteLength:bytes.length,target:34963});g.accessors.push({bufferView:view,byteOffset:0,componentType:5125,count:nextIndices.length,type:'SCALAR',min:[Math.min(...nextIndices)],max:[Math.max(...nextIndices)]});primitive.indices=g.accessors.length-1;
   }
   n.extras.sourceParts=parts.filter(name=>!removed.has(name));
  }
  assert.equal(affected,1);for(const row of update.removed)assert.equal(removalCounts[row.name],row.triangles);
 }else{
  const nodeKeep=g.nodes.map((node,index)=>removed.has(node.name)?null:index).filter(v=>v!==null),nodeMap=new Map(nodeKeep.map((index,k)=>[index,k])),removedMeshes=new Set(g.nodes.filter(node=>removed.has(node.name)).map(node=>node.mesh)),meshKeep=g.meshes.map((_,index)=>index).filter(index=>!removedMeshes.has(index)),meshMap=new Map(meshKeep.map((index,k)=>[index,k]));
  assert.equal(g.nodes.length-nodeKeep.length,4);assert.equal(removedMeshes.size,4);
  g.nodes=nodeKeep.map(index=>{const n=g.nodes[index];if(n.children)n.children=n.children.filter(i=>nodeMap.has(i)).map(i=>nodeMap.get(i));if(n.mesh!==undefined)n.mesh=meshMap.get(n.mesh);return n;});g.meshes=meshKeep.map(index=>g.meshes[index]);for(const scene of g.scenes)scene.nodes=scene.nodes.map(index=>nodeMap.get(index));
  for(const row of update.removed)removalCounts[row.name]=row.triangles;
 }
 const rootIndex=g.nodes.findIndex(n=>n.name==='NakajimaKi4'),patchRootIndex=patch.json.nodes.findIndex(n=>n.name==='NakajimaKi4'),patchRoot=patch.json.nodes[patchRootIndex];assert(rootIndex>=0&&patchRootIndex>=0);
 for(const key of ['matrix','translation','rotation','scale'])assert.deepEqual(g.nodes[rootIndex][key],patchRoot[key]);
 const offset=Append(Binary(patch)),viewOffset=g.bufferViews.length,accessorOffset=g.accessors.length,materialOffset=g.materials.length,meshOffset=g.meshes.length;
 for(const view of patch.json.bufferViews)g.bufferViews.push({...structuredClone(view),buffer:0,byteOffset:offset+(view.byteOffset??0)});
 for(const accessor of patch.json.accessors){assert(!accessor.sparse);g.accessors.push({...structuredClone(accessor),bufferView:viewOffset+accessor.bufferView});}
 g.materials.push(...structuredClone(patch.json.materials));
 for(const mesh of patch.json.meshes){const n=structuredClone(mesh);for(const primitive of n.primitives){for(const key of Object.keys(primitive.attributes))primitive.attributes[key]+=accessorOffset;primitive.indices+=accessorOffset;primitive.material+=materialOffset;}g.meshes.push(n);}
 const patchKeep=patch.json.nodes.map((_,i)=>i).filter(i=>i!==patchRootIndex),nodeMap=new Map(patchKeep.map((i,k)=>[i,g.nodes.length+k]));
 for(const i of patchKeep){const n=structuredClone(patch.json.nodes[i]);assert(newNames.has(n.name));if(n.children)n.children=n.children.map(index=>nodeMap.get(index));if(n.mesh!==undefined)n.mesh+=meshOffset;g.nodes.push(n);}
 g.nodes[rootIndex].children.push(...patchRoot.children.map(index=>nodeMap.get(index)));
 g.nodes[rootIndex].extras={...structuredClone(patchRoot.extras),grayCompositionBaselineSha256:expectedSha,grayCompositionOnly:true};
 g.extensionsUsed=[...new Set([...(g.extensionsUsed??[]),...(patch.json.extensionsUsed??[])])];
 g.buffers=[{byteLength:length}];const binary=Buffer.concat(segments);assert.equal(binary.length,length);
 // Base image views still point at the original prefix without re-encoding.
 const images=[];for(const image of g.images??[]){const view=g.bufferViews[image.bufferView],bytes=binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),oldView=base.json.bufferViews[image.bufferView],oldBytes=baseBin.subarray(oldView.byteOffset??0,(oldView.byteOffset??0)+oldView.byteLength);assert.deepEqual(bytes,oldBytes);images.push({name:image.name,sha256:Hash(bytes)});}
 WriteGlb(outFile,g,binary);
 const triangles=g.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((s,p)=>s+g.accessors[p.indices].count/3,0),0);
 return{file:outFile,sha256:Hash(fs.readFileSync(outFile)),bytes:fs.statSync(outFile).size,triangles,meshes:g.meshes.length,images:images.length,pivots:g.nodes.filter(n=>n.name?.startsWith('Pivot_')).map(n=>n.name),removedTriangles:removalCounts,retainedImagePayloads:images,scope:'Gray QA composition. Retained vertex attribute elements and all original image payloads copied exactly; only old four stays removed and actual newly authored V-leg/fittings added. New PBR/AO and final runtime derivation remain pending.'};
}
const low=Compose(path.join(baseline,'Model_NakajimaKi4.glb'),path.join(output,'Model_NakajimaKi4Gray.glb'),'low','209eaea8eb4e9a4dbd3a0693b55a15f8d22557ff22d4c10a410f24c43b1e56f9');
const highResult=Compose(path.join(baseline,'Model_NakajimaKi4High.glb'),path.join(output,'Model_NakajimaKi4HighGray.glb'),'high','fe471f341c4b8df2085cfc8d5609085f191cb3045c2233971ba777b1aee59991');
assert.deepEqual(low.pivots,highResult.pivots);assert.equal(low.pivots.length,10);assert.equal(low.images,37);assert.equal(highResult.meshes,912);
const record={state:'ActualSourceGearGrayComposition_NoPbrOrFidelityApproval',sourceSha256:update.sourceSha256,patchSha256:update.patchSha256,low,high:highResult};
for(const folder of [path.join(output,'Evidence'),path.join(source,'Evidence')])fs.writeFileSync(path.join(folder,'Data_MainGearGrayComposition.json'),JSON.stringify(record,null,2));
fs.copyFileSync(highResult.file,path.join(source,'Exports/Model_NakajimaKi4HighGray.glb'));
console.log(JSON.stringify({state:record.state,low:{sha256:low.sha256,triangles:low.triangles,meshes:low.meshes,images:low.images},high:{sha256:highResult.sha256,triangles:highResult.triangles,meshes:highResult.meshes},pivots:low.pivots.length}));
