// Actual first-person blade projection: lower-left cut and readable silhouette.
// Default collects fresh production matrices; --trace=path evaluates a stamped
// replay already captured by this test or DadaoSwingTest --trace --export-source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as THREE from './vendor/three/build/three.module.js';
import {FPS_DADAO_SWING} from './Data_FpsDadaoSwing.mjs';
import {MELEE_WEAPONS} from './Data_MeleeCombat.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

export function EvaluateDadaoProjection(replay,stroke=FPS_DADAO_SWING) {
 const frames=replay.frames,camera=replay.camera;
 assert.equal(frames?.length,121,'Need the 121 actual camera-relative weapon matrices');
 assert(camera?.projectionMatrix?.length===16,'Capture the actual camera projection matrix');
 assert(camera.viewport?.width>0&&camera.viewport?.height>0,'Capture the actual viewport');
 assert(typeof stroke.strokeControlSignature==='string'&&stroke.strokeControlSignature.length===64,'Missing authored stroke signature');
 assert.equal(replay.strokeControlSignature,stroke.strokeControlSignature,'Replay is for a different authored stroke');
 const spec=MELEE_WEAPONS.Dadao[replay.action==='Heavy'?'heavy':'light'];
 const duration=spec.windup+spec.active+spec.recovery,start=spec.windup/duration,end=(spec.windup+spec.active)/duration;
 const SourceTime=t=>t<start?t/start*stroke.cutStart:t<end?stroke.cutStart+(t-start)/(end-start)*(stroke.cutEnd-stroke.cutStart):stroke.cutEnd+(t-end)/(1-end)*(1-stroke.cutEnd);
 const mount=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...stroke.modelRotation));
 const anchors={tip:[0,-.012074,-.626],mid:[0,-.015,-.35],guard:[0,0,0]};
 const samples=frames.map((frame,i)=>{
  const c=frame.camera||camera,width=c.viewport.width,height=c.viewport.height;
  const projection=new THREE.Matrix4().fromArray(c.projectionMatrix),model=new THREE.Matrix4().fromArray(frame.weapon).multiply(mount);
  const sample={i,t:i/120,sourceTime:SourceTime(i/120),width,height};
  for(const [key,point] of Object.entries(anchors)){
   const p=new THREE.Vector3(...point).applyMatrix4(model),ndc=p.clone().applyMatrix4(projection);
   sample[key]={camera:p.toArray(),pixel:[(ndc.x+1)*width*.5,(1-ndc.y)*height*.5],ndc:ndc.toArray(),visible:p.z<0&&Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1&&Math.abs(ndc.z)<=1};
  }
  sample.projectedBladeHeightRatio=Math.hypot(...sample.tip.pixel.map((n,j)=>n-sample.guard.pixel[j]))/height;
  return sample;
 });
 const active=samples.filter(s=>s.t>=start&&s.t<=end),central=active.filter(s=>s.tip.visible&&Math.abs(s.tip.ndc[0])<.9&&Math.abs(s.tip.ndc[1])<.75);
 const failures=[],Check=(condition,message)=>{if(!condition)failures.push(message);};
 Check(central.length>=5,`Only ${central.length} central tip samples`);
 let diagonalAngleDeg=null,monotonicRatio=0,maximumCollapseRun=0,currentRun=0,monotonic=0,steps=0;
 if(central.length>=2){
  const first=central[0],last=central.at(-1);
  diagonalAngleDeg=Math.atan2(last.tip.pixel[1]-first.tip.pixel[1],first.tip.pixel[0]-last.tip.pixel[0])*180/Math.PI;
  for(let i=1;i<central.length;i++)if(central[i].i===central[i-1].i+1){steps++;if(central[i].tip.pixel[0]<central[i-1].tip.pixel[0]&&central[i].tip.pixel[1]>central[i-1].tip.pixel[1])monotonic++;}
  monotonicRatio=steps?monotonic/steps:0;
  for(const s of central){currentRun=s.projectedBladeHeightRatio<.12?currentRun+1:0;maximumCollapseRun=Math.max(maximumCollapseRun,currentRun);}
  Check(diagonalAngleDeg>=30&&diagonalAngleDeg<=55,`Central cut ${diagonalAngleDeg.toFixed(2)} degrees; expected lower-left diagonal 30–55 degrees`);
  Check(monotonicRatio>=.9,`Only ${(monotonicRatio*100).toFixed(1)}% central steps go left and down`);
  Check(maximumCollapseRun<=2,`Blade collapses below .12 viewport heights for ${maximumCollapseRun} central samples`);
 }
 const follow=samples.filter(s=>s.sourceTime>=.40&&s.sourceTime<=.56);
 const lowerLeft=follow.filter(s=>{const [x,y]=s.tip.pixel;return x/s.width>=.15&&x/s.width<=.35&&y/s.height>=.70&&y/s.height<=1.05;});
 Check(lowerLeft.length>=2,`Only ${lowerLeft.length} follow-through samples reach viewport x15–35% / y70–105%`);
 return {pass:failures.length===0,action:replay.action||'Light',camera,strokeControlSignature:stroke.strokeControlSignature,
  activeRange:[active[0].i,active.at(-1).i],centralRange:central.length?[central[0].i,central.at(-1).i]:null,
  diagonalAngleDeg,monotonicRatio,maximumCollapseRun,
  minimumCentralBladeHeightRatio:central.length?Math.min(...central.map(s=>s.projectedBladeHeightRatio)):null,
  lowerLeftSamples:lowerLeft.map(s=>({i:s.i,pixel:s.tip.pixel})),failures,samples};
}

async function CollectRuntimeProjections() {
 const project=path.dirname(fileURLToPath(import.meta.url)),server=await ServeRoot(path.dirname(project),0);
 let browser;
 try{
  browser=await LaunchBrowser();
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],replays=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,route=>route.abort('blockedbyclient'));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.running&&Taierzhuang.meleeAnimationsLoaded,null,{timeout:120000});
  for(const viewport of [{width:1280,height:720},{width:1440,height:900}]){
   await page.setViewportSize(viewport);
   await page.waitForFunction(({width,height})=>Math.abs(Taierzhuang.camera.aspect-width/height)<1e-4,viewport,{timeout:10000});
   const batch=await page.evaluate(async(viewport)=>{
    const THREE=await import('./vendor/three/build/three.module.js');
    const {FPS_DADAO_SWING:stroke}=await import('./Data_FpsDadaoSwing.mjs');
    const {MELEE_WEAPONS}=await import('./Data_MeleeCombat.mjs');
    const T=Taierzhuang,L=T.Debug.MeleeCombat;
    L.Select('DadaoOne');L.Pause(true);T.StepFrames(90,1/60,false);
    const result=[];
    for(const action of ['Light','LightAlt','Heavy','Compact','CompactAlt']){
     const spec=MELEE_WEAPONS.Dadao[action==='Heavy'?'heavy':'light'],duration=spec.windup+spec.active+spec.recovery,frames=[];
     for(let i=0;i<=120;i++){
      L.Preview(action,i/120);T.StepFrames(1,duration/120,false);T.viewmodel.root.updateWorldMatrix(true,true);
      const weapon=new THREE.Matrix4().multiplyMatrices(T.camera.matrixWorld.clone().invert(),T.viewmodel.rig.group.matrixWorld).toArray();
      frames.push({weapon});
     }
     result.push({action,strokeControlSignature:stroke.strokeControlSignature,camera:{projectionMatrix:T.camera.projectionMatrix.toArray(),fov:T.camera.fov,aspect:T.camera.aspect,viewport},frames});
    }
    return result;
   },viewport);
   replays.push(...batch);
  }
  assert.deepEqual(errors,[],'Unexpected runtime errors');
  return replays;
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}

async function Main() {
 const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg,true]:[arg.slice(0,i),arg.slice(i+1)];}));
 let replays;
 if(args['--trace']){
  const input=JSON.parse(fs.readFileSync(args['--trace']));
  replays=input.replays||(input.sourceFrames?[{action:'Light',frames:input.sourceFrames,camera:input.camera,strokeControlSignature:input.strokeControlSignature}]:[input]);
 }else replays=await CollectRuntimeProjections();
 const reports=replays.map(replay=>EvaluateDadaoProjection(replay));
 const out=path.join(path.dirname(fileURLToPath(import.meta.url)),'_shots','FpsDadaoProjection');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'Data_FpsDadaoProjectionAcceptance.json'),JSON.stringify({pass:reports.every(r=>r.pass),reports},null,2));
 if(args['--export-source'])fs.writeFileSync(path.join(out,'Data_FpsDadaoProjectionSource.json'),JSON.stringify({replays}));
 console.log(JSON.stringify(reports.map(({action,camera,diagonalAngleDeg,monotonicRatio,maximumCollapseRun,lowerLeftSamples,failures})=>({action,viewport:camera.viewport,diagonalAngleDeg,monotonicRatio,maximumCollapseRun,lowerLeftSamples,failures})),null,2));
 if(!args['--report-only'])assert(reports.every(r=>r.pass),reports.flatMap(r=>r.failures.map(f=>`${r.action} ${r.camera.viewport.width}x${r.camera.viewport.height}: ${f}`)).join('\n'));
 console.log(reports.every(r=>r.pass)?'PASS Dadao actual camera-space diagonal, silhouette and lower-left follow-through':'FAIL Dadao projection conformity');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await Main();
