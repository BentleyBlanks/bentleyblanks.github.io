// Independent GLB inspection and CPU skin evaluation. Optional Khronos validator:
// node .../Script_SingleBlanketVerify.mjs --validator=<absolute module dir> --write
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.dirname(projectDir);
const file = path.join(projectDir, 'Model/Model_SingleBlanket.glb');
const raw = fs.readFileSync(file), jsonLength = raw.readUInt32LE(12);
const doc = JSON.parse(raw.subarray(20, 20+jsonLength).toString());
const binary = raw.subarray(28+jsonLength);
const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const bytes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const methods = {5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function Accessor(index) {
  const a=doc.accessors[index], v=doc.bufferViews[a.bufferView], n=components[a.type], size=bytes[a.componentType];
  const offset=(v.byteOffset||0)+(a.byteOffset||0), stride=v.byteStride||n*size;
  const result=[];
  for(let i=0;i<a.count;i++) {
    const row=[];
    for(let k=0;k<n;k++) {
      let value=binary[methods[a.componentType]](offset+i*stride+k*size);
      if(a.normalized && a.componentType!==5126) value/=a.componentType===5121?255:65535;
      row.push(value);
    }
    result.push(row);
  }
  return result;
}
const Identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function Multiply(a,b) {
  const o=Array(16).fill(0);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];
  return o;
}
function Matrix(node,translation,rotation) {
  if(node.matrix && !translation&&!rotation)return [...node.matrix];
  const t=translation||node.translation||[0,0,0],s=node.scale||[1,1,1],q=rotation||node.rotation||[0,0,0,1];
  const [x,y,z,w]=q;
  return [(1-2*(y*y+z*z))*s[0],2*(x*y+w*z)*s[0],2*(x*z-w*y)*s[0],0,
    2*(x*y-w*z)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+w*x)*s[1],0,
    2*(x*z+w*y)*s[2],2*(y*z-w*x)*s[2],(1-2*(x*x+y*y))*s[2],0,...t,1];
}
function Point(m,p) {return [0,1,2].map(r=>m[r]*p[0]+m[r+4]*p[1]+m[r+8]*p[2]+m[r+12]);}
const Distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const parent=Array(doc.nodes.length).fill(-1);
doc.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>{parent[c]=i;}));
const byName=new Map(doc.nodes.map((n,i)=>[n.name,i]));
const meshNode=doc.nodes.findIndex(n=>n.mesh!==undefined);
const primitive=doc.meshes[doc.nodes[meshNode].mesh].primitives[0];
const skin=doc.skins[doc.nodes[meshNode].skin];
const positions=Accessor(primitive.attributes.POSITION), joints=Accessor(primitive.attributes.JOINTS_0),weights=Accessor(primitive.attributes.WEIGHTS_0);
const morph=Accessor(primitive.targets[0].POSITION), ibm=Accessor(skin.inverseBindMatrices);
function State(animation=null,sample=0) {
  const translations=new Map(),rotations=new Map();let morphWeight=0;
  for(const ch of animation?.channels||[]) {
    const sampler=animation.samplers[ch.sampler], values=Accessor(sampler.output);
    const value=values[Math.min(sample,values.length-1)];
    if(ch.target.path==='translation')translations.set(ch.target.node,value);
    if(ch.target.path==='rotation')rotations.set(ch.target.node,value);
    if(ch.target.path==='weights')morphWeight=value[0];
  }
  const world=[];
  function World(i) {
    if(!world[i])world[i]=Multiply(parent[i]<0?Identity():World(parent[i]),Matrix(doc.nodes[i],translations.get(i),rotations.get(i)));
    return world[i];
  }
  doc.nodes.forEach((_,i)=>World(i));
  return {world,morphWeight};
}
function SkinPoints(state,override=null) {
  const matrices=skin.joints.map((node,i)=>Multiply(override?.get(node)||state.world[node],ibm[i]));
  return positions.map((p,i)=>{
    const input=p.map((v,k)=>v+morph[i][k]*state.morphWeight), output=[0,0,0];
    for(let slot=0;slot<4;slot++) {
      const point=Point(matrices[joints[i][slot]],input);
      for(let k=0;k<3;k++)output[k]+=point[k]*weights[i][slot];
    }
    return output;
  });
}
const MaxError=(a,b)=>Math.max(...a.map((p,i)=>Distance(p,b[i])));
const Size=points=>[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k])));
assert.equal(doc.skins.length,1);assert.equal(skin.joints.length,217);assert.equal(ibm.length,217);
assert.equal(doc.meshes.length,1);assert.equal(doc.meshes[0].primitives.length,1);
assert.equal(positions.length,3111);assert.equal(Accessor(primitive.indices).length/3,6000);
// A single welded, connected sheet is needed by the future per-vertex solver.
const triangles=Accessor(primitive.indices).flat();
const edges=new Map(),connected=Array.from({length:positions.length},(_,i)=>i);
function Find(i){while(connected[i]!==i){connected[i]=connected[connected[i]];i=connected[i];}return i;}
let minTriangleArea=Infinity,minEdgeLength=Infinity,maxEdgeLength=0;
for(let i=0;i<triangles.length;i+=3){
  const ids=triangles.slice(i,i+3),a=positions[ids[0]],b=positions[ids[1]],c=positions[ids[2]];
  const areaY=((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]))/2;
  assert.ok(areaY>1e-8,'Non-degenerate, consistently upward triangles');minTriangleArea=Math.min(minTriangleArea,areaY);
  for(let k=0;k<3;k++){
    const p=ids[k],q=ids[(k+1)%3],key=p<q?`${p},${q}`:`${q},${p}`;
    edges.set(key,(edges.get(key)||0)+1);connected[Find(p)]=Find(q);
    const length=Distance(positions[p],positions[q]);minEdgeLength=Math.min(minEdgeLength,length);maxEdgeLength=Math.max(maxEdgeLength,length);
  }
}
assert.equal(new Set(positions.map(p=>p.map(v=>v.toFixed(7)).join(','))).size,positions.length);
assert.equal(new Set(positions.map((_,i)=>Find(i))).size,1);
assert.ok([...edges.values()].every(n=>n===1||n===2));
assert.equal([...edges.values()].filter(n=>n===1).length,220);
assert.equal(positions.length-edges.size+triangles.length/3,1);
assert.ok(minEdgeLength>1.4/50-0.015-1e-6&&maxEdgeLength<0.05);
assert.equal(primitive.targets.length,1);assert.ok(primitive.targets[0].NORMAL!==undefined);
assert.deepEqual(doc.meshes[0].extras.targetNames,['Crumpled']);
assert.ok(primitive.attributes.JOINTS_1===undefined && primitive.attributes.WEIGHTS_1===undefined);
const material=doc.materials[0];
assert.equal(material.name,'Mat_SingleBlanket');assert.equal(material.alphaMode,'MASK');
assert.equal(material.alphaCutoff??0.5,0.5);assert.equal(material.doubleSided,true);
assert.ok(Math.abs(material.normalTexture.scale-0.35)<1e-6);
assert.ok(material.extensions?.KHR_materials_sheen);
assert.ok(material.extensions.KHR_materials_sheen.sheenColorFactor.every(v=>Math.abs(v-0.10)<1e-6));
assert.ok(Math.abs(material.extensions.KHR_materials_sheen.sheenRoughnessFactor-0.90)<1e-6);
assert.equal(doc.images.length,3);assert.ok(doc.images.every(i=>i.bufferView!==undefined&&!i.uri));
assert.ok(!JSON.stringify(doc.extensionsUsed||[]).includes('draco'));
assert.ok(!doc.nodes.some(n=>n.name?.startsWith('Ref_')||n.camera!==undefined));
const root=byName.get('Blanket_Root'), rootJoint=skin.joints.indexOf(root);
assert.ok(rootJoint>=0);assert.equal(doc.nodes.length,223);
for(const node of skin.joints)if(node!==root)assert.equal(parent[node],root);
const x=Array.from({length:12},(_,c)=>0.7-1.4*c/11),y=Array.from({length:18},(_,r)=>-0.95+1.9*r/17);
const BoneName=(r,c)=>({r0c0:'Blanket_CornerHeadL',r0c11:'Blanket_CornerHeadR',r17c0:'Blanket_CornerTailL',r17c11:'Blanket_CornerTailR'}[`r${r}c${c}`]||`Blanket_Grid_r${r}_c${c}`);
function ExpectedWeights(point){
  const px=Math.max(-0.7,Math.min(0.7,point[0])),py=Math.max(-0.95,Math.min(0.95,-point[2]));
  let column=x.slice(1).findIndex(v=>px>=v);if(column<0)column=10;
  const row=Math.max(0,Math.min(16,Math.floor((py+0.95)/(1.9/17)+1e-10)));
  const u=Math.max(0,Math.min(1,(x[column]-px)/(x[column]-x[column+1]))),v=Math.max(0,Math.min(1,(py-y[row])/(1.9/17)));
  return new Map([[BoneName(row,column),(1-u)*(1-v)],[BoneName(row,column+1),u*(1-v)],
    [BoneName(row+1,column),(1-u)*v],[BoneName(row+1,column+1),u*v]]);
}
let sumError=0, rootWeight=0,bilinearWeightMaxError=0;const influenceCounts={};
weights.forEach((row,i)=>{
  assert.equal(row.length,4);const sum=row.reduce((a,b)=>a+b,0);sumError=Math.max(sumError,Math.abs(sum-1));
  const count=row.filter(v=>v>1e-8).length;influenceCounts[count]=(influenceCounts[count]||0)+1;
  assert.ok(count>=1&&count<=4);const expected=ExpectedWeights(positions[i]),actual=new Map();
  row.forEach((w,k)=>{
    if(joints[i][k]===rootJoint)rootWeight=Math.max(rootWeight,w);
    const name=doc.nodes[skin.joints[joints[i][k]]].name;actual.set(name,(actual.get(name)||0)+w);
  });
  for(const name of new Set([...expected.keys(),...actual.keys()]))bilinearWeightMaxError=Math.max(bilinearWeightMaxError,Math.abs((expected.get(name)||0)-(actual.get(name)||0)));
});
assert.ok(sumError<0.001&&rootWeight===0&&bilinearWeightMaxError<1e-7);
const rest=State(), restPoints=SkinPoints(rest), unskinned=positions.map(p=>Point(rest.world[meshNode],p));
const restError=MaxError(restPoints,unskinned);assert.ok(restError<0.0001);
assert.ok(Math.max(...unskinned.map(p=>Math.abs(p[1])))<0.0001);
for(let r=0;r<18;r++)for(let c=0;c<12;c++)assert.ok(Distance(Point(rest.world[byName.get(BoneName(r,c))],[0,0,0]),[x[c],0,-y[r]])<0.0001);
const headL=byName.get('Blanket_CornerHeadL'), liftMatrix=[...rest.world[headL]];liftMatrix[13]+=0.6;
const lifted=SkinPoints(rest,new Map([[headL,liftMatrix]]));
let liftError=0,outsideError=0,affected=0;
lifted.forEach((p,i)=>{
  const weight=weights[i].reduce((sum,w,k)=>sum+(skin.joints[joints[i][k]]===headL?w:0),0);
  const expected=[...restPoints[i]];expected[1]+=weight*0.6;
  liftError=Math.max(liftError,Distance(p,expected));
  if(weight>1e-8)affected++;else outsideError=Math.max(outsideError,Distance(p,restPoints[i]));
});
assert.ok(liftError<1e-6&&outsideError===0);
const expectedNames=['Blanket_Flat','Blanket_DragPose','Blanket_Released','Blanket_Crumpled','Blanket_Unfold'];
assert.deepEqual(doc.animations.map(a=>a.name),expectedNames);
doc.animations.forEach((a,i)=>{
  assert.equal(a.channels.length,433);
  for(const ch of a.channels)assert.ok(ch.target.path==='weights'||(['translation','rotation'].includes(ch.target.path)&&skin.joints.includes(ch.target.node)&&ch.target.node!==root));
  for(const sampler of a.samplers) {
    const times=Accessor(sampler.input).flat();assert.equal(times.length,i===4?45:1);
    assert.ok(Math.abs(times.at(-1)-(i===4?44/30:0))<1e-6);
  }
});
const states=doc.animations.map(a=>State(a));
const flat=SkinPoints(states[0]),crumpled=SkinPoints(states[3]);
const unfolded=SkinPoints(State(doc.animations[4],44)), unfoldStart=SkinPoints(states[4]);
const unfoldStartError=MaxError(crumpled,unfoldStart),unfoldEndError=MaxError(flat,unfolded);
assert.ok(unfoldStartError<1e-6&&unfoldEndError<1e-6);
const crumpledSize=Size(crumpled);assert.ok(Math.max(...crumpledSize.map((v,k)=>Math.abs(v-[0.45,0.25,0.45][k])))<0.0001);
const drag=states[1];
assert.ok(Distance(Point(drag.world[headL],[0,0,0]),[0.55,0.70,1.15])<0.0001);
const gripError=Distance(Point(drag.world[byName.get('Socket_GripHeadL')],[0,0,0]),[0.55,0.70,1.15]);
assert.ok(gripError<0.0001);
const source=JSON.parse(fs.readFileSync(path.join(projectDir,'Model/Data_SingleBlanket.json')));
assert.deepEqual(source.simulationMesh.gridSegments,[50,60]);assert.equal(source.simulationMesh.welded,true);
assert.equal(source.rigTopology.rows,18);assert.equal(source.rigTopology.columns,12);
assert.equal(source.rigTopology.controlBones,216);assert.equal(source.rigTopology.rootBones,1);
assert.equal(source.simulationMesh.cornerPins.length,2);
for(const pin of source.simulationMesh.cornerPins){
  assert.ok(Number.isInteger(pin.vertexGlb)&&pin.vertexGlb>=0&&pin.vertexGlb<positions.length);
  const socket=Point(rest.world[byName.get(pin.socket)],[0,0,0]);
  const offset=pin.restOffsetGltfM;assert.equal(offset.length,3);
  assert.ok(Distance(positions[pin.vertexGlb],socket.map((v,k)=>v+offset[k]))<1e-7);
  assert.ok(Distance(positions[pin.vertexGlb],socket)<0.022);
}
const sha256=crypto.createHash('sha256').update(raw).digest('hex');assert.equal(source.sha256,sha256);
const report={file:'Model/Model_SingleBlanket.glb',sha256,vertices:positions.length,triangles:6000,joints:217,
  topology:{welded:true,connectedComponents:1,boundaryEdges:220,minTriangleAreaM2:minTriangleArea,minEdgeLengthM:minEdgeLength,maxEdgeLengthM:maxEdgeLength},
  bilinearWeightMaxError,
  nonzeroInfluences:influenceCounts,weightSumMaxError:sumError,rootMaxWeight:rootWeight,
  cpuRestMaxDeviationM:restError,cpuLiftInterpolationMaxErrorM:liftError,
  cpuLiftOutsideSupportMaxDeviationM:outsideError,cpuLiftAffectedVertices:affected,
  crumpledSizeGltfM:crumpledSize,unfoldStartMaxErrorM:unfoldStartError,unfoldEndMaxErrorM:unfoldEndError,
  dragGripMaxErrorM:gripError,animations:expectedNames};
const rebuildPaths=['RebuildA','RebuildB'].map(n=>path.join(repoDir,'tmp/SingleBlanket',n,'Model_SingleBlanket.glb'));
if(rebuildPaths.every(p=>fs.existsSync(p))) {
  const hashes=rebuildPaths.map(p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
  hashes.forEach(hash=>assert.equal(hash,sha256));
  report.deterministicHeadlessRebuilds={blender:'5.1.2',runs:2,identical:true,hashes};
}
const validatorArg=process.argv.find(a=>a.startsWith('--validator='))?.slice(12);
const validatorPath=validatorArg||path.join(repoDir,'tmp/SingleBlanket/Validator/node_modules/gltf-validator');
if(fs.existsSync(validatorPath)) {
  const require=createRequire(import.meta.url),validator=require(path.resolve(validatorPath));
  const result=await validator.validateBytes(new Uint8Array(raw),{uri:'Model_SingleBlanket.glb',maxIssues:100});
  report.khronosValidator={errors:result.issues.numErrors,warnings:result.issues.numWarnings,
    infos:result.issues.numInfos,messages:result.issues.messages};assert.equal(result.issues.numErrors,0);
  assert.ok(!result.issues.messages.some(m=>m.code==='ACCESSOR_JOINTS_USED_ZERO_WEIGHT'));
} else {
  console.warn('Khronos validator unavailable; pass --validator=<module directory> to repeat the formal check');
}
if(process.argv.includes('--write')) {
  assert.ok(report.khronosValidator,'A committed audit requires the actual Khronos validator');
  fs.writeFileSync(path.join(projectDir,'_import/Data_SingleBlanketGlbAudit.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
