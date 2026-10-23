// Test the delivered bytes independently: physical envelope, live hinges, UV/PBR and finite geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {LoadGlb,ReadAccessor,ReadAccessorInt} from './_import/Script_LugouGlbPose.mjs';
const dir=path.join(import.meta.dirname,'Model/NakajimaKi4');
const glb=LoadGlb(path.join(dir,'Model_NakajimaKi4.glb')),g=glb.json;
const contract=JSON.parse(fs.readFileSync(path.join(dir,'Data_ReferenceContract.json'),'utf8'));
const audit=JSON.parse(fs.readFileSync(path.join(dir,'Data_ExportAudit.json'),'utf8'));
assert.equal(crypto.createHash('sha256').update(glb.buffer).digest('hex'),audit.runtime.sha256,'delivered bytes retain their reviewed identity');
for(const [name,expected]of Object.entries(audit.scripts)){const source=fs.readFileSync(path.join(import.meta.dirname,'_blender',name),'utf8').replace(/\r\n/g,'\n');assert.equal(crypto.createHash('sha256').update(source).digest('hex'),expected,name+' retains its reviewed LF-normalized source identity');}
const Id=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function Multiply(a,b){const o=Array(16).fill(0);for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function Matrix(n){if(n.matrix)return n.matrix;const[x,y,z,w]=n.rotation??[0,0,0,1],sx=n.scale?.[0]??1,sy=n.scale?.[1]??1,sz=n.scale?.[2]??1;const t=n.translation??[0,0,0];return[(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,...t,1];}
function Transform(m,p){return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
const world=new Map(),parents=new Map(),points=[];
function Visit(i,m){const n=g.nodes[i],w=Multiply(m,Matrix(n));world.set(i,w);if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){const a=ReadAccessor(glb,p.attributes.POSITION).data;for(let k=0;k<a.length;k+=3)points.push(Transform(w,a.subarray(k,k+3)));}for(const c of n.children??[]){parents.set(c,i);Visit(c,w);}}
for(const i of g.scenes[g.scene??0].nodes)Visit(i,Id);
const min=[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),max=[0,1,2].map(a=>Math.max(...points.map(p=>p[a]))),dimensions=max.map((x,i)=>x-min[i]);
assert.ok(Math.abs(dimensions[0]-12)<.002,'12m upper span, measured from actual world vertices');
assert.ok(Math.abs(dimensions[1]-3.31)<.04,'manual approximate 3.31m height');
assert.ok(Math.abs(dimensions[2]-8.25)<.05,'manual approximate 8.25m length');
const Required=contract.requiredPivots;
for(const name of Required){const i=g.nodes.findIndex(n=>n.name===name);assert.ok(i>=0,name);assert.ok(g.nodes[i].children?.length>0,name+' retains geometry');assert.deepEqual(g.nodes[i].scale??[1,1,1],[1,1,1],name+' has no nonuniform scaling');assert.ok(g.nodes[i].extras?.hingeAxis,name+' declares exported local hinge axis');}
function Hinge(name){const i=g.nodes.findIndex(n=>n.name===name);return{node:g.nodes[i],position:Transform(world.get(i),[0,0,0])};}
const prop=Hinge('Pivot_Propeller'),rudder=Hinge('Pivot_Rudder');
assert.ok(prop.position[2]<rudder.position[2]-7,'nose geometry and propeller are at glTF -Z');
const left=Hinge('Pivot_WheelLeft'),right=Hinge('Pivot_WheelRight');
assert.ok(Math.abs(right.position[0]-left.position[0]-2.25)<.0001,'manual 2.25m wheel center track');
assert.equal(left.node.extras.rollingRadiusM,.43);assert.equal(right.node.extras.rollingRadiusM,.43);
assert.equal(prop.node.extras.hingeAxis,'-Z');assert.equal(rudder.node.extras.hingeAxis,'Y');
let triangles=0,vertices=0;
for(const mesh of g.meshes)for(const p of mesh.primitives){
 assert.ok(p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined,'exported shading normals and UVs');
 const pos=ReadAccessor(glb,p.attributes.POSITION).data,n=ReadAccessor(glb,p.attributes.NORMAL).data,uv=ReadAccessor(glb,p.attributes.TEXCOORD_0).data,idx=ReadAccessorInt(glb,p.indices).data;
 assert.equal(pos.length,n.length);assert.equal(uv.length,pos.length/3*2);assert.equal(idx.length%3,0);
 for(const a of [pos,n,uv])for(const v of a)assert.ok(Number.isFinite(v),'finite exported attribute');
 for(let i=0;i<n.length;i+=3)assert.ok(Math.abs(Math.hypot(n[i],n[i+1],n[i+2])-1)<.001,'unit shading normals');
 for(let i=0;i<idx.length;i+=3){const [a,b,c]=idx.subarray(i,i+3);assert.ok(Math.max(a,b,c)<pos.length/3);const u=[0,1,2].map(k=>pos[b*3+k]-pos[a*3+k]),v=[0,1,2].map(k=>pos[c*3+k]-pos[a*3+k]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-12,'no collapsed delivered triangles');}
 triangles+=idx.length/3;vertices+=pos.length/3;
}
assert.ok(triangles<=115000,'independent game derivative stays in the reviewed 115k ceiling');
assert.equal(triangles,audit.runtime.triangles);assert.equal(g.meshes.length,audit.runtime.meshes);
assert.ok(g.meshes.length<=40,'static merging preserves efficient rendering without merging hinges');
assert.equal(g.images.length,24,'eight full Base/Normal/ORM sets');
for(const image of g.images){assert.ok(image.bufferView!==undefined,'self-contained GLB');assert.ok(['image/png','image/webp'].includes(image.mimeType));}
for(const m of g.materials){if(/Shadow|InstrumentFaces|Windscreen/.test(m.name))continue;assert.ok(m.pbrMetallicRoughness.baseColorTexture,m.name+' Base');assert.ok(m.normalTexture,m.name+' Normal');assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture,m.name+' MR');assert.ok(m.occlusionTexture,m.name+' AO');assert.equal(m.occlusionTexture.index,m.pbrMetallicRoughness.metallicRoughnessTexture.index,m.name+' consistent ORM packing');}
assert.ok(!g.animations?.length,'author node controls are explicit; no accidental baked whole-model animation');
console.log(JSON.stringify({ok:true,triangles,vertices,meshes:g.meshes.length,images:g.images.length,dimensionsM:dimensions,pivots:Required.length}));
