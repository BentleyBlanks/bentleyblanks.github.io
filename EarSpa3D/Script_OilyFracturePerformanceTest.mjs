import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8157/EarSpa3D/',label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)||'Current';
const touch=process.argv.includes('--touch'),width=touch?390:1000,height=touch?844:900,inputX=width*.7,inputY=height*5/9;
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),report={checks:[],errors:[],bites:[]};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
const page=await browser.newPage({viewport:{width,height},isMobile:touch,hasTouch:touch}),cdp=await page.context().newCDPSession(page);
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
async function Down(){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:inputX,y:inputY}]});else{await page.mouse.move(inputX,inputY);await page.mouse.down();}}
async function Move(x,y){if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await page.waitForFunction(({x,y})=>Math.abs(window.oilPointer?.x-x)<1&&Math.abs(window.oilPointer?.y-y)<1,{x,y});}else await page.mouse.move(x,y);}
async function Up(){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>{requestAnimationFrame=()=>0;document.querySelector('#ear-canvas').addEventListener('pointermove',e=>window.oilPointer={x:e.clientX,y:e.clientY});});
 await page.locator('#welcome-settings').click();await page.locator('#practice-type').selectOption('oily');await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
 await page.locator('[data-tool="tweezers"]').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(1));
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 for(let attempt=0;attempt<3;attempt++){
  if(attempt){await page.locator('#settings-open').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));await page.locator('[data-tool="tweezers"]').click();}
  // Place the working jaws on a deterministic deposit; all loading below uses
  // actual pointer displacement, with the cursor deliberately away from it.
  const setup=await page.evaluate(()=>{const v=__EarSpaDebug.view;for(const c of v.chunks.filter(c=>c.id===0&&c.body.gel.cells&&c.mass>0)){
   v.SetToolDrag(false);v.ShowTool(c,'tweezers',0,v.Project(c.mesh.position));v.SetToolDrag(true);v.ShowTool(c,'tweezers',0,v.Project(c.mesh.position));const hit=v.PickTool('tweezers');
   if(hit){const p=v.Targets().find(t=>t.id===hit.id);return{id:hit.id,dx:p.pullScreen.x-p.screen.x,dy:p.pullScreen.y-p.screen.y};}
  }return null;});Check(!!setup,'working jaws contact oil '+attempt);
  await Down();
  await page.evaluate(()=>__EarSpaDebug.StepFrames(15));
  Check(await page.evaluate(id=>__EarSpaProbe().active===id,setup.id),'stationary jaws hold mother film without tearing '+attempt);
  const times=[];let bite=null;
  for(let i=1;i<=80;i++){
   await Move(inputX+setup.dx*i/45,inputY+setup.dy*i/45);
   const frame=await page.evaluate(id=>{const c=__EarSpaDebug.view.chunks.find(c=>c.id===id),steps=c.body.steps,start=performance.now();__EarSpaDebug.StepFrames(1);const cpu=performance.now()-start;__EarSpaDebug.core.renderer.getContext().finish();const gpu=performance.now()-start,p=__EarSpaProbe();return{cpu,gpu,sourceSteps:c.body.steps-steps,active:p.active,bite:p.targets.find(c=>c.id===p.active&&c.form==='oilyBite')};},setup.id);times.push(frame);
   if(frame.bite){bite=frame.bite;break;}
  }
  Check(!!bite,'real jaw motion tears a local piece '+attempt);Check(bite.mass>0&&bite.mass<=.32+1e-8,'bite mass stays within .32 '+attempt);
  Check(times.at(-1).sourceSteps===4,'fracture advances mother exactly four 240 Hz substeps '+attempt);
  const held=await page.evaluate(()=>{const frames=[];for(let i=0;i<70;i++){const start=performance.now();__EarSpaDebug.StepFrames(1);const cpu=performance.now()-start;__EarSpaDebug.core.renderer.getContext().finish();frames.push({cpu,gpu:performance.now()-start});}return{frames,probe:__EarSpaProbe()};});
  Check(held.probe.active===bite.id&&held.probe.targets.filter(c=>c.form==='oilyBite').length===1,'continued hold does not tear mother again '+attempt);
  Check(held.probe.targets.filter(c=>c.mass>0).every(c=>c.physics.minJacobian>0&&Math.abs(c.physics.volumeRatio-1)<.06),'both sides retain positive volume '+attempt);
  report.bites.push({id:bite.id,mass:bite.mass,fracture:times.at(-1),loading:times.map(({cpu,gpu})=>({cpu,gpu})),held:held.frames});
  if(attempt===0)await page.screenshot({path:path.join(here,'_dev/Shot_OilyFracture_'+label+'.png')});
  await Up();await page.evaluate(()=>__EarSpaDebug.StepFrames(235));
  const p=await page.evaluate(()=>__EarSpaProbe());Check(p.harvest.length===1&&p.tray.count===1,'one release scores and stores one piece '+attempt);
 }
 const {profile}=await cdp.send('Profiler.stop');await fs.writeFile(path.join(here,'_dev/Data_OilyFracture_'+label+'.cpuprofile'),JSON.stringify(profile));
 const ids=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(const id of profile.samples||[]){const n=ids.get(id),key=n.callFrame.functionName+' '+n.callFrame.url.split('/').at(-1)+':'+n.callFrame.lineNumber;counts.set(key,(counts.get(key)||0)+1);}report.hotspots=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,25);
 const Summary=a=>{a.sort((a,b)=>a-b);return{median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};report.summary={fractureCpuMs:report.bites.map(b=>b.fracture.cpu),loadingCpuMs:Summary(report.bites.flatMap(b=>b.loading.map(f=>f.cpu))),heldCpuMs:Summary(report.bites.flatMap(b=>b.held.map(f=>f.cpu))),heldGpuMs:Summary(report.bites.flatMap(b=>b.held.map(f=>f.gpu)))};
 const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11);
 if(baseline){const prior=JSON.parse(await fs.readFile(baseline,'utf8')).summary,Mean=a=>a.reduce((s,x)=>s+x,0)/a.length;Check(Mean(report.summary.fractureCpuMs)<Mean(prior.fractureCpuMs)*.75,'mean fracture time improves at least 25 percent');Check(report.summary.heldCpuMs.median<prior.heldCpuMs.median*.75,'median held frames improve at least 25 percent');}
 Check(report.errors.length===0,'no browser, shader or resource errors');console.log('PASS oily fracture',JSON.stringify(report.summary));console.log(JSON.stringify(report.hotspots));
}finally{await fs.writeFile(path.join(here,'_dev/Data_OilyFracture_'+label+'.json'),JSON.stringify(report,null,2));await browser.close();}
