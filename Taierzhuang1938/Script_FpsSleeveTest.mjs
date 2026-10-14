// Close-up sleeve gate: physical cuff envelope, preserved fixed rig, actual
// first-person material profile, and repeatable high-quality review images.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from './vendor/three/build/three.module.js';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(project,'_shots','FpsSleeves');await fs.mkdir(out,{recursive:true});
const bytes=await fs.readFile(path.join(project,'Model/Model_FpsHanYangHands.glb'));
const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),bin=28+jsonLength;
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},sizes={5121:1,5123:2,5125:4,5126:4};
function Read(index){
 const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],width=widths[a.type],size=sizes[a.componentType],start=bin+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*width;
 return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>{
  const offset=start+i*stride+j*size;
  const n=a.componentType===5126?bytes.readFloatLE(offset):a.componentType===5125?bytes.readUInt32LE(offset):a.componentType===5123?bytes.readUInt16LE(offset):bytes.readUInt8(offset);
  return a.normalized?n/(a.componentType===5121?255:65535):n;
 }));
}
const material=doc.materials.findIndex(m=>m.name==='Material #1721585337');
const meshIndex=doc.meshes.findIndex(m=>m.primitives.some(p=>p.material===material));
const primitive=doc.meshes[meshIndex].primitives.find(p=>p.material===material);
const node=doc.nodes.find(n=>n.mesh===meshIndex),skin=doc.skins[node.skin];
const boneNames=skin.joints.map(i=>doc.nodes[i].name.toLowerCase().replace(/[^a-z0-9]/g,''));
const bind=Read(skin.inverseBindMatrices).map(a=>new THREE.Matrix4().fromArray(a).invert());
const positions=Read(primitive.attributes.POSITION),joints=Read(primitive.attributes.JOINTS_0),weights=Read(primitive.attributes.WEIGHTS_0);
const measurements=[];
for(const side of ['r','l']){
 const wrist=new THREE.Vector3().setFromMatrixPosition(bind[boneNames.findIndex(n=>n.endsWith(side+'hand'))]);
 const elbow=new THREE.Vector3().setFromMatrixPosition(bind[boneNames.findIndex(n=>n.endsWith(side+'forearm'))]);
 const axis=wrist.clone().sub(elbow).normalize(),radii=[];let edge=-Infinity;
 for(let i=0;i<positions.length;i++){
  const owned=weights[i].reduce((sum,w,k)=>sum+(boneNames[joints[i][k]].endsWith(side+'forearm')||boneNames[joints[i][k]].endsWith(side+'hand')?w:0),0);
  if(owned<.5)continue;
  const delta=new THREE.Vector3().fromArray(positions[i]).sub(wrist),along=delta.dot(axis);
  edge=Math.max(edge,along);if(along>-.13)radii.push(delta.addScaledVector(axis,-along).length());
 }
 radii.sort((a,b)=>a-b);const radius95=radii[Math.floor((radii.length-1)*.95)];
 assert(edge<-.03,`${side}: sleeve covers the wrist hinge`);
 // Runtime arm scale is 0.7: this caps the loose outer cuff at 12 cm diameter.
 assert(radius95<.085,`${side}: inflated cuff radius ${radius95}`);
 measurements.push({side,cuffEdgeM:edge,radius95M:radius95});
}
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=high&scale=small`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
 await page.evaluate(()=>{Taierzhuang.Debug.OpenEditor('firstPerson');Taierzhuang.editor.active.SetAnimationClean(true);});
 const materials=[];
 for(const id of ['Grenade','GrenadeBundle','Dadao','Zb26']){
  const report=await page.evaluate(id=>{
   const T=Taierzhuang,e=T.editor.active;e.SetWeapon(id);e.SetPose('hip');e.SetView('player');e.SetAnimationClean(true);
   for(let i=0;i<90;i++)e.Update(1/60);T.StepFrames(1);
   const r=T.viewmodel.riggedArms,cloth=[],skin=[];
   r.root.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material)){
    if(m.userData.nraUniformDetailProfile)cloth.push({name:m.name,profile:m.userData.nraUniformDetailProfile,normal:m.normalScale?.toArray()});
    if(m.userData.characterSurface?.role==='skin')skin.push({name:m.name,profile:m.userData.characterSkinDetailProfile,roughness:m.roughness});
   }});
   return {id,fixed:r.fixedRestLengths,grip:{...r.gripError},cloth,skin};
  },id);
  assert(report.fixed&&Math.max(...Object.values(report.grip))<.006,`${id}: changing the sleeve disturbed grip/bone length`);
  assert(report.cloth.length&&report.cloth.every(m=>m.profile==='firstPerson'&&Math.abs(Math.abs(m.normal[0])-.28)<1e-6),`${id}: FPS material profile is missing`);
  assert(report.skin.length&&report.skin.every(m=>m.profile==='firstPerson'&&Math.abs(m.roughness-.62)<1e-6),`${id}: close-up skin profile is missing`);
  materials.push(report);
  await page.screenshot({path:path.join(out,`Image_${id}_Player.png`)});
  await page.evaluate(()=>{const e=Taierzhuang.editor.active;e.SetView('inspect');e.SetInspectPreset('rightRear');Taierzhuang.StepFrames(1);});
  await page.screenshot({path:path.join(out,`Image_${id}_Inspect.png`)});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_FpsSleeveAcceptance.json'),JSON.stringify({measurements,materials},null,2));
 console.log(JSON.stringify({measurements,materials}));console.log('PASS tailored FPS sleeves and close-up cloth profile');
}finally{await browser.close();await new Promise(r=>server.close(r));}
