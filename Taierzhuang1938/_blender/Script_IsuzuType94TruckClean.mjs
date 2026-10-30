// Package this truck's exported GLBs. Remove float32-collapsed triangles and
// restore explicitly fingerprinted post-export islands without rebuilding a
// Blender mesh (which can merge opposite faces or reinterpret zero normals).
// All other vertex records, winding, images and animation bytes stay verbatim.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LoadGlb,ReadAccessor,ReadAccessorInt,SerializeGlb,Multiply} from '../_import/Script_LugouGlbPose.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const Identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function LocalMatrix(node){
 if(node.matrix)return node.matrix;
 const [x,y,z,w]=node.rotation||[0,0,0,1],s=node.scale||[1,1,1],t=node.translation||[0,0,0];
 return [(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,...t,1];
}
function RestMatrices(doc){
 const matrices=new Map();
 function Walk(index,parent){
  if(matrices.has(index))throw new Error('Multiple owners in runtime node hierarchy');
  const matrix=Multiply(new Float64Array(16),parent,LocalMatrix(doc.nodes[index]));matrices.set(index,matrix);
  for(const child of doc.nodes[index].children||[])Walk(child,matrix);
 }
 for(const index of doc.scenes[doc.scene||0].nodes)Walk(index,Identity());return matrices;
}
function AssertRigid(matrix){
 for(let a=0;a<3;a++)for(let b=0;b<3;b++){
  const dot=matrix[a*4]*matrix[b*4]+matrix[a*4+1]*matrix[b*4+1]+matrix[a*4+2]*matrix[b*4+2];
  if(Math.abs(dot-(a===b?1:0))>1e-5)throw new Error('Post-export owner must have orthonormal unit-scale rest axes');
 }
 const det=matrix[0]*(matrix[5]*matrix[10]-matrix[6]*matrix[9])-matrix[4]*(matrix[1]*matrix[10]-matrix[2]*matrix[9])+matrix[8]*(matrix[1]*matrix[6]-matrix[2]*matrix[5]);
 if(Math.abs(det-1)>1e-5||[3,7,11].some(i=>Math.abs(matrix[i])>1e-8)||Math.abs(matrix[15]-1)>1e-8)throw new Error('Post-export owner must be a proper rigid transform');
}
function ToLocal(matrix,blender,point=false){
 // World Blender Z-up to glTF Y-up, followed by the inverse rigid owner.
 const world=[blender[0],blender[2],-blender[1]].map((v,i)=>v-(point?matrix[12+i]:0));
 return [0,1,2].map(i=>matrix[i*4]*world[0]+matrix[i*4+1]*world[1]+matrix[i*4+2]*world[2]);
}
function FloatAttribute(glb,index,width,count){
 const accessor=glb.json.accessors[index],view=glb.json.bufferViews[accessor?.bufferView];
 if(!accessor||accessor.componentType!==5126||accessor.normalized||accessor.sparse||!view||view.buffer!==0||accessor.count!==count||accessor.type!==({1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'})[width])throw new Error('Unsupported post-export float attribute');
 const start=(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||width*4;
 if(stride<width*4||start+(count-1)*stride+width*4>(view.byteOffset||0)+view.byteLength)throw new Error('Invalid post-export attribute range');
 return {accessor,record:i=>glb.bin.subarray(start+i*stride,start+i*stride+width*4)};
}

export function CleanTruckGlb(bytes){
 const glb=LoadGlb(bytes),doc=structuredClone(glb.json),parts=[glb.bin],rows=[],restoredParts=[];let offset=glb.bin.length,removed=0,metadataAdjusted=0;
 function Append(data,target){
  const pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad}
  const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target});parts.push(data);offset+=data.length;return view;
 }
 const runtime=doc.nodes.find(n=>n.name==='IsuzuType94Truck'&&n.extras?.SourcePartNames),names=runtime?.extras.SourcePartNames;
 if(runtime){
  const recipe=JSON.parse(fs.readFileSync(path.join(root,'Taierzhuang1938/Model/IsuzuType94Truck/Data_StableRuntimeParts.json'),'utf8'));
  const wanted=Object.keys(recipe.parts).filter(n=>recipe.parts[n].postExport).sort(),declared=[...(runtime.extras.PostExportStablePartNames||[])].sort();
  if(JSON.stringify(wanted)!==JSON.stringify(declared)||runtime.extras.StableRuntimeBaselineSha256!==recipe.baselineSha256)throw new Error('Runtime post-export recipe declaration is stale; reconstruct from the validated source');
  const wantedIds=new Map(wanted.map(name=>{const id=Object.keys(names).find(id=>names[id]===name);if(id===undefined)throw new Error('Missing source part: '+name);return [Number(id),name]})),matrices=RestMatrices(doc);
  for(const [nodeIndex,node]of doc.nodes.entries()){
   if(node.mesh===undefined)continue;
   for(const [pi,primitive]of doc.meshes[node.mesh].primitives.entries()){
    if(primitive.attributes._SOURCE_PART_ID===undefined)throw new Error('Runtime primitive has no source part labels');
    const labels=ReadAccessor(glb,primitive.attributes._SOURCE_PART_ID).data,present=new Map([...wantedIds].filter(([id])=>labels.includes(id)));
    if(!present.size)continue;
    if((primitive.mode??4)!==4||primitive.indices===undefined||primitive.targets||node.skin!==undefined)throw new Error('Post-export islands require indexed rigid triangles');
    const widths={POSITION:3,NORMAL:3,TEXCOORD_0:2,TANGENT:4,_SOURCE_PART_ID:1};
    if(Object.keys(primitive.attributes).length!==5||Object.keys(primitive.attributes).some(n=>!widths[n]))throw new Error('Unexpected runtime island attribute');
    const matrix=matrices.get(nodeIndex);if(!matrix)throw new Error('Runtime island owner is outside the active scene');AssertRigid(matrix);
    const attributes=Object.fromEntries(Object.entries(widths).map(([name,width])=>[name,FloatAttribute(glb,primitive.attributes[name],width,labels.length)]));
    const oldIndex=glb.json.accessors[primitive.indices];
    if(![5121,5123,5125].includes(oldIndex.componentType)||oldIndex.type!=='SCALAR'||oldIndex.sparse||oldIndex.normalized)throw new Error('Unsupported runtime island index format');
    const original=ReadAccessorInt(glb,primitive.indices).data,kept=[],counts=new Map([...present.keys()].map(id=>[id,0]));
    if(original.length%3)throw new Error('Incomplete runtime triangle');
    for(let i=0;i<original.length;i+=3){
     const face=original.slice(i,i+3);if(face.some(v=>v>=labels.length))throw new Error('Runtime triangle index out of range');
     const id=labels[face[0]];if(face.some(v=>labels[v]!==id))throw new Error('Runtime triangle crosses source labels');
     if(present.has(id))counts.set(id,counts.get(id)+1);else kept.push(...face);
    }
    // Retain even unused non-target vertices: source-cloud audits must not
    // lose unrelated float-collapsed corners. Remove only old target records.
    const retained=[],remap=new Map();for(let i=0;i<labels.length;i++)if(!present.has(labels[i])){remap.set(i,retained.length);retained.push(i)}
    const appended=[];for(const [id,name]of present){
     if(restoredParts.some(p=>p.name===name))throw new Error('Post-export part has multiple primitive owners: '+name);
     const part=recipe.parts[name],length=part.vertices.length,first=retained.length+appended.length;
     if(!counts.get(id)||[part.normals,part.uvs,part.tangents].some(a=>!a||a.length!==length))throw new Error('Incomplete stable island: '+name);
     for(let i=0;i<length;i++){
      const values={POSITION:ToLocal(matrix,part.vertices[i],true),NORMAL:ToLocal(matrix,part.normals[i]),TEXCOORD_0:[part.uvs[i][0],1-part.uvs[i][1]],TANGENT:[...ToLocal(matrix,part.tangents[i]),part.tangents[i][3]],_SOURCE_PART_ID:[id]};
      if(Object.entries(values).some(([n,v])=>v.length!==widths[n]||v.some(x=>!Number.isFinite(x))))throw new Error('Invalid stable vertex record: '+name);appended.push(values);
     }
     for(const face of part.faces){if(face.length!==3||face.some(i=>!Number.isInteger(i)||i<0||i>=length))throw new Error('Invalid stable triangle: '+name)}
     restoredParts.push({name,mesh:doc.meshes[node.mesh].name,primitive:pi,removedTriangles:counts.get(id),restoredTriangles:part.faces.length,vertices:length});
     // Recipe faces use freshly appended indices; remap only original ones.
     part.faces.forEach(face=>kept.push(...face.map(i=>-(first+i+1))));
    }
    const count=retained.length+appended.length;
    for(const [name,width]of Object.entries(widths)){
     const source=attributes[name],data=Buffer.alloc(count*width*4);
     retained.forEach((old,i)=>source.record(old).copy(data,i*width*4));
     appended.forEach((v,i)=>v[name].forEach((x,c)=>data.writeFloatLE(x,((retained.length+i)*width+c)*4)));
     const accessor={...source.accessor,bufferView:Append(data,34962),byteOffset:0,count};
     if(name==='POSITION'){
      accessor.min=Array(width).fill(Infinity);accessor.max=Array(width).fill(-Infinity);
      for(let i=0;i<count;i++)for(let c=0;c<width;c++){const x=data.readFloatLE((i*width+c)*4);accessor.min[c]=Math.min(accessor.min[c],x);accessor.max[c]=Math.max(accessor.max[c],x)}
     }else{delete accessor.min;delete accessor.max}
     primitive.attributes[name]=doc.accessors.length;doc.accessors.push(accessor);
    }
    const index=kept.map(i=>i<0?-i-1:remap.get(i)),maximum=Math.max(...index),componentType=maximum<=255&&oldIndex.componentType===5121?5121:maximum<=65535&&oldIndex.componentType!==5125?5123:5125,width=componentType===5121?1:componentType===5123?2:4,data=Buffer.alloc(index.length*width);
    index.forEach((x,i)=>{if(x===undefined)throw new Error('Lost original runtime index');width===1?data.writeUInt8(x,i):width===2?data.writeUInt16LE(x,i*2):data.writeUInt32LE(x,i*4)});
    primitive.indices=doc.accessors.length;doc.accessors.push({bufferView:Append(data,34963),componentType,count:index.length,type:'SCALAR',min:[Math.min(...index)],max:[maximum]});
   }
  }
  if(JSON.stringify(restoredParts.map(p=>p.name).sort())!==JSON.stringify(wanted))throw new Error('Missing declared post-export parts');
 }
 // Continue cleanup against the restored attributes and indices.
 const current={json:doc,bin:Buffer.concat(parts)};
 for(const node of doc.nodes||[]){if(['Door_Left','Hood_Right','HoodSide_Left'].includes(node.name)){const expected=node.name==='HoodSide_Left'?[-90,180]:[node.name==='Door_Left'?-78:-100,0];if(JSON.stringify(node.extras?.MotionRangeDegrees)!==JSON.stringify(expected)){node.extras={...node.extras,MotionRangeDegrees:expected};metadataAdjusted++}}}
 for(const [mi,mesh] of doc.meshes.entries())for(const [pi,primitive] of mesh.primitives.entries()){
  if((primitive.mode??4)!==4||primitive.indices===undefined)continue;
  const position=ReadAccessor(current,primitive.attributes.POSITION).data,original=ReadAccessorInt(current,primitive.indices).data,kept=[];let count=0;
  for(let i=0;i<original.length;i+=3){
   const a=original[i]*3,b=original[i+1]*3,c=original[i+2]*3;
   const ux=position[b]-position[a],uy=position[b+1]-position[a+1],uz=position[b+2]-position[a+2],vx=position[c]-position[a],vy=position[c+1]-position[a+1],vz=position[c+2]-position[a+2];
   const area2=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);
   if(area2<1e-12){count++;continue}kept.push(original[i],original[i+1],original[i+2]);
  }
  if(!count)continue;
  const old=doc.accessors[primitive.indices],componentType=old.componentType,Typed=componentType===5125?Uint32Array:componentType===5123?Uint16Array:Uint8Array;
  const typed=Typed.from(kept),data=Buffer.from(typed.buffer),pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad}
  const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target:34963});parts.push(data);offset+=data.length;
  const accessor=doc.accessors.length;let minimum=Infinity,maximum=-Infinity;for(const index of kept){minimum=Math.min(minimum,index);maximum=Math.max(maximum,index)}
  doc.accessors.push({...old,bufferView:view,byteOffset:0,count:kept.length,min:[minimum],max:[maximum]});primitive.indices=accessor;removed+=count;rows.push({mesh:mesh.name||mi,primitive:pi,removedTriangles:count});
 }
 let runtimeTriangles=null;if(runtime){
  runtimeTriangles=doc.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((s,p)=>s+((p.mode??4)===4?(p.indices===undefined?doc.accessors[p.attributes.POSITION].count:doc.accessors[p.indices].count)/3:0),0),0);
  if(runtimeTriangles>80000||!Number.isInteger(runtimeTriangles))throw new Error('Packaged truck exceeds the 80000 triangle limit');
  if(runtime.extras.RuntimeTriangles!==runtimeTriangles){runtime.extras.RuntimeTriangles=runtimeTriangles;metadataAdjusted++}
 }
 if(!removed&&!metadataAdjusted&&!restoredParts.length)return {bytes,removed:0,rows:[],metadataAdjusted:0,restoredParts,runtimeTriangles};
 doc.buffers[0].byteLength=offset;return {bytes:SerializeGlb(doc,Buffer.concat(parts)),removed,rows,metadataAdjusted,restoredParts,runtimeTriangles};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const targets=[path.join(root,'Taierzhuang1938/Model/IsuzuType94Truck/Model_IsuzuType94Truck.glb'),'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IsuzuType94Truck/Exports/Model_IsuzuType94TruckHigh.glb'];
 const report=[];for(const file of targets){if(!fs.existsSync(file))continue;const result=CleanTruckGlb(fs.readFileSync(file));if(result.removed||result.metadataAdjusted||result.restoredParts.length)fs.writeFileSync(file,result.bytes);report.push({file,removed:result.removed,metadataAdjusted:result.metadataAdjusted,rows:result.rows,restoredParts:result.restoredParts,runtimeTriangles:result.runtimeTriangles});}
 const qa=path.join(root,'tmp/IsuzuType94Truck');fs.mkdirSync(qa,{recursive:true});fs.writeFileSync(path.join(qa,'Data_ExportGeometryCleanup.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
