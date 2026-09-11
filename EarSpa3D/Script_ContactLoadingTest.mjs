import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const compare=process.argv.find(a=>a.startsWith('--compare='))?.slice(10);
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={checks:[],runs:[]},captures=[],Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
 for(const revision of compare?[compare,null]:[null]){
  const page=await browser.newPage({viewport:{width:1000,height:900}}),run={revision:revision||'working',errors:[]};report.runs.push(run);
  page.on('pageerror',e=>run.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')run.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)run.errors.push(r.status()+' '+r.url());});
  if(revision){for(const name of ['Script_ChunkGame.js','Script_ImmersiveScene.js','Script_ToolContact.js','Script_TactileMaterials.js','Script_ContactOcclusion.js','Script_PeelPhysics.mjs','Script_SoftWaxPhysics.mjs']){
   const body=execFileSync('git',['show',revision+':EarSpa3D/'+name],{cwd:root,encoding:'utf8'});await page.route('**/'+name+'*',route=>route.fulfill({contentType:'text/javascript',body}));
  }}
  await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='Animate'?0:native(callback);});
  const boot=performance.now();await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:120000});run.bootMs=performance.now()-boot;
  run.start=await page.evaluate(()=>{const{view}=__EarSpaDebug,before=view.chunks.map(c=>c.mesh.geometry.uuid),t=performance.now();document.getElementById('ear-start').click();return{ms:performance.now()-t,reused:before.every((id,i)=>id===view.chunks[i].mesh.geometry.uuid)};});
  if(!revision)Check(run.start.reused,'starting the first service reuses the already prepared geometry');
  await page.evaluate(()=>{const{view,core}=__EarSpaDebug;view.Update(2);view.ToggleLamp();view.Update(0);core.renderer.shadowMap.enabled=false;core.Render();});
  run.motion=await page.evaluate(()=>{const{view}=__EarSpaDebug,result=[];
   for(const id of ['scoop','feather','brush']){const points=view.chunks.slice(0,6).map(c=>view.Project(c.origin));for(let i=0;i<12;i++)view.Hover(points[i%6].x,points[i%6].y,id);const times=[];
    for(let i=0;i<60;i++){const p=points[i%6],t=performance.now();view.Hover(p.x,p.y,id);times.push(performance.now()-t);}times.sort((a,b)=>a-b);result.push({id,median:times[30],p95:times[57],collision:view.CollisionProbe()});
   }view.HideTool();return result;
  });
  run.drag=await page.evaluate(()=>{const {view}=__EarSpaDebug,c=view.chunks[4],p=view.Project(c.origin),times=[];view.Grip(c,p.x,p.y,'scoop');
   for(let i=0;i<80;i++){const at=performance.now();view.Drag(c,p.x,p.y,1/240,.03);times.push(performance.now()-at);}view.Ungrip(c);view.HideTool();times.sort((a,b)=>a-b);
   const bytes=new Uint8Array(c.mesh.geometry.attributes.position.array.buffer);let hash=2166136261;for(const value of bytes)hash=Math.imul(hash^value,16777619);
   return{median:times[40],p95:times[76],geometryHash:hash>>>0,position:c.body.position,rotation:c.body.rotation,anchors:c.body.anchors.filter(a=>a.alive).length};
  });
  if(!revision){
   run.cache=await page.evaluate(async()=>{const T=await import('three'),{CreateToolContact}=await import('./Script_ToolContact.js'),profile=await(await fetch('./Data_CanalProfile.json')).json(),contact=CreateToolContact(profile),group=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.2,.2,.2));group.add(mesh);const p=new T.Vector3(0,0,5),q=new T.Quaternion(),samples=contact.Samples(group);
    contact.Clearance(p,q,samples);const before=contact.Probe();contact.Clearance(p,q,contact.Samples(group));const after=contact.Probe();
    mesh.position.x=1;const moved=contact.Samples(group);contact.Clearance(p,q,moved);const transformed=contact.Probe();
    mesh.geometry.attributes.position.setX(0,2);mesh.geometry.attributes.position.needsUpdate=true;const edited=contact.Samples(group);contact.Clearance(p,q,edited);const updated=contact.Probe();
    const custom=[new T.Vector3()];const a=contact.Clearance(p,q,custom);custom[0].x=4;const b=contact.Clearance(p,q,custom);
    let maximum=0;for(let i=0;i<500;i++){const points=Array.from({length:8},(_,j)=>new T.Vector3(Math.sin(i+j)*3,Math.cos(i-j)*3,(i%90)*.23));let minimum=Infinity,normal=null;for(const v of points){const result=contact.Surface(v);if(result.clearance<minimum){minimum=result.clearance;normal=result.normal.clone();}}const result=contact.Clearance(new T.Vector3(),q,points);maximum=Math.max(maximum,Math.abs(minimum-result.minimum),normal?normal.distanceTo(result.normal):0);}
    mesh.geometry.dispose();mesh.material.dispose();return{before,after,transformed,updated,movedInvalidated:moved!==samples,editedInvalidated:edited!==moved,customChanged:a.minimum!==b.minimum,maximum};
   });
   Check(run.cache.after.reusedClearances===run.cache.before.reusedClearances+1,'identical managed geometry and pose reuse the exact clearance');
   Check(run.cache.movedInvalidated&&run.cache.editedInvalidated&&run.cache.updated.clearanceChecks===run.cache.before.clearanceChecks+2,'jaw transforms and edited vertices invalidate cached poses');
   Check(run.cache.customChanged&&run.cache.maximum<1e-10,'custom mutable samples and 500 exhaustive minimum/normal comparisons stay exact');
  }
  run.customers=[];
  for(const seed of [20260912,20260915,20260914]){
   const data=await page.evaluate(async seed=>{const {view,core}=__EarSpaDebug;view.HideTool();view.chunks[0].wetting=.9;view.Update(3);
    const old=view.chunks,oldGeometry=old[0].mesh.geometry,oldArray=Array.from(oldGeometry.attributes.position.array),before=core.scene.children.length;
    const prepareAt=performance.now();if(view.PrepareCustomer)await view.PrepareCustomer(seed);const prepareMs=performance.now()-prepareAt;
    const unchanged=view.chunks===old&&before===core.scene.children.length&&oldArray.every((v,i)=>v===oldGeometry.attributes.position.array[i]);
    const at=performance.now();view.Reset(seed);const resetMs=performance.now()-at;view.Enter();view.Update(2);const renderAt=performance.now();core.Render();const firstRenderMs=performance.now()-renderAt;
    function Hash(array){let h=2166136261;for(const value of new Uint8Array(array.buffer,array.byteOffset,array.byteLength))h=Math.imul(h^value,16777619);return h>>>0;}
    const geometry=view.chunks.map(c=>({id:c.id,type:c.type,tone:c.tone,mass:c.mass,position:c.origin.toArray(),rotation:c.rotation.toArray(),p:Hash(c.mesh.geometry.attributes.position.array),n:Hash(c.mesh.geometry.attributes.normal.array),index:Hash(c.mesh.geometry.index.array),physics:Hash(new TextEncoder().encode(JSON.stringify(c.body)))}));
    const gl=core.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let binary='';for(let i=0;i<pixels.length;i+=8192)binary+=String.fromCharCode(...pixels.subarray(i,i+8192));
    return{seed,prepareMs,resetMs,firstRenderMs,unchanged,geometry,pixelHash:Hash(pixels),pixels:btoa(binary),memory:{...core.renderer.info.memory},programs:core.renderer.info.programs.length,preparation:view.PreparationProbe?.()};
   },seed);captures.push(Buffer.from(data.pixels,'base64'));delete data.pixels;run.customers.push(data);
   await page.screenshot({path:path.join(here,'_dev','Shot_ContactLoading_'+(revision?'Baseline':'Current')+'_'+seed+'.png')});
   if(!revision){Check(data.unchanged,'preparing '+seed+' keeps the active customer untouched');Check(data.preparation.preparedResets===run.customers.length,'prepared customer '+seed+' is adopted without rebuilding');}
  }
  if(!revision){
   run.cancellation=await page.evaluate(async()=>{const{view}=__EarSpaDebug,old=view.chunks;const abandoned=view.PrepareCustomer(1);
    const deadline=performance.now()+10000;while(view.PreparationProbe().stagedChunks===0){if(performance.now()>deadline)throw Error('background preparation did not start');await new Promise(resolve=>setTimeout(resolve,10));}
    const partial=view.PreparationProbe(),final=view.PrepareCustomer(2),at=performance.now(),urgent=view.PrepareCustomer(2,{urgent:true});const cancelled=await abandoned,ready=await final;const urgentMs=performance.now()-at,staged=view.PreparationProbe();view.CancelPreparation();return{cancelled,ready,partial,samePromise:final===urgent,urgentMs,staged,empty:view.PreparationProbe(),same:old===view.chunks};});
   Check(!run.cancellation.cancelled&&run.cancellation.partial.stagedChunks>0&&!run.cancellation.partial.ready&&run.cancellation.ready&&run.cancellation.same&&run.cancellation.empty.stagedChunks===0,'partially built and completed cancellations release staging without changing the customer');
   Check(run.cancellation.samePromise,'an urgent request upgrades the same pending customer without restarting it');
   // Go through the real timeout/receipt/day progression, including clicks while a preparation is still pending.
   for(let day=0;day<3;day++){
    await page.evaluate(()=>{const {view,core}=__EarSpaDebug;view.HideTool();const render=core.Render;core.Render=()=>{};try{__EarSpaDebug.StepFrames(3600);__EarSpaDebug.StepFrames(3600);__EarSpaDebug.StepFrames(3600);__EarSpaDebug.StepFrames(2000);}finally{core.Render=render;core.Render();}});
    await page.locator('#receipt-next').click();await page.waitForFunction(()=>__EarSpaDebug.Probe().phase==='playing');
   }
   Check(await page.evaluate(()=>__EarSpaDebug.shop.state.totalCustomers===3&&__EarSpaDebug.shop.day>=2),'asynchronous receipt transitions pay once per service and advance into another day');
  }
  await page.screenshot({path:path.join(here,'_dev','Shot_ContactLoading_'+(revision?'Baseline':'Current')+'.png')});
  Check(run.errors.length===0,(revision||'current')+' has no browser, shader or resource errors');console.log(JSON.stringify({revision:run.revision,bootMs:run.bootMs,start:run.start,motion:run.motion,customers:run.customers.map(({geometry,...r})=>r)}));await page.close();
 }
 if(compare){const[a,b]=report.runs;
  Check(a.drag.geometryHash===b.drag.geometryHash&&JSON.stringify(a.drag.position)===JSON.stringify(b.drag.position)&&JSON.stringify(a.drag.rotation)===JSON.stringify(b.drag.rotation)&&a.drag.anchors===b.drag.anchors,'80 force steps preserve deformation vertices, body pose and anchor breakage exactly');
  report.pixels=[];
  for(let i=0;i<a.customers.length;i++){
   Check(JSON.stringify(a.customers[i].geometry)===JSON.stringify(b.customers[i].geometry),'seed '+a.customers[i].seed+' preserves every geometry/normal/index byte and the complete physical body');
   const before=captures[i],after=captures[i+3];let sum=0,changed=0;for(let k=0;k<before.length;k+=4){let maximum=0;for(let j=0;j<3;j++){const d=Math.abs(before[k+j]-after[k+j]);sum+=d;maximum=Math.max(maximum,d);}if(maximum>8)changed++;}
   const difference={seed:a.customers[i].seed,meanChannelDifference:sum/(before.length/4*3),fractionOver8:changed/(before.length/4)};report.pixels.push(difference);
   // Separate WebGL contexts have subpixel/MSAA rounding variation even for an unchanged revision.
   Check(difference.meanChannelDifference<.05&&difference.fractionOver8<.001,'seed '+difference.seed+' preserves the image within subpixel rasterization tolerance');
  }
 }
 console.log('PASS '+report.checks.length+' contact and loading regressions');
}finally{await fs.writeFile(path.join(here,'_dev/Data_ContactLoadingReport.json'),JSON.stringify(report,null,2));await browser.close();}
