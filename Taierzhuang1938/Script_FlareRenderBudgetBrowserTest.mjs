// Actual CH4, actual FlareDirector flights, and complete rendered-frame counts.
// Render and count EVERY 60 Hz simulation frame plus whole CSM cycles at edges.
// Sparse Main frames accumulate CSM dirty levels and are not game-equivalent.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {SCENE_RENDER_LIMITS} from './Data_AssetStandards.mjs';

const root=path.resolve(import.meta.dirname,'..');
const baselineRoot=process.argv.find(arg=>arg.startsWith('--baseline-root='))?.slice('--baseline-root='.length);
const sourceRoot=baselineRoot?path.resolve(baselineRoot):root;
const stressCity=process.argv.includes('--stress-city');
const label=(process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)||'Current').replace(/[^A-Za-z0-9_-]/g,'_');
const out=path.join(root,'tmp','FlareRenderBudget',label);
await fs.mkdir(out,{recursive:true});
const Git=(...args)=>execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
const identity={label,fixture:stressCity?'stress-city':'normal-game',sourceRoot,head:Git('rev-parse','HEAD'),statusBefore:Git('status','--short'),startedAt:new Date().toISOString(),servedModules:{}};
const tracked=new Set(['Script_Main.mjs','Script_Post.mjs','Script_Flare.mjs','Script_FlareShadows.mjs','Script_FlareShadowBounds.mjs','Script_FlareShadowInstances.mjs','Script_InstanceFrustumScope.mjs','Script_StaticInstanceCulling.mjs','Script_ShadowInstanceCulling.mjs','Script_PostPrepass.mjs','Script_PropBatch.mjs','Script_MaterialPatches.mjs','Script_ShadowCasterBatch.mjs','Script_ClusteredLights.mjs','Script_PostTaa.mjs','Data_Tuning_Shadows.mjs','Data_Tuning_FlareEffects.mjs','Data_Tuning_Graphics.mjs','Data_AssetStandards.mjs']);
const server=await ServeRoot(sourceRoot,0),browser=await LaunchBrowser();
const errors=[],moduleReads=[];
let report=null;
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.exposeFunction('FlareBudgetResize',(width,height)=>page.setViewportSize({width,height}));
 await page.exposeFunction('FlareBudgetProgress',message=>console.log('FlareRenderBudgetBrowserTest',message));
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,800));});
 page.on('response',response=>{
  const url=new URL(response.url()),name=path.posix.basename(url.pathname);
  if(!tracked.has(name)||!url.pathname.startsWith('/Taierzhuang1938/'))return;
  moduleReads.push(response.body().then(bytes=>{identity.servedModules[name]={url:url.pathname+url.search,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};}));
 });
 await page.addInitScript(()=>{
  localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));
  localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));
 });
 console.log('FlareRenderBudgetBrowserTest loading CH4 high',JSON.stringify({label,head:identity.head}));
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?phase=4&quality=high&manual=1&menu=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.state?.ready,null,{timeout:600000});
 await page.locator('#bootStart').click();
 report=await page.evaluate(async({limits,stressCity})=>{
  const T=await import('three'),g=Tengxian,r=g.renderer,gl=r.getContext(),dt=1/60,rows=[],plans=[],launchAttempts=[];
  g.graphics.autoQuality=false;g.ApplyGraphics();
  // Match BootTest's 120 REAL gameplay frames before pausing. This establishes
  // the actual player eye, pose and native LOD instead of the constructor camera.
  const beforePrelude=g.state.elapsed;
  if(!stressCity)g.StepFrames(120,dt,true);
  const gamePrelude={frames:stressCity?0:120,elapsedBefore:beforePrelude,elapsedAfter:g.state.elapsed,playerAlive:g.player.Alive,playerPosition:g.player.position.toArray()};
  if(!stressCity&&(!g.player.Alive||g.state.elapsed-beforePrelude<1.9))throw new Error('Normal game prelude must run alive for 120 gameplay frames');
  const bootCamera={position:g.camera.position.toArray(),quaternion:g.camera.quaternion.toArray(),fov:g.camera.fov,near:g.camera.near,far:g.camera.far,zoom:g.camera.zoom,aspect:g.camera.aspect};
  const bootEnvironment=g.editor.host.game.GetEnvironmentState();
  // Opening the EMPTY tools panel pauses combat without entering SceneEditor.
  // SceneEditor would replace the game's projection with FOV55/far2000 and fit
  // CSM twice per frame; neither behavior belongs in this game budget fixture.
  g.editor.TogglePanel(true);if(stressCity)g.Debug.ApplySky('firstLevelNight');g.ApplyGraphics();
  if(!g.post.taaEnabled||!g.post.preset.flareShadows)throw new Error('The high profile must retain default TAA and flare shadows');
  // An empty inspector legitimately pauses combat while Main still owns the
  // single shadow-frustum update. SceneEditor itself would add another update.
  if(!g.editor.Capturing||g.editor.active)throw new Error('Empty inspector must own the frozen camera');
  const Pose=(eye,target)=>{
   g.camera.position.set(...eye);g.camera.lookAt(...target);
   const e=new T.Euler().setFromQuaternion(g.camera.quaternion,'YXZ');g.editor.flycam.yaw=e.y;g.editor.flycam.pitch=e.x;
   g.post.NotifyCameraCut();
  };
  if(g.camera.fov!==bootCamera.fov||g.camera.near!==bootCamera.near||g.camera.far!==bootCamera.far||g.camera.zoom!==bootCamera.zoom)throw new Error('Freeze UI must preserve the normal game projection');
  const forward=new T.Vector3();g.camera.getWorldDirection(forward);
  const flatForward=new T.Vector3(forward.x,0,forward.z).normalize(),right=new T.Vector3(-flatForward.z,0,flatForward.x);
  const initialEye=stressCity?[210,1.8,-62]:[...bootCamera.position];
  const initialTarget=stressCity?[235,3,-65]:initialEye.map((value,i)=>value+forward.getComponent(i)*25);
  let activePassCounts=null;
  const originalRenders=g.post.passes.map(pass=>({pass,render:pass.Render}));
  for(const {pass,render} of originalRenders)pass.Render=function(ctx){
   const calls=r.info.render.calls,triangles=r.info.render.triangles;
   const result=render.call(this,ctx);
   if(activePassCounts)activePassCounts[this.name]={calls:r.info.render.calls-calls,triangles:r.info.render.triangles-triangles};
   return result;
  };
  // Editor owns the camera and freezes combat. Preserve the production order:
  // Director -> normal actor view/LOD policy -> full Vfx -> Main's editor frame.
  // AiDirector normally runs CullActors inside Update; the editor gate skips
  // that update, so explicitly retain the SAME production view policy here.
  // No direct source position, phase, age, intensity or projection overrides.
  const Advance=(step,caseName,reason)=>{
   const before=g.flare.clock;g.flare.Update(step);g.ai.CullActors(g.camera);g.vfx.Update(step,g.camera,g.state.elapsed+step);g.sky.Update(g.state.elapsed+step);
   const priorUpdates=g.post.flareShadowsPass.stats.updates,priorCsmFrame=g.lights.csm.frame;
   const infoAuto=r.info.autoReset;
   r.info.autoReset=false;r.info.reset();activePassCounts={};
   try{g.StepFrames(1,step,true);}finally{r.info.autoReset=infoAuto;}
   if(Math.abs(g.flare.clock-before-step)>1e-7)throw new Error('Flare time has more than one owner');
   const pass=g.post.flareShadowsPass,csm=g.lights.csm,shadowActive=g.post.lastRenderedPasses.includes('flareShadows');
   const counted=Object.values(activePassCounts).reduce((sum,value)=>({calls:sum.calls+value.calls,triangles:sum.triangles+value.triangles}),{calls:0,triangles:0});
   rows.push({case:caseName,reason,budgetEligible:caseName!=='Warmup',frame:g.state.frame,time:g.flare.clock,calls:r.info.render.calls,triangles:r.info.render.triangles,passCounts:activePassCounts,
    camera:{position:g.camera.position.toArray(),fov:g.camera.fov,near:g.camera.near,far:g.camera.far},
    outsidePostPasses:{calls:r.info.render.calls-counted.calls,triangles:r.info.render.triangles-counted.triangles},
    sources:g.flare.flares.map(f=>({id:f.id,preset:f.presetId,t:f.t,phase:f.phase,x:f.pos.x,y:f.pos.y,z:f.pos.z,intensity:f.intensity,obstructed:f.launchObstructed,landed:f.landed})),
    shadow:{maps:pass.stats.maps,updates:pass.stats.updates-priorUpdates,faces:shadowActive?pass.stats.renderedFaces:0,calls:shadowActive?pass.stats.calls:0,triangles:shadowActive?pass.stats.triangles:0,
     layouts:pass.slots.filter(s=>s.source&&s.valid).map(s=>s.cone?'adaptive':'cube')},
    actorLod:g.ai.soldiers.reduce((counts,s)=>{counts[s.renderLod||'unclassified']=(counts[s.renderLod||'unclassified']||0)+1;return counts;},{}),
    csm:{frame:csm.frame,updates:csm.frame-priorCsmFrame,active:csm.active,enabled:csm.enabled,userEnabled:csm.userEnabled,nearBakeAllowed:csm.nearBakeAllowed,nearEveryFrame:csm.nearEveryFrame,bakeTriangles:csm.bakeTriangles,scheduled:[...csm.lastScheduled]},taa:g.post.lastRenderedPasses.includes('taa'),passes:[...g.post.lastRenderedPasses]});
   activePassCounts=null;
  };
  const Cycle=(caseName,reason)=>{
   const csm=g.lights.csm,cycle=csm.nearEveryFrame?Math.max(1,csm.count-1):csm.preset.bakeOrder.length;
   // Include both slots' ordinary alternation even when CSM is in a 1-frame mode.
   for(let i=0;i<cycle*2;i++)Advance(0,caseName,reason);
  };
  // Match BootTest's real rendered prelude. CSM's adaptation lock advances on
  // rendered frames, so sparse simulation cannot substitute for this warmup.
  if(stressCity)for(let i=0;i<120;i++)Advance(dt,'Warmup','normal-warm');
  Cycle('BootCameraBaseline','steady-cycle-before-pose');
  Pose(initialEye,initialTarget);
  Advance(0,'Baseline','first-camera-pose');
  for(let i=0;i<120;i++)Advance(dt,'Baseline','settle-after-pose');
  Cycle('Baseline','steady-cycle');
  const Launch=(preset,offset=0)=>{
   const Point=(distance,side)=>({x:initialEye[0]+flatForward.x*distance+right.x*side,z:initialEye[2]+flatForward.z*distance+right.z*side});
   const candidates=stressCity?[{from:{x:210,z:-62},at:{x:235+offset,z:-65}},{from:{x:210,z:-50},at:{x:235+offset,z:-50}},{from:{x:220,z:-62},at:{x:245+offset,z:-65}}]
    :[8,16,24,32,48].flatMap(distance=>[0,6,-6,12,-12].map(side=>({from:Point(distance,side),at:Point(distance+25,side+offset)})));
   for(const spec of candidates){
    const id=g.flare.LaunchFlare({preset,...spec}),f=g.flare.flares.find(f=>f.id===id);
    const accepted=!!(f&&!f.launchObstructed&&(!f.landing||f.landing.t>f.outAt+.05));
    launchAttempts.push({preset,...spec,id,accepted,obstructed:f?.launchObstructed,landingAt:f?.landing?.t,landingSurface:f?.landing?.surface,outAt:f?.outAt});
    if(accepted){
     const plan={id,preset,...spec,ignitedAt:f.ignitedAt,burnAt:f.burnAt,fadeAt:f.fadeAt,outAt:f.outAt,clearAt:f.clearAt,endAt:f.endAt,landing:f.landing};plans.push(plan);return plan;
    }
    if(id)g.flare.Abort(id);
   }
   throw new Error('No genuinely unobstructed '+preset+' launch found in actual city');
  };
  const Run=async(caseName,presets)=>{
   await FlareBudgetProgress('measuring '+caseName);
   g.flare.Reset();Pose(initialEye,initialTarget);g.post.NotifyCameraCut();
   const localPlans=presets.map((preset,i)=>Launch(preset,i*10));
   const edgeTimes=localPlans.flatMap(p=>[0,.03,.07,p.ignitedAt,p.burnAt,p.fadeAt,p.outAt,p.clearAt,p.landing?.t,p.endAt]).filter(Number.isFinite);
   const edgeSteps=new Set(edgeTimes.flatMap(t=>[-1,0,1].map(k=>Math.max(0,Math.round(t/dt)+k))));
   const stop=Math.max(...localPlans.map(p=>p.endAt))+.5,total=Math.ceil(stop/dt);
   Cycle(caseName,'launch-cycle');
   for(let step=1;step<=total;step++){
    const reason=edgeSteps.has(step)?'phase-edge':'full-flight-frame';
    Advance(dt,caseName,reason);
    if(edgeSteps.has(step)&&step%3===0)Cycle(caseName,'edge-cycle');
    if(stressCity?presets.length===2&&step===360:step===(presets[0]==='SignalRed'?60:360)){
     Cycle(caseName,'ordinary-dual-cycle');
     const active=g.flare.flares.filter(f=>f.intensity>0),airTarget=active.reduce((sum,f)=>sum.add(new T.Vector3(f.pos.x,f.pos.y,f.pos.z)),new T.Vector3()).multiplyScalar(1/active.length).toArray();
     if(!active.length)throw new Error('Look-up must target an actual burning flare');
     Pose(initialEye,stressCity?[185,3,-59]:airTarget);Advance(0,caseName,'first-camera-cut');Cycle(caseName,'camera-cut-cycle');
     // Real viewport resize invokes Main's normal render-scale/TAAU sizing.
     await FlareBudgetResize(1024,720);g.ApplyGraphics();g.post.NotifyCameraCut();
     Advance(0,caseName,'first-resize');Cycle(caseName,'resize-cycle');
     await FlareBudgetResize(1280,720);g.ApplyGraphics();Pose(initialEye,initialTarget);
     Advance(0,caseName,'first-return');Cycle(caseName,'return-cycle');
    }
   }
   await FlareBudgetProgress('completed '+caseName+' through '+stop.toFixed(3)+'s');
   return {case:caseName,plans:localPlans,steps:total,stop,remaining:g.flare.flares.length};
  };
  const cases=[];
  for(const [name,presets] of [['Illumination',['Illumination']],['SignalRed',['SignalRed']],['DualIllumination',['Illumination','Illumination']]])cases.push(await Run(name,presets));
  g.flare.Reset();Cycle('Cleanup','cleared');
  for(const {pass,render} of originalRenders)pass.Render=render;
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {limits,fixture:stressCity?'stress-city':'normal-game',viewport:{width:1280,height:720},dt,gamePrelude,bootCamera,bootEnvironment,initialEye,initialTarget,launchAttempts,gameProjection:{fov:g.camera.fov,near:g.camera.near,far:g.camera.far,zoom:g.camera.zoom},
   simulationOwner:'empty tools panel freezes combat; normal game projection; production Director/CullActors/Vfx/Main ordering',profile:g.GraphicsProfile.Inspect().profile,
   environment:g.editor.host.game.GetEnvironmentState(),defaultTaa:g.post.taaEnabled,cases,plans,rows,
   batch:{members:g.shadowCasterBatch.stats.members,groups:g.shadowCasterBatch.live.length,warm:g.state.shadowBatchWarm},
   gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gl:gl.getError()};
 },{limits:SCENE_RENDER_LIMITS,stressCity});
 await Promise.all(moduleReads);
 identity.statusAfter=Git('status','--short');identity.finishedAt=new Date().toISOString();
 const peaks=Object.fromEntries([...new Set(report.rows.map(row=>row.case))].map(name=>{
  const rows=report.rows.filter(row=>row.case===name),maxTriangles=rows.reduce((a,b)=>a.triangles>b.triangles?a:b),maxCalls=rows.reduce((a,b)=>a.calls>b.calls?a:b);
  return [name,{renders:rows.length,maxTriangles,maxCalls}];
 }));
 const failures=report.rows.flatMap((row,index)=>row.budgetEligible&&(row.calls>SCENE_RENDER_LIMITS.drawCalls||row.triangles>SCENE_RENDER_LIMITS.triangles)
  ?[{row:index,case:row.case,reason:row.reason,time:row.time,calls:row.calls,triangles:row.triangles}]:[]);
 await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify({identity,peaks,failures,report,errors},null,2));
 console.log('FlareRenderBudgetBrowserTest measured',JSON.stringify({head:identity.head,peaks:Object.fromEntries(Object.entries(peaks).map(([name,p])=>[name,{renders:p.renders,triangles:p.maxTriangles.triangles,calls:p.maxCalls.calls,peakTime:p.maxTriangles.time,peakReason:p.maxTriangles.reason,peakShadow:p.maxTriangles.shadow}])),overBudgetFrames:failures.length,gl:report.gl,errors,output:path.join(out,'Data_Report.json')}));
 assert.equal(report.profile,'high');assert.equal(report.environment.name,stressCity?'firstLevelNight':report.bootEnvironment.name);assert.equal(report.defaultTaa,true);
 assert.ok(report.rows.every(row=>row.taa),'Every measured full frame must retain default TAA');
 assert.ok(report.rows.every(row=>row.csm.updates===1),'Main must own exactly one CSM fit per measured frame');
 assert.ok(report.cases.every(c=>c.remaining===0),'Both physical flights must reach their actual cleanup');
 const dual=report.rows.filter(row=>row.case==='DualIllumination'&&row.time>5&&row.time<8);
 assert.ok(dual.some(row=>row.shadow.maps===2&&row.shadow.updates===1),'Ordinary dual lights must exercise the one-source refresh budget');
 assert.ok(dual.some(row=>row.shadow.updates===2),'A changed dual-light view must exercise immediate two-source refresh');
 assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 assert.equal(failures.length,0,'Actual flare full frames must stay within SCENE_RENDER_LIMITS; see '+path.join(out,'Data_Report.json'));
 console.log('FlareRenderBudgetBrowserTest passed');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
