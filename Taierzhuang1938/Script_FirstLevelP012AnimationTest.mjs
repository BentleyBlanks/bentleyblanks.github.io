// Actual P012 spawn/GLB playback, with isolated diagnostic motion afterwards.
// This verifies playback and produces local images, not a campaign completion.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(os.tmpdir(),'P012MotionReview_20260905');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high`,{timeout:120000});
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:180000});
 const train=await page.evaluate(()=>{
  const t=window.Tengxian;t.StepFrames(180,1/30,true);
  return t.ai.soldiers.filter(s=>s.p012AwaitingWeapon).map(s=>({id:s.id,installed:s.actor.characterRig?.p012ActorMotion,
   clip:s.actor.characterRig?.currentPlaybackId,rate:s.actor.characterRig?.currentAction?.getEffectiveTimeScale(),visible:s.actor.root.visible,forced:s.actor.characterRig?.forcedClip,move:s.moveSpeed}));
 });
 console.log('Actual train',train.length,'recruits; full states saved with review evidence');
 assert.equal(train.length,40);
 assert.ok(train.every(s=>s.installed&&s.clip==='AttackCommand'&&s.rate===0));
 await page.screenshot({path:path.join(out,'Train_Player.png')});
 const result=await page.evaluate(async()=>{
  const t=window.Tengxian,THREE=await import('/Taierzhuang1938/vendor/three/build/three.module.js');
  const {InstallP012ActorMotion}=await import('/Taierzhuang1938/Script_FirstLevelP012CastAppearance.mjs');
  const {FirstLevelP012Resting}=await import('/Taierzhuang1938/Script_FirstLevelP012Resting.mjs');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x282c30);
  scene.add(new THREE.HemisphereLight(0xffffff,0x454a48,2));
  const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(2,7,-4);scene.add(sun);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x686b64}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  t.actorFactory.SetBatcher(null);let elapsed=0;
  const Make=(id)=>{const actor=t.actorFactory.Create('nra',{seed:id,weapon:null});
   const soldier={id,actor,p012AwaitingWeapon:true};InstallP012ActorMotion(soldier);scene.add(actor.root);return soldier;};
  const Frame=(s,mps,state={})=>{elapsed+=1/60;s.actor.root.position.z-=mps/60;s.actor.Update(1/60,{elapsed,moveSpeed:mps/3.6,...state});};
  const s=Make(91),rig=s.actor.characterRig;
  const Sample=()=>({clip:rig.currentPlaybackId,rate:rig.currentAction.getEffectiveTimeScale(),time:rig.currentAction.time});
  for(let i=0;i<60;i++)Frame(s,0);const empty=Sample();
  for(let i=0;i<60;i++)Frame(s,1.35);const slow=Sample();
  for(let i=0;i<60;i++)Frame(s,2.7);const fast=Sample();
  for(let i=0;i<60;i++)Frame(s,0);const stop=Sample();
  s.p012AwaitingWeapon=false;s.actor.SetWeapon('HanYang');
  for(let i=0;i<30;i++)Frame(s,0,{firing:true,aim:1});const fire=Sample();
  rig.ForceClip('RifleRun');for(let i=0;i<10;i++)Frame(s,0);const forced=Sample();rig.ForceClip(null);
  const bearers=[];
  for(const role of ['front','rear']){
   const b=Make(role==='front'?93:94);b.p012AwaitingWeapon=false;
   for(let i=0;i<30;i++)Frame(b,1.35,{carryRole:role});
   for(let i=0;i<20;i++)Frame(b,0,{carryRole:role});
   const a=b.actor.characterRig.currentAction,from=a.time;
   for(let i=0;i<30;i++)Frame(b,0,{carryRole:role});
   bearers.push({role,from,to:a.time,rate:a.getEffectiveTimeScale()});
   for(let i=0;i<30;i++)Frame(b,1.35,{carryRole:role});bearers.at(-1).resumed=a.time!==from;
   scene.remove(b.actor.root);b.actor.Dispose();
  }
  scene.remove(s.actor.root);s.actor.Dispose();const shown=[];
  for(let i=0;i<5;i++){const recruit=Make(100+i);recruit.actor.root.position.set((i-2)*1.25,0,0);recruit.actor.root.rotation.y=.35;
   for(let f=0;f<30;f++)Frame(recruit,0);shown.push(recruit);}
  for(const e of document.body.children)if(e.tagName!=='CANVAS')e.style.setProperty('display','none','important');
  const camera=new THREE.PerspectiveCamera(32,1.6,.1,100);camera.position.set(0,2,-9);camera.lookAt(0,.9,0);
  window.review={scene,camera,shown,Frame,THREE,FirstLevelP012Resting};scene.updateMatrixWorld(true);t.renderer.render(scene,camera);
  return {empty,slow,fast,stop,fire,forced,bearers};
 });
 console.log('Motion',JSON.stringify(result));
 assert.equal(result.empty.clip,'AttackCommand');assert.equal(result.empty.rate,0);
 assert.equal(result.slow.clip,'RifleRun');assert.equal(result.fast.clip,'RifleRun');
 assert.ok(Math.abs(result.fast.rate/result.slow.rate-2)<1e-6);
 assert.equal(result.stop.clip,'AttackCommand');assert.equal(result.stop.rate,0);
 assert.equal(result.fire.rate,1);assert.equal(result.forced.rate,1);
 assert.ok(result.bearers.every(b=>b.from===b.to&&b.rate===0&&b.resumed));
 await page.screenshot({path:path.join(out,'Train_EmptyHold.png')});
 await page.evaluate(()=>{const {scene,camera,shown,Frame}=window.review;
  for(const s of shown)for(let f=0;f<40;f++)Frame(s,1.35);
  scene.updateMatrixWorld(true);window.Tengxian.renderer.render(scene,camera);});
 await page.screenshot({path:path.join(out,'Train_MovingFallback.png')});
 await page.evaluate(()=>{
  const {scene,camera,shown,THREE,FirstLevelP012Resting}=window.review,t=window.Tengxian;
  for(const s of shown){scene.remove(s.actor.root);s.actor.Dispose();}let index=0;
  const rest=new FirstLevelP012Resting({Spawn:spec=>{
   const a=t.actorFactory.Create('civilian',{seed:420+index,variant:spec.variant,weapon:null});
   a.root.position.set((index++-1)*1.7,0,0);a.root.rotation.y=.2;scene.add(a.root);
   const seat=new THREE.Mesh(new THREE.BoxGeometry(.65,.5,.48),new THREE.MeshStandardMaterial({color:0x595454}));
   seat.position.set(a.root.position.x,.25,.1);scene.add(seat);return a;
  },Position:a=>({x:a.root.position.x,z:a.root.position.z}),HoldPose:(a,pose,dt)=>a.Update(dt,pose)});
  rest.Start();for(let f=0;f<60;f++)rest.Update(1/60);
  scene.updateMatrixWorld(true);t.renderer.render(scene,camera);
 });
 await page.screenshot({path:path.join(out,'Resting_Activities.png')});
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_P012MotionReview.json'),JSON.stringify({root,train,result,errors},null,2));
 console.log('PASS actual P012 train and GLB playback; diagnostic screenshots require review',out);
}finally{await page.close();await browser.close();await new Promise(r=>server.close(r));}
