import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {InstrumentContact} from './Script_InstrumentInteraction.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const profiles=process.argv.includes('--desktop')?[[1000,900,false]]:[[1000,900,false],[390,844,true],[320,568,true],[844,390,true]];
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of profiles){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),cdp=await page.context().newCDPSession(page);
 const report={width,height,touch,checks:[],errors:[],motion:[]};reports.push(report);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
 let down=false;
 async function Input(type,p={x:0,y:0},right=false){
  if(type==='up'&&!down)return;if(type==='down')down=true;if(type==='up')down=false;
  if(touch)await cdp.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{x:p.x,y:p.y}]});
  else{if(type!=='up')await page.mouse.move(p.x,p.y);if(type==='down')await page.mouse.down({button:right?'right':'left'});if(type==='up')await page.mouse.up({button:right?'right':'left'});}
 }
 async function Start(){await Input('up');await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);}
 async function Select(tool){await Input('up');await page.locator('[data-tool="'+tool+'"]').click();}
 async function Target(id){let t=(await Probe()).targets.find(c=>c.id===id);if((await page.locator('#depth-toggle').getAttribute('aria-pressed')==='true')!==(t.depth>10)){await page.locator('#depth-toggle').click();await Step(90);t=(await Probe()).targets.find(c=>c.id===id);}return t;}
 async function Rotate(id,predicate){
  const t=await Target(id),normal=await page.evaluate(id=>__EarSpaDebug.view.chunks.find(c=>c.id===id).normal.toArray(),id);
  if(touch)await page.locator('#mode-turn').click();await Input('down',t.screen,true);
  const pivot=(await Probe()).rendering.toolPosition;let aligned=false;
  for(let i=0;i<100;i++){if(predicate(InstrumentContact('scoop',(await Probe()).rendering.toolRotation,normal))){aligned=true;break;}await Step(3);}
  Check(aligned,'rotation can select the requested spoon face');Check((await Probe()).rendering.toolPosition.every((v,i)=>Math.abs(v-pivot[i])<1e-6),'right rotation preserves its safe pivot');
  await Input('up',t.screen,true);if(touch)await page.locator('#mode-force').click();
 }
 async function Swipe(t,fraction=1,steps=20,onStep=null){
  for(let i=1;i<=steps;i++){
   const p={x:t.screen.x+(t.pullScreen.x-t.screen.x)*fraction*i/steps,y:t.screen.y+(t.pullScreen.y-t.screen.y)*fraction*i/steps};
   await Input('move',p);await Step(6);if(onStep)await onStep(p);
   const c=(await Probe()).targets.find(c=>c.id===t.id);if(c.state==='held'||c.state==='fractured')return c;
  }return(await Probe()).targets.find(c=>c.id===t.id);
 }
 async function Soften(id){const t=await Target(id);await Select('drops');await Input('down',t.screen);await Input('up');await Step(195);}
 async function ToolScreen(){return page.evaluate(async()=>{const T=await import('three'),p=__EarSpaProbe();return __EarSpaDebug.view.Project(new T.Vector3().fromArray(p.rendering.toolPosition));});}
 try{
  await Start();let t=await Target(0);await Input('down',t.screen);await Step(90);let p=await Probe();
  Check(p.active===0&&p.targets[0].physics.anchors===9&&p.targets[0].physics.force<1e-5&&p.fractures===0,'stationary left hold applies no automatic extraction force');
  const initialTool=await ToolScreen(),initialRotation=p.rendering.toolRotation;
  let fractured=await Swipe(t,.65,20,async cursor=>{
   const p=await Probe(),actual=await ToolScreen(),expected={x:initialTool.x+cursor.x-t.screen.x,y:initialTool.y+cursor.y-t.screen.y};
   const error=Math.hypot(actual.x-expected.x,actual.y-expected.y);
   report.motion.push({cursor,actual,error,force:p.targets[0].physics.force,bend:p.targets[0].physics.bend,anchors:p.targets[0].physics.anchors,triangles:p.stats.triangles,drawCalls:p.stats.drawCalls});
  });
  Check(Math.max(...report.motion.map(m=>m.error))<3,'spoon follows both pointer axes without snapping back to wax');
  Check(report.motion.every(m=>m.triangles<=180000&&m.drawCalls<=120),'scraping and fracture stay within the rendering budget');
  Check((await Probe()).rendering.toolRotation.every((v,i)=>Math.abs(v-initialRotation[i])<1e-7),'scraping preserves the user-selected spoon rotation');
  Check(fractured.state==='fractured'&&fractured.physics.cutSection&&fractured.physics.anchors>0,'strongly adhered material breaks at a stress section before wall bonds release');
  p=await Probe();let children=p.targets.filter(c=>String(c.id).startsWith('0.'));
  Check(children.length===2&&Math.abs(children.reduce((s,c)=>s+c.mass,0)-.9)<1e-8,'one physical section creates two mass-conserving children');
  Check(children.reduce((s,c)=>s+c.physics.anchors,0)===fractured.physics.anchors,'children inherit exactly the surviving wall bonds');
  Check(p.cleanliness===0&&p.harvest.length===0,'fracturing awards no collection');
  await page.screenshot({path:path.join(here,'_dev/Shot_CohesiveSection_'+width+'.png')});
  const toolBefore=(await Probe()).rendering.toolPosition,count=p.fractures;await Step(100);p=await Probe();
  Check(p.fractures===count&&p.rendering.toolPosition.every((v,i)=>Math.abs(v-toolBefore[i])<1e-7),'stationary spoon remains still after fracture and does not automatically re-grab children');
  await Input('up');await Step(120);children=(await Probe()).targets.filter(c=>String(c.id).startsWith('0.'));
  Check(children.every(c=>c.physics.maxStretch<.12&&c.physics.bend<.2),'attached fragments settle without remeshing explosions or artificial spreading');
  report.fragments=await page.evaluate(async()=>{
   const {PeelAnchorPoint}=await import('./Script_PeelPhysics.mjs');
   return __EarSpaDebug.view.chunks.filter(c=>c.fragment&&c.body.surface).map(c=>({id:c.id,maxAnchorError:Math.max(0,...c.body.anchors.filter(a=>a.alive).map(a=>Math.hypot(...PeelAnchorPoint(c.body,a).map((v,i)=>v-a.rest[i]))))}));
  });
  Check(report.fragments.every(c=>c.maxAnchorError<.05),'inherited material points stay seated at their original wall locations');
  const residue=children[0];await Soften(residue.id);await Select('tweezers');t=await Target(residue.id);await Input('down',t.screen);await Step(130);
  Check((await Probe()).targets.find(c=>c.id===residue.id).state==='held','an inherited anchored fragment can be softened and removed');
  await Input('up');await Step(230);Check((await Probe()).harvest.filter(c=>c.id===residue.id).length===1,'fragment mass is counted once after actual landing');
  // Restore a fresh service for reversed-face contact, then for softened extraction.
  await Start();await Rotate(0,c=>c.facing<-.8);t=await Target(0);await Input('down',t.screen);await Swipe(t,.7);await Input('up');await Step(90);p=await Probe();
  Check(p.targets[0].physics.anchors===9&&p.fractures===0&&p.cleanliness===0,'the convex back cannot scrape, detach or fracture wax even while moving');
  await page.screenshot({path:path.join(here,'_dev/Shot_CohesiveBackFace_'+width+'.png')});
  await Start();await Soften(0);await Select('scoop');t=await Target(0);await Input('down',t.screen);await Step(60);
  Check((await Probe()).targets[0].physics.anchors===9,'softening does not turn a stationary spoon into automatic extraction');
  const soft=await Swipe(t,1,24);Check(soft.state==='held'&&(await Probe()).cleanliness===0,'the same softened material can be peeled intact by real pointer displacement');
  await page.screenshot({path:path.join(here,'_dev/Shot_CohesiveSoftLift_'+width+'.png')});
  await Input('up');await Step(230);p=await Probe();Check(p.harvest.filter(c=>c.id===0).length===1,'release carries softened wax out and counts it exactly once on landing');
  // A complete service verifies that stronger adhesion and inherited residues cannot strand the economy.
  for(const original of p.targets.filter(c=>!c.fine&&c.id!==0)){
   await Soften(original.id);await Select('tweezers');t=await Target(original.id);await Input('down',t.screen);await Step(130);p=await Probe();
   Check(p.targets.find(c=>c.id===original.id).state==='held','softened forceps extraction remains playable for '+original.id);
   await Input('up');await Step(230);
  }
  for(let guard=0;guard<16;guard++){const next=(await Probe()).targets.find(c=>c.fine&&c.state==='attached');if(!next)break;await Select('feather');t=await Target(next.id);await Input('down',t.screen);await Step(110);await Input('up');await Step(230);}
  // 当前结算镜头会平滑进入独立盘面特写，等待转场结束后检查稳定视图。
  await Step(120);p=await Probe();
  Check(p.phase==='complete'&&!p.timedOut&&Math.abs(p.cleanliness-1)<1e-8,'real pointer/touch play completes a full service with all mass collected');
  Check(p.stats.triangles<=180000&&p.stats.drawCalls<=120,'settled collection view stays within the rendering budget');
  Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout fits the viewport');
  Check(report.errors.length===0,'no console, shader, resource or uncaught errors');
  report.final={phase:p.phase,cleanliness:p.cleanliness,stats:p.stats};await page.screenshot({path:path.join(here,'_dev/Shot_CohesiveComplete_'+width+'.png')});
  console.log('PASS cohesive scraping '+width+'×'+height+': '+report.checks.length+' real '+(touch?'touch':'mouse')+' checks');
 }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev/Shot_CohesiveFailure_'+width+'.png')});throw error;}
 finally{await fs.writeFile(path.join(here,'_dev/Data_CohesiveScrapingPlayReport.json'),JSON.stringify(reports,null,2));await page.close();}
}}finally{await browser.close();}
