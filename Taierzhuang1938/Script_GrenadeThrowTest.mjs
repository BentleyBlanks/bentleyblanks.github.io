import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {FPS_ARM_LIMITS} from './Data_FpsArmPoses.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'_shots/GrenadeThrow');fs.mkdirSync(out,{recursive:true});
const server=await ServeRoot(path.dirname(root),0),browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&phase=2&quality=medium&scale=small`,{waitUntil:'load',timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:180000});
 await page.evaluate(()=>{const T=Taierzhuang;T.player.spawnGrace=999;T.player.health=100;for(const s of T.ai.soldiers)if(s.side==='ija')s.position.x+=500;T.viewmodel.Equip('Grenade');T.StepFrames(90);T.viewmodel.onThrowRelease=()=>{window.grenadeReleases=(window.grenadeReleases||0)+1;};});
 const data=await page.evaluate(async()=>{
  const THREE=await import('./vendor/three/build/three.module.js'),T=Taierzhuang,v=T.viewmodel,r=v.riggedArms;
  if(r!==v.armRigs.Grenade||!r.fixedRestLengths)throw Error('Grenade does not use repaired arms');
  const bones=[];r.root.traverse(o=>{if(o.isBone)bones.push(o);});
  window.grenadeBoneNames=bones.map(b=>b.name);
  const result=[];v.TriggerThrow(1);
  for(let i=0;i<=120;i++){
   v.action.t=i/120;v.Update(0,{ads:0,sprint:0,moveSpeed:0,grounded:true,crouch:0,strafe:0,lookDeltaYaw:0,lookDeltaPitch:0,elapsed:0,lowAmmo:false});v.root.updateWorldMatrix(true,true);
   const inverse=v.armAnchor.matrixWorld.clone().invert(),P=o=>o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray();
   const M=o=>new THREE.Matrix4().multiplyMatrices(T.camera.matrixWorld.clone().invert(),o.matrixWorld).toArray();
   result.push({t:i/120,wrist:{...r.wristBend},grip:{...r.gripError},right:P(r.bones.r.hand),elbow:P(r.bones.r.forearm),upper:P(r.bones.r.upperArm),leftElbow:P(r.bones.l.forearm),bones:bones.map(M),weapon:M(v.rig.group)});
  }
  return {frames:result,boneNames:window.grenadeBoneNames,releases:window.grenadeReleases};
 });
 fs.writeFileSync(path.join(out,'Data_GrenadeTrace.json'),JSON.stringify(data));
 for(const phase of [0,.18,.32,.48,.59,.76,.99]){
  await page.evaluate(t=>{const T=Taierzhuang,v=T.viewmodel;v.TriggerThrow(1);v.action.t=t;T.StepFrames(1,0,true);},phase);
  await page.screenshot({path:path.join(out,`Scene_Grenade_${Math.round(phase*100)}.png`)});
 }
 const Dist=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
 const metrics={wrist:Math.max(...data.frames.flatMap(f=>Object.values(f.wrist))),grip:Math.max(...data.frames.map(f=>f.grip.r)),elbowStep:Math.max(...data.frames.slice(1).map((f,i)=>Dist(f.elbow,data.frames[i].elbow))),releases:data.releases};
 console.log(JSON.stringify(metrics));
 assert.equal(data.releases,1,'one release per throw');
 assert(metrics.wrist<=FPS_ARM_LIMITS.wristBendDeg+.1,'wrist folds beyond anatomical limit');
 assert(metrics.grip<=FPS_ARM_LIMITS.positionResidualM,'hand separates from grenade');
 assert(metrics.elbowStep<.085,'elbow flips');
 for(const [a,b] of [['upper','elbow'],['elbow','right']]){const lengths=data.frames.map(f=>Dist(f[a],f[b]));assert(Math.max(...lengths)-Math.min(...lengths)<.001,'arm stretches');}
 const continuous=await page.evaluate(()=>{
  const T=Taierzhuang,v=T.viewmodel,result=[];
  for(const power of [.25,1]){
   v.action=null;window.grenadeReleases=0;v.TriggerThrow(power);
   for(let i=0;i<125;i++)v.Update(.82/120,{ads:0,sprint:0,moveSpeed:0,grounded:true,crouch:0,strafe:0,lookDeltaYaw:0,lookDeltaPitch:0,elapsed:0,lowAmmo:false});
   result.push({power,releases:window.grenadeReleases,finished:!v.action,bodyCleared:!v.riggedArms.videoBody,visible:v.rig.parts.grenade.visible});
  }
  return result;
 });
 for(const row of continuous){assert.equal(row.releases,1);assert(row.finished&&row.bodyCleared&&row.visible,'throw must reset after continuous playback');}
 assert.deepEqual(errors,[]);console.log('PASS repaired grenade hands and full throw');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

