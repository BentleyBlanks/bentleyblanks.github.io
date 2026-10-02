import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);assert(url,'Pass --url=http://127.0.0.1:PORT/EarSpa3D/');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const report={checks:[],errors:[],stages:[]},Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{
  const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>cb.name==='Animate'?0:raf(cb);
  window.shaderAudit={links:0,waits:[]};
  for(const name of ['linkProgram','getProgramInfoLog']){const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{if(name==='linkProgram')shaderAudit.links++;else shaderAudit.waits.push(performance.now()-start);}};}
 });
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:120000});
 Check(await page.evaluate(()=>__EarSpaProbe().rendering.slimeKernel.backend==='wasm-f64'),'browser uses f64 WASM solver');
 const Snapshot=async label=>{const value=await page.evaluate(()=>{const result={...shaderAudit,programs:__EarSpaDebug.core.renderer.info.programs.length,keys:__EarSpaDebug.core.renderer.info.programs.map(p=>({id:p.id,key:p.cacheKey}))};shaderAudit.links=0;shaderAudit.waits=[];return result;});report.stages.push({label,...value});return value;};
 await Snapshot('boot');
 await page.locator('#welcome-settings').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
 for(const id of ['scoop','brush','feather','drops','suction','tweezers']){await page.locator('[data-tool="'+id+'"]').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(1));}
 const tools=await Snapshot('all tools');Check(tools.links===0,'all six tools reuse precompiled programs, including glass backsides');
 report.normals=await page.evaluate(async()=>{
  const {UpdatePackedNormals}=await import('./Script_VertexNormals.mjs');let checked=0,maxError=0;
  __EarSpaDebug.core.scene.traverse(object=>{
   if(!object.userData.softFiber)return;
   const geometry=object.geometry.clone(),p=geometry.attributes.position;
   for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+Math.sin(i*.07)*.04);
   const direct=new Float32Array(p.array.length);UpdatePackedNormals(p.array,geometry.index.array,direct);geometry.computeVertexNormals();
   for(let i=0;i<direct.length;i++)maxError=Math.max(maxError,Math.abs(direct[i]-geometry.attributes.normal.array[i]));checked++;geometry.dispose();
  });return{checked,maxError};
 });
 Check(report.normals.checked>=2&&report.normals.maxError===0,'deformed brush and feather normals match Three bit for bit');
 await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('oily');await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
 const oil=await Snapshot('first oil');Check(oil.links===0,'first oil reuses precompiled programs');
 await page.evaluate(()=>{const {core}=__EarSpaDebug;for(const enabled of [false,true,false,true]){core.renderer.shadowMap.enabled=enabled;__EarSpaDebug.StepFrames(1);}});
 const shadow=await Snapshot('shadow toggle');Check(shadow.links===0,'shadow toggles reuse precompiled programs');
 await page.evaluate(async()=>{const {ResolveRenderQuality}=await import('./Data_RenderQuality.mjs'),{core,view}=__EarSpaDebug,base=__EarSpaProbe().renderQuality;for(const wetness of ['off','high']){const quality=ResolveRenderQuality({...base,wetness});core.SetRenderQuality(quality);view.SetRenderQuality(quality);__EarSpaDebug.StepFrames(1);}});
 const wet=await Snapshot('wetness toggle');Check(wet.links===0,'wetness toggles reuse precompiled programs');
 Check(report.errors.length===0,'no shader or browser errors');
 const fallback=await browser.newPage({viewport:{width:1000,height:900}});
 await fallback.route('**/Script_SlimeKernel.wasm*',route=>route.fulfill({contentType:'application/wasm',body:'unavailable kernel'}));
 await fallback.goto(url+'?debug=1');await fallback.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:120000});
 Check(await fallback.evaluate(()=>__EarSpaProbe().rendering.slimeKernel.backend==='javascript-f64'),'invalid/unavailable WASM falls back to the JS solver and starts normally');await fallback.close();
 console.log('PASS runtime warmup',JSON.stringify(report.stages.map(s=>({label:s.label,links:s.links,maxWait:Math.max(0,...s.waits)}))));
}finally{await fs.writeFile(path.join(here,'_dev/Report_RuntimeWarmup.json'),JSON.stringify(report,null,2));await browser.close();}
