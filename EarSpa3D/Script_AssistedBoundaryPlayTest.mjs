import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);assert.ok(url,'pass --url= for this worktree preview');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),out=path.join(here,'_dev');await fs.mkdir(out,{recursive:true});
const report={checks:[],errors:[],viewport:[1280,720],evidence:'Natural practice geometry, normal tool equipment, real pointer input. Only simulation time is stepped. Hover timing includes the full StepFrames(1), probe and render, with both page performance.now and Node wall duration.'};
const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Mass=p=>p.targets.filter(c=>!['fractured','exhausted'].includes(c.state)).reduce((s,c)=>s+c.mass,0);
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);console.log('PASS',label);};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
async function Select(id){await page.locator(`[data-tool="${id}"]`).click();await Step(1);}
async function Practice(type,caseMode=false){await page.mouse.up();await page.locator('#settings-open').click();await page.locator(caseMode?'#case-practice-type':'#practice-type').selectOption(type);await page.locator(caseMode?'#case-practice-start':'#practice-start').click();await Step(150);}
async function MeasureHover(label,id){
 const p=await Probe(),target=p.targets.find(c=>c.id===id),samples=[];
 for(const dx of [-12,-9,-6,-3,0,3,6,9,12]){
  await page.mouse.move(p.stage.x+target.screen.x+dx,p.stage.y+target.screen.y);const start=performance.now();
  const result=await page.evaluate(()=>{const start=performance.now(),p=__EarSpaDebug.StepFrames(1);return{pageMs:performance.now()-start,jawContact:__EarSpaDebug.view.ForcepsProbe()?.jawContact??false,active:p.active,blocked:p.precision.blocked};});
  samples.push({dx,...result,wallMs:performance.now()-start});
 }
 const median=key=>samples.map(s=>s[key]).sort((a,b)=>a-b)[Math.floor(samples.length/2)];
 const summary={samples,pageMedianMs:median('pageMs'),wallMedianMs:median('wallMs'),pageMaxMs:Math.max(...samples.map(s=>s.pageMs)),wallMaxMs:Math.max(...samples.map(s=>s.wallMs))};
 report.hover??={};report.hover[label]=summary;console.log('HOVER',label,JSON.stringify(summary));
 Check(samples.every(s=>s.active===null),'hovering '+label+' cannot grab or extract material');
 return summary;
}
async function Hover(){
 await Practice('mixed');await Select('tweezers');await MeasureHover('shallowWet',2);
 await Practice('deepBend',true);await page.locator('#depth-toggle').click();await Step(150);await Select('tweezers');await MeasureHover('deepWet',8);
 Check((await Probe()).cleanliness===0,'hover performance samples cannot collect material');
}
async function Oily(){
 // The lower/right coating permits an upward-facing spoon to support the bite.
 // The upper coating's downward-facing spoon intentionally retains gravity slip.
 await Practice('oily');await Select('scoop');let p=await Probe();const initial=p,source=p.targets.find(c=>c.id===1),x=p.stage.x+source.screen.x,y=p.stage.y+source.screen.y;
 Check(p.targets.length===3&&p.targets.every(c=>c.type==='oily'&&!c.fragment)&&Math.abs(Mass(p)-9)<1e-8,'natural oil coating starts as three attached volumes with total mass nine');
 await page.mouse.move(x,y);await Step(2);await page.mouse.down();await Step(18);p=await Probe();Check(p.active===source.id,'the real spoon working face acquires the natural oily coating');const anchors=p.targets.find(c=>c.id===source.id).physics.anchors;
 await Step(120);p=await Probe();Check(p.targets.length===3&&p.targets.find(c=>c.id===source.id).physics.anchors===anchors&&p.harvest.length===0,'a stationary spoon does not produce bites or release the coating');
 let distance=0;for(;distance<80&&!p.targets.some(c=>c.fragment);){distance++;await page.mouse.move(x+distance,y);await Step(1);p=await Probe();}
 const bite=p.targets.find(c=>c.fragment),mother=p.targets.find(c=>c.id===source.id);Check(bite?.physics.detached&&p.active===bite.id,'a real short hand stroke creates one physically detached oil bite');
 Check(bite.mass>0&&bite.mass<=.32&&Math.abs(mother.mass+bite.mass-3)<1e-8,'the oil bite stays within 0.32 and subtracts exactly its mass from the source');
 Check(!mother.physics.detached&&mother.physics.anchors>0&&mother.mass>0,'the remaining oily mother stays anchored to the wall');Check(Math.abs(Mass(p)-9)<1e-8&&p.harvest.length===0,'splitting preserves total mass without early collection');
 await Step(120);p=await Probe();Check(p.targets.filter(c=>c.fragment).length===1&&p.active===bite.id&&p.harvest.length===0,'holding the extracted bite still cannot keep spawning or collecting bites');
 report.oily={source:source.id,bite:bite.id,mass:bite.mass,remaining:mother.mass,strokePixels:distance,originalMass:Mass(initial)};await page.screenshot({path:path.join(out,'Shot_AssistedOilyHeld_1280.png')});
 await page.mouse.up();await Step(45);p=await Probe();Check(p.transfer?.id===bite.id&&p.transfer.age<1.5&&p.harvest.length===0,'the oily bite is visibly carried before collection');
 await Step(195);p=await Probe();Check(!p.transfer&&p.harvest.length===1&&p.harvest[0].id===bite.id&&Math.abs(p.tray.mass-bite.mass)<1e-8,'the oil bite falls into the tray and is counted exactly once');
 Check(Math.abs(Mass(p)-9)<1e-8&&!p.targets.find(c=>c.id===source.id).physics.detached,'the landing preserves full-ear mass and leaves the mother attached');await page.screenshot({path:path.join(out,'Shot_AssistedOilyLanded_1280.png')});
}
try{
 await page.addInitScript(()=>localStorage.setItem('earspa3d.calm.settings',JSON.stringify({controlScheme:'assisted',muted:true,haptics:false})));
 await page.goto(url+(url.includes('?')?'&':'?')+'debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});await page.evaluate(()=>window.requestAnimationFrame=()=>0);await page.locator('#ear-start').click();await Step(150);report.version=(await Probe()).version;
 if(!process.argv.includes('--oily'))await Hover();if(!process.argv.includes('--hover'))await Oily();Check(report.errors.length===0,'no assisted boundary browser or asset errors');
}catch(error){report.failure=error.message;report.last=await Probe().catch(()=>null);await page.screenshot({path:path.join(out,'Shot_AssistedBoundaryFailure_1280.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,process.argv.includes('--hover')?'Data_AssistedHoverReport.json':process.argv.includes('--oily')?'Data_AssistedOilyReport.json':'Data_AssistedBoundaryReport.json'),JSON.stringify(report,null,2));await browser.close();}
