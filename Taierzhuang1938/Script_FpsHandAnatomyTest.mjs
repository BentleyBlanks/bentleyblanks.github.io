// Check the actual bind-space hand proportions, independently of the baker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from './vendor/three/build/three.module.js';
const asset=process.argv.find(a=>a.startsWith('--asset='))?.slice(8);
const bytes=fs.readFileSync(asset||new URL('./Model/Model_FpsHanYangHands.glb',import.meta.url));
const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),base=28+length;
function Read(index){
 const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];
 const start=base+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||width*size;
 return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>{
  const at=start+i*stride+j*size,n=a.componentType===5126?bytes.readFloatLE(at):a.componentType===5125?bytes.readUInt32LE(at):a.componentType===5123?bytes.readUInt16LE(at):bytes.readUInt8(at);
  return a.normalized?n/(a.componentType===5121?255:65535):n;
 }));
}
// The scanned surface has one hand/wrist/forearm atlas. Keep the original
// material fallback so this probe can also measure historical reference GLBs.
const material=doc.materials.findIndex(m=>m.name==='Material_HanYangScanSkin')>=0
 ?doc.materials.findIndex(m=>m.name==='Material_HanYangScanSkin')
 :doc.materials.findIndex(m=>m.name==='Material_HanYangSkin');
const mesh=doc.meshes.findIndex(m=>m.primitives.some(p=>p.material===material)),primitive=doc.meshes[mesh].primitives.find(p=>p.material===material);
const skin=doc.skins[doc.nodes.find(n=>n.mesh===mesh).skin];
const names=skin.joints.map(i=>doc.nodes[i].name.toLowerCase().replace(/[^a-z0-9]/g,''));
const binds=Read(skin.inverseBindMatrices).map(a=>new THREE.Matrix4().fromArray(a).invert());
const Point=suffix=>new THREE.Vector3().setFromMatrixPosition(binds[names.findIndex(n=>n.endsWith(suffix))]);
const positions=Read(primitive.attributes.POSITION).map(p=>new THREE.Vector3().fromArray(p)),joints=Read(primitive.attributes.JOINTS_0),weights=Read(primitive.attributes.WEIGHTS_0);
const sides={};
for(const side of ['r','l']){
 const wrist=Point(side+'hand'),middle=Point(side+'finger2'),forward=middle.clone().sub(wrist).normalize();
 const across=Point(side+'finger1').sub(Point(side+'finger4')).normalize(),normal=forward.clone().cross(across).normalize();
 const sections=[.03,.06,.09].map(along=>{
  const values=positions.map(p=>p.clone().sub(wrist)).filter(p=>Math.abs(p.dot(forward)-along)<.004&&Math.abs(p.dot(across))<.08);
  assert(values.length>20,'palm section has insufficient vertices');
  const z=values.map(p=>p.dot(normal));return Math.max(...z)-Math.min(...z);
 });
 const fingers=Array.from({length:5},(_,digit)=>{
  const suffix=side+'finger'+digit+'1',bone=names.findIndex(n=>n.endsWith(suffix)),start=Point(suffix),end=Point(side+'finger'+digit+'2'),axis=end.clone().sub(start),segment=axis.length();axis.normalize();
  const radii=[];
  positions.forEach((p,i)=>{
   const owned=weights[i].reduce((sum,w,k)=>sum+(joints[i][k]===bone?w:0),0);if(owned<.8)return;
   const delta=p.clone().sub(start),t=delta.dot(axis)/segment;
   if(t>.2&&t<.8)radii.push(delta.addScaledVector(axis,-t*segment).length());
  });
  assert(radii.length>5,side+' finger '+digit+' has insufficient vertices');
  radii.sort((a,b)=>a-b);return radii[Math.floor((radii.length-1)*.95)];
 });
 sides[side]={palmLengthM:middle.distanceTo(wrist),sections,fingers};
}
const palmRatios=sides.l.sections.map((v,i)=>v/sides.r.sections[i]),fingerRatios=sides.l.fingers.map((v,i)=>v/sides.r.fingers[i]);
assert(palmRatios.every(r=>r>.93&&r<1.07),'asymmetric palm inflation: '+palmRatios);
assert(fingerRatios.every(r=>r>.90&&r<1.10),'asymmetric finger inflation: '+fingerRatios);
assert(Math.abs(sides.l.palmLengthM-sides.r.palmLengthM)<.0001,'bone lengths differ');
console.log(JSON.stringify({sides,palmRatios,fingerRatios}));
console.log('PASS bilateral FPS hand anatomy');
