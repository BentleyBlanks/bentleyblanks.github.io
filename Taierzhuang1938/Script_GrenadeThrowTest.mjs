import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {FPS_ARM_LIMITS} from './Data_FpsArmPoses.mjs';
import {FPS_GRENADE_THROW} from './Data_FpsGrenadeThrow.mjs';
import {WEAPONS} from './Data_Weapons.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'_shots/GrenadeThrow');fs.mkdirSync(out,{recursive:true});
const server=await ServeRoot(path.dirname(root),0),browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&phase=2&quality=high&scale=small`,{waitUntil:'load',timeout:120000});
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
 for(const phase of [0,.18,.34,.42,.48,.56,.66,.80,.89,.99]){
  await page.evaluate(t=>{const T=Taierzhuang,v=T.viewmodel;v.action=null;v.rig.parts.grenade.visible=true;v.TriggerThrow(1);v.action.t=t;T.StepFrames(1,0,true);},phase);
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
  for(const power of [0,.25,1]){
   v.action=null;window.grenadeReleases=0;v.TriggerThrow(power);
   let wrist=0,grip=0;
   for(let i=0;i<125;i++){
    v.Update(.82/120,{ads:0,sprint:0,moveSpeed:0,grounded:true,crouch:0,strafe:0,lookDeltaYaw:0,lookDeltaPitch:0,elapsed:0,lowAmmo:false});
    wrist=Math.max(wrist,...Object.values(v.riggedArms.wristBend));grip=Math.max(grip,v.riggedArms.gripError.r);
   }
   result.push({power,wrist,grip,releases:window.grenadeReleases,finished:!v.action,bodyCleared:!v.riggedArms.videoBody,visible:v.rig.parts.grenade.visible});
  }
  return result;
 });
 for(const row of continuous){assert.equal(row.releases,1);assert(row.finished&&row.bodyCleared&&row.visible,'throw must reset after continuous playback');assert(row.wrist<=FPS_ARM_LIMITS.wristBendDeg+.1&&row.grip<=FPS_ARM_LIMITS.positionResidualM,'short throws keep the anatomical grip');}
 // Exercise the actual game release/inventory path, including quick throw
 // while carrying a rifle and when empty-handed. No projectile update here:
 // the first position must be exactly the evaluated release point.
 const gameplay=await page.evaluate(({durationS,release})=>{
  const T=Taierzhuang,v=T.viewmodel,rows=[];
  const input={ads:0,sprint:0,moveSpeed:0,grounded:true,crouch:0,strafe:0,lookDeltaYaw:0,lookDeltaPitch:0,elapsed:0,lowAmmo:false};
  for(const id of ['Grenade','HanYang',null]){
   v.action=null;v.Equip(id,0,{instant:true});v.Update(0,input);
   T.state.grenades=3;T.player.health=100;
   const old=new Set(T.combat.projectiles),ammo=T.state.ammo,clips=T.state.clips;
   let hand=null,count=0;
   v.onThrowRelease=point=>{hand=point.toArray();count++;};
   T.Debug.Throw('Grenade',.75);
   const initial={active:v.weaponId,count:T.combat.projectiles.filter(p=>!old.has(p)).length,stock:T.state.grenades};
   const duplicate=v.TriggerThrow(.75,{kind:'Grenade'});
   v.action.t=release-.01;v.Update(0,input);
   const before={count:T.combat.projectiles.filter(p=>!old.has(p)).length,stock:T.state.grenades,held:v.rig.parts.grenade.visible};
   v.action.t=release;v.Update(0,input);
   const created=T.combat.projectiles.filter(p=>!old.has(p));
   const after={count:created.length,stock:T.state.grenades,held:v.rig.parts.grenade.visible,origin:created[0]?.position.toArray(),fuse:created[0]?.fuse,hand};
   for(let i=0;i<70;i++)v.Update(durationS/120,input);
   rows.push({id,initial,before,after,duplicate,releases:count,restored:v.weaponId,finished:!v.action,
    ammunitionUnchanged:T.state.ammo===ammo&&T.state.clips===clips});
  }
  return rows;
 },FPS_GRENADE_THROW);
 fs.writeFileSync(path.join(out,'Data_Gameplay.json'),JSON.stringify(gameplay,null,2));
 for(const row of gameplay){
  assert.equal(row.initial.active,'Grenade','quick throw uses the authored ordinary grenade');
  assert.equal(row.initial.count,0,'no projectile at windup');assert.equal(row.initial.stock,3);
  assert.equal(row.before.count,0,'no projectile before the release frame');assert.equal(row.before.stock,3);assert(row.before.held);
  assert.equal(row.after.count,1);assert.equal(row.after.stock,2);assert(!row.after.held);
  assert(Dist(row.after.origin,row.after.hand)<1e-6,'projectile starts at the evaluated palm');
  assert(Math.abs(row.after.fuse-(WEAPONS.Grenade.fuseS-(.75*1.1-.35)-FPS_GRENADE_THROW.durationS*FPS_GRENADE_THROW.release))<1e-5,'windup does not extend the burning fuse');
  assert.equal(row.duplicate,false,'repeated input cannot restart a pending throw');assert.equal(row.releases,1);
  assert.equal(row.restored,row.id);assert(row.finished&&row.ammunitionUnchanged,'original weapon/ammo restored');
 }
 const quickAnatomy=await page.evaluate(async()=>{
  const THREE=await import('./vendor/three/build/three.module.js'),v=Taierzhuang.viewmodel,rows=[];
  for(const power of [0,1])for(const stance of ['stand','sprint','ads','crouch']){
   const input={ads:stance==='ads'?1:0,sprint:stance==='sprint'?1:0,moveSpeed:0,grounded:true,crouch:stance==='crouch'?1:0,elapsed:0};
   v.action=null;v.Equip('HanYang',0,{instant:true});
   for(let i=0;i<90;i++)v.Update(1/60,input);
   const active=stance==='ads'?v.adsSpring.value:stance==='sprint'?v.sprintSpring.value:stance==='crouch'?v.crouchSpring.value:1;
   v.TriggerThrow(power,{kind:'Grenade'});
   const rig=v.riggedArms;
   let previous=null,elbowStep=0,wrist=0,grip=0;
   for(let i=0;i<120;i++){
    v.action.t=i/120;v.Update(0,input);
    const elbow=rig._InAnchor(rig.bones.r.forearm,new THREE.Vector3());
    if(previous)elbowStep=Math.max(elbowStep,elbow.distanceTo(previous));previous=elbow;
    wrist=Math.max(wrist,...Object.values(rig.wristBend));grip=Math.max(grip,rig.gripError.r);
   }
   rows.push({power,stance,active,elbowStep,wrist,grip});
  }
  return rows;
 });
 fs.writeFileSync(path.join(out,'Data_QuickThrowAnatomy.json'),JSON.stringify(quickAnatomy,null,2));
 for(const row of quickAnatomy){assert(row.active>.95,'stance must actually settle before the throw');assert(row.elbowStep<.085,`quick throw elbow flips: ${JSON.stringify(row)}`);assert(row.wrist<=FPS_ARM_LIMITS.wristBendDeg+.1&&row.grip<=FPS_ARM_LIMITS.positionResidualM);}
 const bundle=await page.evaluate(async()=>{
  const THREE=await import('./vendor/three/build/three.module.js'),v=Taierzhuang.viewmodel;
  v.action=null;v.Equip('GrenadeBundle',0,{instant:true});
  const input={ads:0,sprint:0,moveSpeed:0,grounded:true,crouch:0,elapsed:0};
  for(let i=0;i<90;i++)v.Update(1/60,input);
  const r=v.riggedArms,hold=r.fingerBones.r.find(b=>/finger11$/i.test(b.name)).quaternion.clone();
  const result={fixed:r.fixedRestLengths,scale:v.rig.group.scale.toArray(),grip:0,wrist:0,step:0,opened:0,releases:0,lengths:[]};
  v.onThrowRelease=()=>result.releases++;v.TriggerThrow(1,{kind:'GrenadeBundle'});
  let previous=null;
  for(let i=0;i<120;i++){
   v.action.t=i/120;v.Update(0,input);
   const P=b=>r._InAnchor(b,new THREE.Vector3());
   const elbow=P(r.bones.r.forearm);
   if(previous)result.step=Math.max(result.step,elbow.distanceTo(previous));previous=elbow;
   result.wrist=Math.max(result.wrist,...Object.values(r.wristBend));
   if(i/120<.47)result.grip=Math.max(result.grip,...Object.values(r.gripError));
   if(i===72)result.opened=hold.angleTo(r.fingerBones.r.find(b=>/finger11$/i.test(b.name)).quaternion);
   result.lengths.push(P(r.bones.r.upperArm).distanceTo(elbow),elbow.distanceTo(P(r.bones.r.hand)));
  }
  return result;
 });
 assert(bundle.fixed&&bundle.scale.every(n=>Math.abs(n-1)<1e-6),'bundle uses fixed bones and a full-sized wooden handle');
 assert(bundle.grip<=FPS_ARM_LIMITS.positionResidualM&&bundle.wrist<=FPS_ARM_LIMITS.wristBendDeg+.1,'bundle two-hand throw remains anatomical');
 assert(bundle.step<.085&&bundle.opened>.2&&bundle.releases===1,'bundle releases once with open fingers and continuous elbows');
 for(const offset of [0,1]){const lengths=bundle.lengths.filter((_,i)=>i%2===offset);assert(Math.max(...lengths)-Math.min(...lengths)<.001,'bundle arm does not stretch');}
 fs.writeFileSync(path.join(out,'Data_BundleAnatomy.json'),JSON.stringify(bundle,null,2));
 assert.deepEqual(errors,[]);console.log('PASS repaired grenade/bundle hands and full throws');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

