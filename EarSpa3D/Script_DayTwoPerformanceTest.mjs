import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1697,height:674},deviceScaleFactor:2}),report={checks:[],errors:[]};
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
await page.addInitScript(()=>{const native=requestAnimationFrame;window.requestAnimationFrame=cb=>native(t=>{if(!window.pauseFrames)cb(t);});});
try{
 await fs.mkdir(path.join(here,'_dev'),{recursive:true});
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
 await page.evaluate(()=>{window.pauseFrames=true;localStorage.setItem('earspa3d.shop.v1',JSON.stringify({version:2,coins:500,day:2,toolLevels:{}}));});
 await page.reload();await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>window.pauseFrames=true);
 await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();
 await page.evaluate(()=>{for(let i=0;i<150;i++)__EarSpaDebug.view.Update(1/60);});
 Check(await page.evaluate(()=>__EarSpaDebug.shop.day===2),'second-day saved game starts with the existing economy');
 report.surface=await page.evaluate(async()=>{
  const T=await import('three'),{CreateToolContact}=await import('./Script_ToolContact.js');
  const profile=await(await fetch('./Data_CanalProfile.json')).json(),contact=CreateToolContact(profile);
  const centers=profile.map(p=>new T.Vector3().fromArray(p.center)),lines=centers.slice(0,-1).map((c,i)=>new T.Line3(c,centers[i+1]));
  let seed=71236,maxDepthError=0,finite=0;const point=new T.Vector3(),nearest=new T.Vector3(),direction=new T.Vector3(),delta=new T.Vector3();
  const Rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // An independent exhaustive polyline search checks negative cells, both mouths, bends and cache eviction.
  for(let n=0;n<20000;n++){
   point.set((Rng()-.5)*40,(Rng()-.5)*40,Rng()*65-20);
   if(n<6000){const row=centers[n%centers.length];point.copy(row).add(new T.Vector3((Rng()-.5)*8,(Rng()-.5)*8,(Rng()-.5)*.8));}
   let minimum=Infinity,index=0,blend=0;
   for(let i=0;i<lines.length;i++){const t=lines[i].closestPointToPointParameter(point,true);lines[i].at(t,nearest);const d=nearest.distanceToSquared(point);if(d<minimum){minimum=d;index=i;blend=t;}}
   lines[index].at(blend,nearest);lines[index].delta(direction).normalize();const axial=delta.subVectors(point,nearest).dot(direction);
   const outside=(index===0&&blend===0&&axial<-.03)||(index===lines.length-1&&blend===1&&axial>.05),actual=contact.Surface(point);
   if(outside){if(actual.clearance!==Infinity||actual.depth!==-1)throw Error('mouth classification changed');}
   else{finite++;maxDepthError=Math.max(maxDepthError,Math.abs(actual.depth-index-blend));if(Math.abs(actual.depth-index-blend)>1e-8)throw Error('closest centerline segment changed');}
  }
  return{points:20000,finite,maxDepthError,...contact.Probe()};
 });
 Check(report.surface.finite>10000&&report.surface.maxDepthError<1e-8,'20,000 exact centerline queries match independent exhaustive searches');
 Check(report.surface.cachedCells===report.surface.cellLimit,'contact cache stays bounded after more than 8,192 cells');
 report.input=await page.evaluate(()=>{
  const{view}=__EarSpaDebug,original=view.Hover;let calls=0,last=null;
  view.Hover=(...args)=>{calls++;last=args;return original(...args);};
  const canvas=document.getElementById('ear-canvas'),rect=canvas.getBoundingClientRect();
  for(let i=0;i<40;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+420+i*3,clientY:rect.top+330,pointerId:1,pointerType:'mouse',isPrimary:true,bubbles:true}));
  const before=calls;__EarSpaDebug.StepFrames(1);const after=calls,latest=last?.slice(0,2);
  canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.left+500,clientY:rect.top+340,pointerId:1,pointerType:'mouse'}));
  window.dispatchEvent(new Event('blur'));__EarSpaDebug.StepFrames(1);
  view.Hover=original;return{before,after,latest,afterBlur:calls};
 });
 Check(report.input.before===0&&report.input.after===1&&report.input.latest[0]===537,'40 pointer events perform one collision sweep at the newest position');
 Check(report.input.afterBlur===1,'focus loss discards pending hover input');
 report.customers=await page.evaluate(()=>{
  const{view,core,shop}=__EarSpaDebug,result=[];
  for(let n=0;n<9;n++){
   if(n){shop.FinishCustomer({cleanliness01:0,comfort01:.85});shop.AdvanceCustomer();if(!shop.HasNextCustomer()){shop.NextDay();shop.StartDay();}view.Reset(shop.CurrentCustomer().waxSeed);view.Enter();}
   for(let i=0;i<150;i++)view.Update(1/60);
   const times=[];for(let i=0;i<24;i++){const start=performance.now();view.Hover(500+i*13,330+Math.sin(i*.4)*110,'scoop');times.push(performance.now()-start);}
   core.Render();times.sort((a,b)=>a-b);
   result.push({day:shop.day,seed:shop.CurrentCustomer().waxSeed,medianHoverMs:times[12],p95HoverMs:times[22],memory:{...core.renderer.info.memory},programs:core.renderer.info.programs.length,collision:view.CollisionProbe()});
  }
  return result;
 });
 Check(report.customers.at(-1).day>=4,'repeated customers cross multiple real day boundaries');
 Check(new Set(report.customers.map(c=>c.memory.geometries)).size===1&&new Set(report.customers.map(c=>c.memory.textures)).size===1,'geometry and texture counts stay constant across nine customers');
 Check(report.customers.every(c=>c.collision.cachedCells<=c.collision.cellLimit),'collision cache remains bounded across customers');
 await page.screenshot({path:path.join(here,'_dev/Shot_DayTwoPerformance.png')});
 Check(report.errors.length===0,'no page or shader errors');
 console.log('PASS '+report.checks.length+' day-two performance regressions');
}finally{await fs.writeFile(path.join(here,'_dev/Data_DayTwoPerformanceReport.json'),JSON.stringify(report,null,2));await browser.close();}
