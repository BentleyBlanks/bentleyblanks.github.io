// Real production sword, hand bones and phase clock; no proxy sword animation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {FPS_ARM_LIMITS} from './Data_FpsArmPoses.mjs';
import {FPS_DADAO_SWING} from './Data_FpsDadaoSwing.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(project,'_shots','DadaoPower','Acceptance');fs.mkdirSync(out,{recursive:true});
assert.equal(FPS_DADAO_SWING.frames.length,121);
for(const row of FPS_DADAO_SWING.frames)assert(row.length===19&&row.every(Number.isFinite));
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
 await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort('blockedbyclient'));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`,{waitUntil:'load',timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.running&&Taierzhuang.meleeAnimationsLoaded,null,{timeout:120000});
 const data=await page.evaluate(async(exportSource)=>{
  const THREE=await import('./vendor/three/build/three.module.js');
  const {MELEE_WEAPONS}=await import('./Data_MeleeCombat.mjs');
  const {SampleMeleeVideo}=await import('./Script_MeleeAnimation.mjs');
  const {FPS_DADAO_SWING:stroke}=await import('./Data_FpsDadaoSwing.mjs');
  const {FPS_ARM_POSES:poses}=await import('./Data_FpsArmPoses.mjs');
  const T=Taierzhuang,L=T.Debug.MeleeCombat;L.Select('DadaoOne');L.Pause(true);T.StepFrames(90,1/60,false);
  const v=T.viewmodel,r=v.riggedArms,bones=[];r.root.traverse(o=>{if(o.isBone)bones.push(o);});
  const result={clips:[],boneNames:bones.map(b=>b.name),sourceFrames:[]};
  const HiltOrder=()=>Object.fromEntries(['r','l'].map(side=>{
   const root=digit=>r.fingerBones[side].find(b=>b.name.toLowerCase().endsWith('finger'+digit));
   const index=v.rig.group.worldToLocal(root(1).getWorldPosition(new THREE.Vector3()));
   const little=v.rig.group.worldToLocal(root(4).getWorldPosition(new THREE.Vector3()));
   return [side,index.z-little.z];
  }));
  result.hiltGripOrder=HiltOrder();
  if(r!==v.armRigs.Dadao||!r.fixedRestLengths)throw Error('Dadao must use the repaired fixed-length hands');
  const model=v.rig.group.getObjectByName('Model_DadaoEdgeMount');
  if(!model)throw Error('Missing measured Dadao edge mount');
  model.updateWorldMatrix(true,true);
  const band=[];
  model.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
   for(let i=0;i<p.count;i++){const point=model.worldToLocal(o.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i)));
    if(Math.abs(point.z+.3)<.025)band.push(point);}});
  const low=Math.min(...band.map(p=>p.y)),high=Math.max(...band.map(p=>p.y));
  const Thickness=y=>{const xs=band.filter(p=>Math.abs(p.y-y)<.008).map(p=>p.x);return Math.max(...xs)-Math.min(...xs);};
  if(!(Thickness(high)<Thickness(low)*.5))throw Error('Measured thin edge must be the source model +Y side');
  result.edgeThickness={positiveY:Thickness(high),negativeY:Thickness(low)};
  const guard=new THREE.Quaternion().setFromEuler(new THREE.Euler(...poses.Dadao.hip.weapon.rotation,'YXZ'));
  const normals=stroke.frames
   .map(row=>new THREE.Vector3(1,0,0).applyQuaternion(guard).applyQuaternion(new THREE.Quaternion().fromArray(row,3)));
  result.cutPlaneDriftDeg=Math.max(...normals.map(normal=>THREE.MathUtils.radToDeg(normal.angleTo(normals[0]))));
  const Matrix=(o,relative)=>new THREE.Matrix4().multiplyMatrices(relative.matrixWorld.clone().invert(),o.matrixWorld).toArray();
  for(const action of ['Light','LightAlt','Heavy','Compact','CompactAlt','Charge']){
   const spec=MELEE_WEAPONS.Dadao[action==='Heavy'?'heavy':'light'],duration=spec.windup+spec.active+spec.recovery;
   const frames=[];
   for(let i=0;i<=120;i++){
    L.Preview(action,i/120);T.StepFrames(1,duration/120,false);v.root.updateWorldMatrix(true,true);
    const inverse=v.armAnchor.matrixWorld.clone().invert();
    const P=o=>o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray();
    const matrix=new THREE.Matrix4().multiplyMatrices(inverse,v.rig.group.matrixWorld);
    const modelMatrix=new THREE.Matrix4().multiplyMatrices(inverse,model.matrixWorld);
    const tip=new THREE.Vector3(0,-.012074,-.626).applyMatrix4(modelMatrix);
    const edge=new THREE.Vector3(0,1,0).transformDirection(modelMatrix);
    frames.push({t:i/120,tip:tip.toArray(),edge:edge.toArray(),normal:new THREE.Vector3(1,0,0).transformDirection(modelMatrix).toArray(),grip:Math.max(r.gripError.r,r.gripError.l),
     wrist:Math.max(r.wristBend.r,r.wristBend.l),wristPair:{...r.wristBend},right:P(r.bones.r.hand),left:P(r.bones.l.hand),
     upper:P(r.bones.r.upperArm),elbow:P(r.bones.r.forearm),leftElbow:P(r.bones.l.forearm),weapon:matrix.toArray(),hiltGripOrder:HiltOrder()});
    if(exportSource&&action==='Light')result.sourceFrames.push({bones:bones.map(b=>Matrix(b,T.camera)),weapon:Matrix(v.rig.group,T.camera)});
   }
   result.clips.push({action,duration,windup:spec.windup,active:spec.active,frames});
  }
  // Seeking into recovery must agree with uninterrupted playback. The old
  // elbow limiter preserved a different bend plane and wrapped over the hilt.
  result.recoverySeekError=0;
  for(const index of [96,66,78,60,84]){
   L.Preview('Light',index/120);T.StepFrames(1,1/60,false);v.root.updateWorldMatrix(true,true);
   const expected=result.clips[0].frames[index];
   for(const [side,key] of [['r','elbow'],['l','leftElbow']]){
    const actual=v.armAnchor.worldToLocal(r.bones[side].forearm.getWorldPosition(new THREE.Vector3()));
    result.recoverySeekError=Math.max(result.recoverySeekError,actual.distanceTo(new THREE.Vector3().fromArray(expected[key])));
   }
  }
  // Interruption must start from the evaluated outgoing pose, without changing
  // its amplitude at mix=0 (the previous implementation shrank the downstroke).
  const from={clip:'DadaoLight',action:'Light',normalized:.4};
  const previous=SampleMeleeVideo(from);
  const transition=SampleMeleeVideo({clip:'DadaoParryLeft',action:'ParryLeft',normalized:0,transition:{from,mix:0}});
  result.interruptionError=Math.max(...previous.values.map((n,i)=>Math.abs(n-transition.values[i])));
  return result;
 },process.argv.includes('--export-source'));
 if(process.argv.includes('--trace'))fs.writeFileSync(path.join(out,'Data_DadaoSwingTrace.json'),JSON.stringify(data));
 assert(Object.values(data.hiltGripOrder).every(distance=>distance<-.04),'Both sword hands must have index knuckles toward the blade; a reversed support palm hooks the pommel');
 const Dist=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
 assert(data.cutPlaneDriftDeg<.1,`Blade twists during downstroke/follow-through: ${data.cutPlaneDriftDeg} degrees`);
 const metrics=[];
 for(const clip of data.clips){
  assert(clip.frames[0].edge[2]<-.8,`${clip.action}: real cutting edge must face forward in guard`);
  for(const f of clip.frames){
   assert(Object.values(f.hiltGripOrder).every(distance=>distance<-.04),`${clip.action} ${f.t}: default two-hand power grip reverses on the hilt`);
   const dot=f.normal.reduce((sum,n,i)=>sum+n*clip.frames[0].normal[i],0);
   assert(Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI<.1,`${clip.action} ${f.t}: blade rolls out of its cutting plane`);
   assert(f.grip<=FPS_ARM_LIMITS.positionResidualM,`${clip.action}: grip ${f.grip}`);
   assert(f.wrist<=FPS_ARM_LIMITS.wristBendDeg+.01,`${clip.action} ${f.t}: wrist ${f.wrist} ${JSON.stringify(f.wristPair)}`);
  }
  const upper=clip.frames.map(f=>Dist(f.upper,f.elbow)),lower=clip.frames.map(f=>Dist(f.elbow,f.right));
  assert(Math.max(...upper)-Math.min(...upper)<.001,'Upper arm must not stretch');
  assert(Math.max(...lower)-Math.min(...lower)<.001,'Forearm must not stretch');
  for(let i=1;i<clip.frames.length;i++)for(const key of ['elbow','leftElbow'])
   assert(Dist(clip.frames[i-1][key],clip.frames[i][key])<.085,`${clip.action} ${clip.frames[i].t}: elbow flips between frames`);
  if(clip.action==='Charge')continue;
  for(const f of clip.frames.filter(f=>f.t>=.55&&f.t<=.85)){
   assert(f.elbow[1]<f.right[1]-.035,`${clip.action} ${f.t}: dominant elbow folds over the grip`);
   assert(f.leftElbow[1]<f.left[1]-.035,`${clip.action} ${f.t}: support elbow folds over the grip`);
  }
  const start=Math.ceil(clip.windup/clip.duration*120),end=Math.floor((clip.windup+clip.active)/clip.duration*120);
  let travel=0,alignment=0,peak=0;
  for(let i=start;i<end;i++){
   const a=clip.frames[i],b=clip.frames[i+1],d=Dist(a.tip,b.tip);travel+=d;peak=Math.max(peak,d/(clip.duration/120));
   alignment+=a.edge.reduce((sum,n,j)=>sum+n*(b.tip[j]-a.tip[j]),0)/d;
  }
  alignment/=end-start;
  const vertical=clip.frames[start].tip[1]-clip.frames[end].tip[1];
  const horizontal=clip.frames[start].tip[0]-clip.frames[end].tip[0];
  assert(horizontal>.45,`${clip.action}: cut must travel from right to left ${horizontal}`);
  assert(travel>1.6,`${clip.action}: insufficient cut travel ${travel}`);
  assert(vertical>.85,`${clip.action}: not a descending cut ${vertical}`);
  assert(alignment>.75,`${clip.action}: cutting with the flat/spine ${alignment}`);
  assert(peak<35,`${clip.action}: excessive blade speed ${peak}`);
  assert(Dist(clip.frames[0].tip,clip.frames[120].tip)<.012,`${clip.action}: recovery does not return to guard`);
  metrics.push({action:clip.action,travel,vertical,horizontal,alignment,peak,wrist:Math.max(...clip.frames.map(f=>f.wrist))});
 }
 assert(data.interruptionError<1e-6,'Interrupted cut changes amplitude');assert.deepEqual(errors,[]);
 assert(data.recoverySeekError<.001,`Recovery elbow changes with playback history: ${data.recoverySeekError} m`);
 const visibility=[];
 for(const viewport of [{width:1280,height:720},{width:1440,height:900}]){
  await page.setViewportSize(viewport);
  await page.waitForFunction(({width,height})=>Math.abs(Taierzhuang.camera.aspect-width/height)<1e-4,viewport,{timeout:10000});
  const checks=await page.evaluate(async()=>{
   const THREE=await import('./vendor/three/build/three.module.js'),T=Taierzhuang,L=T.Debug.MeleeCombat;
   L.Select('DadaoOne');L.Pause(true);T.StepFrames(90,1/60,false);
   return ['Light','Heavy','Charge'].map(action=>{
    let seen=0;
    for(let i=0;i<=30;i++){L.Preview(action,i/30);T.StepFrames(1,1/60,false);const p=T.viewmodel.riggedArms.bones.r.hand.getWorldPosition(new THREE.Vector3()).project(T.camera);if(Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1)seen++;}
    return {action,seen};
   });
  });
  for(const check of checks)assert(check.seen>=16,`${viewport.width}x${viewport.height} ${check.action}: hand absent for most frames (${check.seen}/31)`);
  visibility.push({viewport,checks});
 }
 await page.setViewportSize({width:1280,height:720});
 await page.waitForFunction(()=>Math.abs(Taierzhuang.camera.aspect-1280/720)<1e-4,null,{timeout:10000});
 fs.writeFileSync(path.join(out,'Data_DadaoSwingAcceptance.json'),JSON.stringify({metrics,visibility,hiltGripOrder:data.hiltGripOrder,cutPlaneDriftDeg:data.cutPlaneDriftDeg,interruptionError:data.interruptionError,recoverySeekError:data.recoverySeekError},null,2));
 if(data.sourceFrames.length)fs.writeFileSync(path.join(out,'Data_DadaoSourceBake.json'),JSON.stringify({boneNames:data.boneNames,frames:data.sourceFrames}));
 for(const phase of [0,.24,.34,.4,.55,.85]){
  // ResizeObserver and the temporal render targets must settle before the first
  // capture. A single immediate frame after resizing can be an empty buffer.
  await page.evaluate(phase=>{Taierzhuang.Debug.MeleeCombat.Preview('Light',phase);Taierzhuang.StepFrames(2,0,true);},phase);
  await page.screenshot({path:path.join(out,`Scene_Dadao_${Math.round(phase*100)}.png`)});
 }
 const inspector=await page.evaluate(async()=>{
  const THREE=await import('./vendor/three/build/three.module.js');
  const {MELEE_WEAPONS}=await import('./Data_MeleeCombat.mjs');
  const T=Taierzhuang;T.Debug.OpenEditor('firstPerson');
  const editor=T.editor.active;editor.SetWeapon('Dadao');editor.SetPose('hip');
  for(let i=0;i<90;i++)editor.Update(1/60);
  editor.Trigger('melee');const v=T.viewmodel,r=v.riggedArms;
  const result={duration:v.action.duration,sources:[],grip:0,wrist:0,step:0,support:1};let previous=null;
  for(let i=0;i<120;i++){
   v.action.t=i/120;editor.Update(0);v.root.updateWorldMatrix(true,true);
   result.sources.push(v.meleeVideoFrame?.source||null);
   result.grip=Math.max(result.grip,r.gripError.r,r.gripError.l);result.wrist=Math.max(result.wrist,r.wristBend.r,r.wristBend.l);
   result.support=Math.min(result.support,r.contactWeight.l);
   const elbow=r._InAnchor(r.bones.l.forearm,new THREE.Vector3());
   if(previous)result.step=Math.max(result.step,elbow.distanceTo(previous));previous=elbow;
  }
  const spec=MELEE_WEAPONS.Dadao.light;result.expectedDuration=spec.windup+spec.active+spec.recovery;
  return result;
 });
 assert.equal(inspector.duration,inspector.expectedDuration,'inspector uses the combat stroke clock');
 assert(inspector.sources.every(source=>source==='BlenderDadaoPowerSwing'),'inspector must evaluate the Blender stroke');
 assert(inspector.support>.999&&inspector.grip<=FPS_ARM_LIMITS.positionResidualM,'inspector retains both real hilt contacts');
 assert(inspector.wrist<=FPS_ARM_LIMITS.wristBendDeg+.01&&inspector.step<.085,'inspector has continuous anatomical elbows');
 fs.writeFileSync(path.join(out,'Data_DadaoInspectorAcceptance.json'),JSON.stringify(inspector,null,2));
 console.log(JSON.stringify({metrics,visibility,inspector}));console.log('PASS Dadao descending edge-first stroke, anatomy, recovery, interruption and inspector action');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
