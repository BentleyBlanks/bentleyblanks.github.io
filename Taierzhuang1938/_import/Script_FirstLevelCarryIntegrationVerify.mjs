// Reimport the local animation candidates onto production meshes and bind data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(project);
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root)throw Error('--root required');
const output=path.join(project,'_shots/FirstLevelCarry');await fs.mkdir(output,{recursive:true});
for(let n=1;n<=4;n++)await fs.copyFile(path.join(root,`Models/FirstLevelCarryV9/GameIntegration/Animation_LugouNra0${n}FirstLevelCarry.glb`),path.join(output,`Animation_LugouNra0${n}FirstLevelCarry.glb`));
await fs.writeFile(path.join(output,'_check_Integration.html'),`<!doctype html><html><head><script type="importmap">{"imports":{"three":"../../vendor/three/build/three.module.js"}}</script></head><body style="margin:0"><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
const loader=new GLTFLoader();window.Integration={THREE,loader};
</script></body></html>`);
const server=await ServeRoot(repo,0),browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/_shots/FirstLevelCarry/_check_Integration.html`);
 await page.waitForFunction(()=>window.Integration);
 for(let variant=1;variant<=4;variant++){
  const result=await page.evaluate(async variant=>{
   const {THREE:T,loader}=Integration,id='LugouNra0'+variant;
   const [gltf,clips]=await Promise.all([loader.loadAsync('../../Model/Character/Model_'+id+'.glb'),loader.loadAsync('./Animation_'+id+'FirstLevelCarry.glb')]);
   const model=gltf.scene,bones=[],meshes=[];model.traverse(o=>{if(o.isBone)bones.push(o);if(o.isSkinnedMesh)meshes.push(o)});
   const bind=JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)));
   const parents=bones.map(b=>b.parent),scale=bones.map(b=>b.scale.clone());
   const mixer=new T.AnimationMixer(model),entries=[];
   for(const clip of clips.animations){
    mixer.stopAllAction();const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();let first,last,delta=0;
    for(let i=0;i<=120;i++){
     action.enabled=true;action.paused=false;mixer.setTime(i/60);model.updateMatrixWorld(true);
     const matrices=bones.flatMap(b=>b.matrixWorld.elements);if(i===0)first=matrices;if(i===120)last=matrices;
     if(!matrices.every(Number.isFinite))throw Error('Invalid matrix');
     delta=Math.max(delta,...matrices.map((x,j)=>Math.abs(x-first[j])));
    }
    entries.push({clip:clip.name,frames:121,movement:delta,seam:Math.max(...first.map((x,i)=>Math.abs(x-last[i])))});
   }
   const bindingPreserved=bind===JSON.stringify(meshes.map(m=>m.skeleton.boneInverses.map(b=>b.elements)))&&bones.every((b,i)=>b.parent===parents[i]);
   const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1400,900);renderer.setClearColor(0x253036);document.body.replaceChildren(renderer.domElement);
   const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1400/900,.01,100);scene.add(new T.HemisphereLight(0xffffff,0x555555,2.5));
   const key=new T.DirectionalLight(0xffffff,3);key.position.set(-3,5,4);scene.add(key);scene.add(new T.GridHelper(12,24));scene.add(model);
   // Same single +Z -> -Z bridge as LugouCharacterRig; no new rotation in bake.
   model.rotation.y=Math.PI;
   mixer.stopAllAction();const a=mixer.clipAction(clips.animations[0]);a.play();mixer.setTime(.5);model.updateMatrixWorld(true);
   const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3());camera.position.copy(center).add(new T.Vector3(2.8,1.3,3.6));camera.lookAt(center);renderer.render(scene,camera);
   Integration.dispose=()=>{renderer.dispose();model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}})};
   return {id,bones:bones.length,skinnedMeshes:meshes.length,bindingPreserved,extraBones:bones.filter(b=>!clips.animations[0].tracks.some(t=>t.name.startsWith(b.name+'.'))).map(b=>b.name),entries};
  },variant);
  assert.ok(result.bindingPreserved,'original skin bind and hierarchy preserved');
  assert.ok(result.entries.every(e=>e.movement>.0001&&e.seam<.001));
  await page.screenshot({path:path.join(output,`Texture_LugouNra0${variant}_Mounted.png`)});
  await page.evaluate(()=>Integration.dispose());results.push(result);
 }
 assert.deepEqual(errors,[]);
 const report={status:'mounted_on_original_meshes_not_enabled_in_mission',results,errors};
 await fs.writeFile(path.join(output,'Data_IntegrationValidation.json'),JSON.stringify(report,null,2));
 await fs.copyFile(path.join(output,'Data_IntegrationValidation.json'),path.join(root,'Models/FirstLevelCarryV9/GameIntegration/Data_BrowserValidation.json'));
 console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
