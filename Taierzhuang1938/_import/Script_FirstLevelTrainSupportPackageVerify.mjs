// Load the complete review package independently and compare it with the
// original production skin plus the separately verified animation library.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(project),args=process.argv.slice(2);
const root=args[args.indexOf('--root')+1],group=args[args.indexOf('--group')+1];
assert.ok(args.includes('--root')&&root);assert.match(group,/^FirstLevelTrainSupportV[1-9]\d*$/);
const out=path.join(root,'Models',group),output=path.join(project,'_shots',group);
await fs.mkdir(output,{recursive:true});
const Read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const bake=await Read(path.join(out,'Data_SupportBakeValidation.json'));
const projects=await Read(path.join(out,'Data_EditableProjects.json'));
const skin=await Read(path.join(out,'Data_ProductionSkinValidation.json'));
assert.deepEqual(skin.failures,[],'Numerical support must pass before package comparison');
for(const record of projects.results)for(const [key,hash] of [['model','modelSha256'],['animation','animationSha256']]){
 const bytes=await fs.readFile(path.join(root,record[key]));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record[hash]);
 await fs.writeFile(path.join(output,path.basename(record[key])),bytes);
}
await fs.writeFile(path.join(output,'_check_Package.html'),`<!doctype html><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script><script type="module">
import * as THREE from 'three';import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';window.PackageCheck={THREE,loader:new GLTFLoader()};</script>`);
const server=await ServeRoot(repo,0),browser=await LaunchBrowser(),errors=[],results=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_shots/${group}/_check_Package.html`);await page.waitForFunction(()=>window.PackageCheck);
 for(const model of bake.results){
  const record=projects.results.find(r=>r.id===model.id),verified=skin.results.find(r=>r.id===model.id);
  assert.equal(record.animationSha256,model.animationSha256);assert.equal(verified.animationSha256,model.animationSha256);
  const data=await page.evaluate(async model=>{
   const {THREE:T,loader}=PackageCheck;
   const [original,library,complete]=await Promise.all([loader.loadAsync('../../Model/Character/Model_'+model.id+'.glb'),
    loader.loadAsync('./Animation_'+model.id+'FirstLevelTrainSupport.glb'),loader.loadAsync('./Model_'+model.id+'TrainSupport.glb')]);
   const Get=scene=>{const bones=[],meshes=[];scene.traverse(o=>{if(o.isBone)bones.push(o);if(o.isSkinnedMesh)meshes.push(o)});return {bones,meshes}};
   const a=Get(original.scene),b=Get(complete.scene),mixers=[new T.AnimationMixer(original.scene),new T.AnimationMixer(complete.scene)];
   const boneNamesEqual=JSON.stringify(a.bones.map(o=>o.name))===JSON.stringify(b.bones.map(o=>o.name));
   if(!boneNamesEqual||a.meshes.length!==b.meshes.length)throw Error('Packaged rig topology');
   const bindingsEqual=JSON.stringify(a.meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)))===JSON.stringify(b.meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)));
   const anchor=complete.scene.getObjectByName('Transform_ActualGameScale');if(!anchor)throw Error('Missing explicit model scale');
   original.scene.rotation.y=complete.scene.rotation.y=Math.PI;
   let maxBoneMatrixError=0,maxVertexError=0;const samples=[];
   const knots=[.96,.98,1,1.02,1.04];
   for(const size of [.96,.97,.98,.99,1,1.01,1.02,1.03,1.04]){
    original.scene.scale.setScalar(model.nominalScale*size);anchor.scale.setScalar(model.nominalScale*size);
    for(const time of [0,.125,2,4.5,5.208333333333,5.5,5.7,7,478/60]){
     const hi=knots.find(k=>k>size)||1.04,lo=knots[knots.indexOf(hi)-1],w=(size-lo)/(hi-lo);
     for(let i=0;i<2;i++){
      const mixer=mixers[i],clips=i?complete.animations:library.animations;mixer.stopAllAction();
      for(const [n,k] of [lo,hi].entries()){
       const clip=clips.find(c=>c.name==='FirstLevelTrainBench'+Math.round(k*100));if(!clip)throw Error('Missing packaged height clip');
       const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.setEffectiveWeight(n?w:1-w);action.play();action.time=time;action.paused=true;
      }mixer.update(0);
     }
     original.scene.updateMatrixWorld(true);complete.scene.updateMatrixWorld(true);
     for(let i=0;i<a.bones.length;i++)for(let j=0;j<16;j++)maxBoneMatrixError=Math.max(maxBoneMatrixError,Math.abs(a.bones[i].matrixWorld.elements[j]-b.bones[i].matrixWorld.elements[j]));
     for(let i=0;i<a.meshes.length;i++){
      const x=a.meshes[i],y=b.meshes[i];if(x.geometry.attributes.position.count!==y.geometry.attributes.position.count)throw Error('Packaged skin count');
      for(let vertex=0;vertex<x.geometry.attributes.position.count;vertex++){
       const p=x.getVertexPosition(vertex,new T.Vector3()).applyMatrix4(x.matrixWorld),q=y.getVertexPosition(vertex,new T.Vector3()).applyMatrix4(y.matrixWorld);
       maxVertexError=Math.max(maxVertexError,p.distanceTo(q));
      }
     }samples.push({size,time});
    }
   }
   const seat=new T.Box3().setFromObject(complete.scene.getObjectByName('Prop_TrainBenchSeat')),size=seat.getSize(new T.Vector3()),center=seat.getCenter(new T.Vector3());
   return {bindingsEqual,boneNamesEqual,maxBoneMatrixError,maxVertexError,samples,seat:{size:size.toArray(),center:center.toArray()}};
  },model);
  assert.ok(data.bindingsEqual&&data.boneNamesEqual&&data.maxBoneMatrixError<1e-7&&data.maxVertexError<1e-7,model.id+' original skin/library equality');
  for(const [i,v] of [1.2,.14,.68].entries())assert.ok(Math.abs(data.seat.size[i]-v)<1e-7);
  assert.ok(Math.abs(data.seat.center[1]-.41)<1e-7&&Math.abs(data.seat.center[2]-model.seatForwardOffsetM)<1e-7);
  results.push({id:model.id,modelSha256:record.modelSha256,animationSha256:model.animationSha256,...data});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_PackageValidation.json'),JSON.stringify({status:'complete_package_matches_verified_original_skin_and_library',results,errors},null,2));
 console.log(JSON.stringify(results.map(({samples,...r})=>({...r,samples:samples.length}))));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
