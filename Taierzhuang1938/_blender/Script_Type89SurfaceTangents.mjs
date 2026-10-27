// Retain the input tangent frame through a material-only surface export.
// Blender can round a few recalculated High tangents differently on reopen.
// Match exact position/normal/UV/role keys and restore the original bytes;
// the separate complete corner audit still requires exact final equality.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LoadGlb,ReadAccessor} from '../_import/Script_LugouGlbPose.mjs';

const Read=n=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
const baselineFile=Read('baseline'),targetFile=Read('file'),reportFile=Read('report');
assert.ok(baselineFile&&targetFile&&reportFile,'Supply --baseline, --file and --report');
assert.notEqual(path.resolve(baselineFile),path.resolve(targetFile));
await fs.mkdir(path.dirname(path.resolve(reportFile)),{recursive:true});
const source=LoadGlb(baselineFile),target=LoadGlb(targetFile);
const Sha=b=>createHash('sha256').update(b).digest('hex');
const Role=name=>name.replace('CastArmor','Armor');
function Attributes(g,p){return Object.fromEntries(['POSITION','NORMAL','TEXCOORD_0','TANGENT'].map(k=>{assert.ok(p.attributes[k]!==undefined,k);return[k,ReadAccessor(g,p.attributes[k])];}));}
function Key(role,attrs,i){return JSON.stringify([role,...['POSITION','NORMAL','TEXCOORD_0'].flatMap(k=>[...attrs[k].data.subarray(i*attrs[k].width,(i+1)*attrs[k].width)])]);}
const baselineNodes=new Map(source.json.nodes.map(n=>[n.name,n]));
const done=new Set(),rows=[];let restoredVertices=0,maximumDifference=0;
const binStart=target.bin.byteOffset-target.buffer.byteOffset;
assert.ok(binStart>=0);
for(const node of target.json.nodes){
 if(node.mesh===undefined||done.has(node.mesh))continue;done.add(node.mesh);
 const original=baselineNodes.get(node.name);assert.ok(original?.mesh!==undefined,'Missing baseline mesh node:'+node.name);
 for(const key of ['translation','rotation','scale','matrix'])assert.deepEqual(node[key],original[key],node.name+' '+key);
 const frames=new Map();
 for(const p of source.json.meshes[original.mesh].primitives){
  const a=Attributes(source,p),role=Role(source.json.materials[p.material].name);
  for(let i=0;i<a.POSITION.count;i++){
   const key=Key(role,a,i),v=[...a.TANGENT.data.subarray(i*4,i*4+4)];
   if(!frames.has(key))frames.set(key,new Map());frames.get(key).set(JSON.stringify(v),v);
  }
 }
 let changed=0;
 for(const p of target.json.meshes[node.mesh].primitives){
  const a=Attributes(target,p),role=Role(target.json.materials[p.material].name),accessor=target.json.accessors[p.attributes.TANGENT],view=target.json.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC4');
  for(let i=0;i<a.POSITION.count;i++){
   const candidates=frames.get(Key(role,a,i));assert.ok(candidates,'Position/normal/UV/role changed:'+node.name);
   const current=[...a.TANGENT.data.subarray(i*4,i*4+4)];if(candidates.has(JSON.stringify(current)))continue;
   // A newly split seam may duplicate an original corner. Ambiguous frames
   // cannot be guessed; fail before writing the output.
   assert.equal(candidates.size,1,'Ambiguous original tangent:'+node.name);
   const wanted=[...candidates.values()][0],difference=Math.max(...current.map((v,k)=>Math.abs(v-wanted[k])));
   assert.ok(difference<=.00011,'Unexpected tangent change:'+difference);maximumDifference=Math.max(maximumDifference,difference);
   const offset=binStart+(view.byteOffset??0)+(accessor.byteOffset??0)+i*(view.byteStride??16);
   for(let k=0;k<4;k++)target.buffer.writeFloatLE(wanted[k],offset+k*4);changed++;restoredVertices++;
  }
 }
 if(changed)rows.push({node:node.name,restoredVertices:changed});
}
const beforeSha256=Sha(await fs.readFile(targetFile));
if(restoredVertices)await fs.writeFile(targetFile,target.buffer);
const report={pass:true,scope:'Only exact input tangent frames restored; no relaxed final corner comparison',baselineFile,baselineSha256:Sha(source.buffer),beforeSha256,afterSha256:Sha(target.buffer),restoredVertices,maximumDifference,rows};
await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
