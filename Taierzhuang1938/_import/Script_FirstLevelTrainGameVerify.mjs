// Compare the production sampler, Actor parent transforms and original hitboxes
// against an independent mixer on the frozen support library.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ServeRoot} from '../Script_DevServer.mjs';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const root=args.includes('--root')?args[args.indexOf('--root')+1]:null;
const out=path.join(project,'_shots/FirstLevelTrainGameV1'),folder=root?path.join(root,'Models/FirstLevelTrainGameV1'):path.join(project,'Animation/FirstLevelTrain');
await fs.mkdir(out,{recursive:true});
const config=JSON.parse(await fs.readFile(path.join(folder,'Data_FirstLevelTrainAnimation.json'),'utf8'));
for(const record of config.models){
 const bytes=await fs.readFile(path.join(folder,record.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sourceAnimationSha256);
 await fs.writeFile(path.join(out,record.file),bytes);
}
await fs.writeFile(path.join(out,'Data_FirstLevelTrainAnimation.json'),JSON.stringify(config));
await fs.writeFile(path.join(out,'_check_Game.html'),`<!doctype html><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script><script type="module">
import * as T from 'three';import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {LugouCharacterRig} from '../../Script_CharacterModel.mjs';import {FirstLevelTrainAnimation} from '../../Script_FirstLevelTrainAnimation.mjs';
window.GameCheck={T,loader:new GLTFLoader(),LugouCharacterRig,FirstLevelTrainAnimation};</script>`);
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser(),results=[],failures=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_shots/FirstLevelTrainGameV1/_check_Game.html`);
 await page.waitForFunction(()=>window.GameCheck);
 const manifest=JSON.parse(await fs.readFile(path.join(project,'Model/Character/Data_LugouCharacterManifest.json'),'utf8'));
 for(const record of config.models){
  const result=await page.evaluate(async({record,config,assetRecord})=>{
   const {T,loader,LugouCharacterRig,FirstLevelTrainAnimation}=GameCheck;
   const gltf=await loader.loadAsync('../../Model/Character/Model_'+record.id+'.glb'),library=await loader.loadAsync('./'+record.file);
   const reference=await loader.loadAsync('../../Model/Character/Model_'+record.id+'.glb');
   const Get=scene=>{const bones=[],meshes=[];scene.traverse(n=>{if(n.isBone)bones.push(n);if(n.isSkinnedMesh)meshes.push(n)});return {bones,meshes}};
   const profiles=[];
   for(const size of [.96,.97,.98,.99,1,1.01,1.02,1.03,1.04]){
    const actor={root:new T.Group(),body:new T.Group()};actor.root.scale.setScalar(size);actor.body.position.y=.85;actor.root.add(actor.body);
    actor.root.position.set(7,1.17,11);actor.root.rotation.y=Math.PI/2;
    const rig=new LugouCharacterRig({record:assetRecord,gltf},{kind:'nra',targetHeight:1.66,seed:'TrainVerify',variantIndex:0});rig.Attach(actor);
    const sampler=new FirstLevelTrainAnimation(rig,library,record,config),actual=Get(rig.root),expected=Get(reference.scene);
    const offset=sampler.SeatOffset(),seat=actor.root.position.clone();
    actor.root.position.add(new T.Vector3(offset.x,0,offset.z).applyQuaternion(actor.root.quaternion));
    reference.scene.scale.setScalar(record.nominalScale*size);reference.scene.rotation.y=Math.PI;
    const base=new T.Group();base.position.copy(seat);base.rotation.copy(actor.root.rotation);base.add(reference.scene);
    // The seat lies .24/.28 metres behind the frozen library origin.
    reference.scene.position.z=-record.seatForwardOffsetM;
    const mixer=new T.AnimationMixer(reference.scene),knots=config.profiles,hi=knots.find(k=>k>size)||knots.at(-1),lo=knots[knots.indexOf(hi)-1],w=(size-lo)/(hi-lo);
    const actions=[lo,hi].map((s,i)=>{const a=mixer.clipAction(library.animations.find(c=>c.name===config.clipPrefix+Math.round(s*100))).reset().setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.setEffectiveWeight(i?w:1-w);a.play();a.paused=true;return a});
    const bindBefore=JSON.stringify(actual.meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)));
    const rootBefore=JSON.stringify([actor.root.position.toArray(),actor.root.quaternion.toArray(),actor.root.scale.toArray()]);
    let maxBoneError=0,maxVertexError=0,maxRestoreError=0,maxHitboxError=0,minSole=Infinity,maxPenetrating=0,maxSeatGap=-Infinity,minSeatGap=Infinity,maxFinalPelvisOffset=0;
    for(const time of [0,.125,2,4,4.5,5.208333333333,5.5,5.7,7,478/60]){
     sampler.Restore();rig.Update(0,{reach:1});rig.currentAction.time=rig.currentAction.getClip().duration*.25;rig.mixer.update(0);
     const baseline=actual.bones.map(b=>[b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]);
     const rootBaseline=[rig.root.position.toArray(),rig.root.quaternion.toArray(),rig.root.scale.toArray()];
     sampler.Sample(time);
     for(const a of actions)a.time=time;mixer.update(0);base.updateMatrixWorld(true);actor.root.updateMatrixWorld(true);
     for(let i=0;i<actual.bones.length;i++)for(let j=0;j<16;j++)maxBoneError=Math.max(maxBoneError,Math.abs(actual.bones[i].matrixWorld.elements[j]-expected.bones[i].matrixWorld.elements[j]));
     let penetrating=0,seatGap=Infinity;
     for(let i=0;i<actual.meshes.length;i++){
      const mesh=actual.meshes[i];for(let j=0;j<mesh.geometry.attributes.position.count;j++){
       const a=mesh.getVertexPosition(j,new T.Vector3()).applyMatrix4(mesh.matrixWorld),b=expected.meshes[i].getVertexPosition(j,new T.Vector3()).applyMatrix4(expected.meshes[i].matrixWorld);
       maxVertexError=Math.max(maxVertexError,a.distanceTo(b));
       const p=base.worldToLocal(a);minSole=Math.min(minSole,p.y);
       if(Math.abs(p.x)<.6&&Math.abs(p.z)<.34){if(p.y>.34&&p.y<.48)penetrating++;if(time<=4.5)seatGap=Math.min(seatGap,p.y-.48)}
      }
     }
     maxPenetrating=Math.max(maxPenetrating,penetrating);if(time<=4.5){minSeatGap=Math.min(minSeatGap,seatGap);maxSeatGap=Math.max(maxSeatGap,seatGap)}
     for(const shape of rig.GetHitboxes()){
      if(shape.type==='capsule'){
       maxHitboxError=Math.max(maxHitboxError,shape.start.distanceTo(rig.hitboxNodes[shape.a].getWorldPosition(new T.Vector3())),shape.end.distanceTo(rig.hitboxNodes[shape.b].getWorldPosition(new T.Vector3())));
      }else maxHitboxError=Math.max(maxHitboxError,shape.center.distanceTo(rig.hitboxNodes[shape.role].getWorldPosition(new T.Vector3())));
     }
     if(time===478/60){const p=actor.root.worldToLocal(rig.bones.pelvis.getWorldPosition(new T.Vector3()));maxFinalPelvisOffset=Math.hypot(p.x,p.z)*size}
     sampler.Restore();
     const after=actual.bones.map(b=>[b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()]);
     const flat=x=>x.flat(Infinity);maxRestoreError=Math.max(maxRestoreError,...flat(after).map((v,i)=>Math.abs(v-flat(baseline)[i])),...flat([rig.root.position.toArray(),rig.root.quaternion.toArray(),rig.root.scale.toArray()]).map((v,i)=>Math.abs(v-flat(rootBaseline)[i])));
    }
    const bindingUnchanged=bindBefore===JSON.stringify(actual.meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)));
    const rootUnchanged=rootBefore===JSON.stringify([actor.root.position.toArray(),actor.root.quaternion.toArray(),actor.root.scale.toArray()]);
    profiles.push({size,maxBoneError,maxVertexError,maxRestoreError,maxHitboxError,minSole,maxPenetrating,minSeatGap,maxSeatGap,maxFinalPelvisOffset,bindingUnchanged,rootUnchanged,offset});
   }
   return {id:record.id,sourceAnimationSha256:record.sourceAnimationSha256,profiles};
  },{record,config,assetRecord:manifest.models.find(m=>m.id===record.id)});
  results.push(result);
  for(const p of result.profiles)if(!(p.maxBoneError<1e-5&&p.maxVertexError<1e-5&&p.maxRestoreError===0&&p.maxHitboxError===0&&p.minSole>0&&p.maxPenetrating===0&&p.minSeatGap>=0&&p.maxSeatGap<.005&&p.maxFinalPelvisOffset<.025&&p.bindingUnchanged&&p.rootUnchanged))failures.push({id:record.id,...p});
  console.log(JSON.stringify({id:result.id,profiles:result.profiles.length,failures:failures.filter(f=>f.id===result.id)}));
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root?folder:out,'Data_SamplerValidation.json'),JSON.stringify({status:failures.length?'needs_correction':'sampler_matches_frozen_library_on_production_rig',results,failures,errors},null,2));
 assert.deepEqual(failures,[]);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
