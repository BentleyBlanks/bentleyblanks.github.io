// Offline reference test: requires the original local melee asset library.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
assert.ok(root&&root!=='--root','--root required');
const recipes=JSON.parse(await fs.readFile(path.join(root,'Models/MeleeVideoV2/Data_Recipes.json'),'utf8'));
const server=await ServeRoot(fileURLToPath(new URL('../../',import.meta.url)),0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage();
 await page.route('**/__fidelity/*.glb',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);await route.fulfill({contentType:'model/gltf-binary',body:await fs.readFile(path.join(root,'Models/MeleeVideoV2',name))})});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?melee=1&shot=1&manual=1&quality=medium&scale=small`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state.ready,null,{timeout:120000});
 const report=await page.evaluate(async recipes=>{
  const THREE=await import('three'),{GLTFLoader}=await import('./vendor/three/examples/jsm/loaders/GLTFLoader.js'),{MeleeAnimationPlayer}=await import('./Script_MeleeAnimation.mjs');
  const loader=new GLTFLoader(),results=[];
  for(const [name,cfg] of Object.entries(recipes))for(const faction of ['Nra','Ija']){
   const url=`/__fidelity/Animation_${faction}_${name}_V2.glb`,reference=await loader.loadAsync(url),target=await loader.loadAsync(url);
   target.scene.updateMatrixWorld(true);target.scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.pose()});target.scene.updateMatrixWorld(true);
   const driver=new MeleeAnimationPlayer(target.scene,faction==='Ija'?'ija':'nra');
   const nativeScale=driver.bones.find(r=>r.part==='Pelvis').position.y/driver.data.clips[name].recoveredPose.bindPelvisHeight;
   const mixer=new THREE.AnimationMixer(reference.scene),action=mixer.clipAction(reference.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
   const expected={};reference.scene.traverse(b=>{if(b.isBone)expected[b.name]=b});
   const found={};target.scene.traverse(b=>{if(b.isBone)found[b.name]=b});
   const sourceProp=reference.scene.getObjectByName('Model_'+faction+'MeleeVideo'+cfg.weapon);
   if(!sourceProp)throw new Error('Missing exported prop '+name);
   const samples=[];
   for(let frame=0;frame<=120;frame++){
    const phase=frame/120,k=cfg.runtimeTimeKnots;let segment=k.findIndex((t,i)=>i>0&&phase<=t);if(segment<0)segment=k.length-1;
    const i=segment-1,mix=(phase-k[i])/(k[i+1]-k[i]),sourceFrame=cfg.sourceFrameKnots[i]*(1-mix)+cfg.sourceFrameKnots[i+1]*mix;
    mixer.setTime(Math.min((sourceFrame-cfg.range[0])/30,reference.animations[0].duration-.000001));reference.scene.updateMatrixWorld(true);
    driver.Restore();driver.Apply({clip:name,normalized:phase,weapon:cfg.weapon});target.scene.updateMatrixWorld(true);
    const errors=Object.keys(found).filter(n=>/ (Hand|Forearm|UpperArm)$/.test(n.replaceAll('_',' '))).map(n=>{const a=found[n].getWorldPosition(new THREE.Vector3()).divideScalar(nativeScale),b=expected[n].getWorldPosition(new THREE.Vector3());return{bone:n,error:a.distanceTo(b),actual:a.toArray(),expected:b.toArray()}});
    const rotations=Object.keys(found).filter(n=>/ [LR] Hand$/.test(n.replaceAll('_',' '))).map(n=>({bone:n,error:found[n].getWorldQuaternion(new THREE.Quaternion()).angleTo(expected[n].getWorldQuaternion(new THREE.Quaternion()))}));
    const propPosition=driver.prop.getWorldPosition(new THREE.Vector3()).divideScalar(nativeScale).distanceTo(sourceProp.getWorldPosition(new THREE.Vector3()));
    const propQuaternion=driver.prop.getWorldQuaternion(new THREE.Quaternion());
    if(cfg.weapon==='Dadao')propQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2));
    // glTF converts Blender-local mesh vertices to Y-up. The game's TZM
    // geometry retains its authored local axes, so include that vertex basis.
    const sourcePropQuaternion=sourceProp.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
    const propRotation=propQuaternion.normalize().angleTo(sourcePropQuaternion.normalize());
    const allBones=driver.allBones.map(({bone})=>({bone:bone.name,position:bone.getWorldPosition(new THREE.Vector3()).divideScalar(nativeScale).distanceTo(expected[bone.name].getWorldPosition(new THREE.Vector3())),rotation:bone.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(expected[bone.name].getWorldQuaternion(new THREE.Quaternion()).normalize())}));
    samples.push({phase,sourceFrame,errors,rotations,propPosition,propRotation,allBones});
   }
   const maximum=Math.max(...samples.flatMap(s=>s.errors.map(e=>e.error)));
   results.push({name,faction,nativeScale,maxArmError:maximum,maxBonePosition:Math.max(...samples.flatMap(s=>s.allBones.map(b=>b.position))),maxBoneRotation:Math.max(...samples.flatMap(s=>s.allBones.map(b=>b.rotation))),maxWristRotation:Math.max(...samples.flatMap(s=>s.rotations.map(r=>r.error))),maxPropPosition:Math.max(...samples.map(s=>s.propPosition)),maxPropRotation:Math.max(...samples.map(s=>s.propRotation)),samples});
   for(const loaded of [reference,target])loaded.scene.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))m.dispose()});
  }
  return{results};
 },recipes);
 report.status=report.results.every(r=>r.maxBonePosition<.002&&r.maxBoneRotation<.5*Math.PI/180&&r.maxArmError<.002&&r.maxWristRotation<.5*Math.PI/180&&r.maxPropPosition<.002&&r.maxPropRotation<.5*Math.PI/180)?'passed':'failed';
 await fs.writeFile(path.join(root,'Preview/MeleeFidelityV2/Data_RuntimeFidelity.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.results.map(r=>({...r,samples:undefined}))));
 assert.equal(report.status,'passed','Runtime body, fingers, wrists and prop must match reviewed GLBs after native height normalization');
}finally{await browser.close();await new Promise(r=>server.close(r))}
