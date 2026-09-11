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
  const T=Taierzhuang,L=T.Debug.MeleeCombat;L.Select('DadaoOne');L.Pause(true);T.StepFrames(90,1/60,false);
  const v=T.viewmodel,r=v.riggedArms,bones=[];r.root.traverse(o=>{if(o.isBone)bones.push(o);});
  const result={clips:[],boneNames:bones.map(b=>b.name),sourceFrames:[]};
  const Matrix=(o,relative)=>new THREE.Matrix4().multiplyMatrices(relative.matrixWorld.clone().invert(),o.matrixWorld).toArray();
  for(const action of ['Light','LightAlt','Heavy','Compact','CompactAlt','Charge']){
   const spec=MELEE_WEAPONS.Dadao[action==='Heavy'?'heavy':'light'],duration=spec.windup+spec.active+spec.recovery;
   const frames=[];
   for(let i=0;i<=120;i++){
    L.Preview(action,i/120);T.StepFrames(1,duration/120,false);v.root.updateWorldMatrix(true,true);
    const inverse=v.armAnchor.matrixWorld.clone().invert();
    const P=o=>o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse).toArray();
    const matrix=new THREE.Matrix4().multiplyMatrices(inverse,v.rig.group.matrixWorld);
    const tip=new THREE.Vector3(0,-.012074,-.626).applyMatrix4(matrix);
    const edge=new THREE.Vector3(0,-1,0).transformDirection(matrix);
    frames.push({t:i/120,tip:tip.toArray(),edge:edge.toArray(),grip:Math.max(r.gripError.r,r.gripError.l),
     wrist:Math.max(r.wristBend.r,r.wristBend.l),wristPair:{...r.wristBend},right:P(r.bones.r.hand),left:P(r.bones.l.hand),
     upper:P(r.bones.r.upperArm),elbow:P(r.bones.r.forearm),weapon:matrix.toArray()});
    if(exportSource&&action==='Light')result.sourceFrames.push({bones:bones.map(b=>Matrix(b,T.camera)),weapon:Matrix(v.rig.group,T.camera)});
   }
   result.clips.push({action,duration,windup:spec.windup,active:spec.active,frames});
  }
  // Interruption must start from the evaluated outgoing pose, without changing
  // its amplitude at mix=0 (the previous implementation shrank the downstroke).
  const from={clip:'DadaoLight',action:'Light',normalized:.4};
  const previous=SampleMeleeVideo(from);
  const transition=SampleMeleeVideo({clip:'DadaoParryLeft',action:'ParryLeft',normalized:0,transition:{from,mix:0}});
  result.interruptionError=Math.max(...previous.values.map((n,i)=>Math.abs(n-transition.values[i])));
  return result;
 },process.argv.includes('--export-source'));
 const Dist=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
 const metrics=[];
 for(const clip of data.clips){
  for(const f of clip.frames){
   assert(f.grip<=FPS_ARM_LIMITS.positionResidualM,`${clip.action}: grip ${f.grip}`);
   assert(f.wrist<=FPS_ARM_LIMITS.wristBendDeg+.01,`${clip.action} ${f.t}: wrist ${f.wrist} ${JSON.stringify(f.wristPair)}`);
  }
  const upper=clip.frames.map(f=>Dist(f.upper,f.elbow)),lower=clip.frames.map(f=>Dist(f.elbow,f.right));
  assert(Math.max(...upper)-Math.min(...upper)<.001,'Upper arm must not stretch');
  assert(Math.max(...lower)-Math.min(...lower)<.001,'Forearm must not stretch');
  if(clip.action==='Charge')continue;
  const start=Math.ceil(clip.windup/clip.duration*120),end=Math.floor((clip.windup+clip.active)/clip.duration*120);
  let travel=0,alignment=0,peak=0;
  for(let i=start;i<end;i++){
   const a=clip.frames[i],b=clip.frames[i+1],d=Dist(a.tip,b.tip);travel+=d;peak=Math.max(peak,d/(clip.duration/120));
   alignment+=a.edge.reduce((sum,n,j)=>sum+n*(b.tip[j]-a.tip[j]),0)/d;
  }
  alignment/=end-start;
  const vertical=clip.frames[start].tip[1]-clip.frames[end].tip[1];
  assert(travel>1.6,`${clip.action}: insufficient cut travel ${travel}`);
  assert(vertical>.85,`${clip.action}: not a descending cut ${vertical}`);
  assert(alignment>.75,`${clip.action}: cutting with the flat/spine ${alignment}`);
  assert(peak<35,`${clip.action}: excessive blade speed ${peak}`);
  assert(Dist(clip.frames[0].tip,clip.frames[120].tip)<.012,`${clip.action}: recovery does not return to guard`);
  metrics.push({action:clip.action,travel,vertical,alignment,peak,wrist:Math.max(...clip.frames.map(f=>f.wrist))});
 }
 assert(data.interruptionError<1e-6,'Interrupted cut changes amplitude');assert.deepEqual(errors,[]);
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
 fs.writeFileSync(path.join(out,'Data_DadaoSwingAcceptance.json'),JSON.stringify({metrics,visibility,interruptionError:data.interruptionError},null,2));
 if(data.sourceFrames.length)fs.writeFileSync(path.join(out,'Data_DadaoSourceBake.json'),JSON.stringify({boneNames:data.boneNames,frames:data.sourceFrames}));
 for(const phase of [.24,.34,.4,.55,.85]){
  await page.evaluate(phase=>{Taierzhuang.Debug.MeleeCombat.Preview('Light',phase);Taierzhuang.StepFrames(1,1/60,true);},phase);
  await page.screenshot({path:path.join(out,`Scene_Dadao_${Math.round(phase*100)}.png`)});
 }
 console.log(JSON.stringify({metrics,visibility}));console.log('PASS Dadao descending edge-first stroke, anatomy, recovery and interruption');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
