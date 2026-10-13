import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);assert.ok(url,'pass --url= for this worktree');
const width=Number(process.argv.find(a=>a.startsWith('--width='))?.slice(8)||1280),height=width===1280?720:900;
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const page=await browser.newPage({viewport:{width,height}}),out=path.join(here,'_dev');await fs.mkdir(out,{recursive:true});
const report={checks:[],errors:[],width,height,evidence:'Natural seeded case layouts. Only time is stepped. Extraction, softening, rotation, withdrawal, landing and submission use real mouse/keyboard input.'};
const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
let cursor={x:width*.5,y:height*.5};
async function Rebase(){await page.mouse.move(-10,-10);const p=await Probe();cursor={x:p.stage.x+p.rendering.toolScreen.x,y:p.stage.y+p.rendering.toolScreen.y};await page.mouse.move(cursor.x,cursor.y);}
async function MoveToWorld(target,count=80){
  await Rebase();
  for(let i=0;i<count;i++){
    const command=await page.evaluate(({target,left})=>{
      const p=__EarSpaProbe(),camera=__EarSpaDebug.core.camera,m=camera.matrixWorld.elements,forward=[-m[8],-m[9],-m[10]],delta=target.map((x,k)=>x-p.rendering.toolPosition[k]);
      const next=camera.position.clone().fromArray(p.rendering.toolPosition.map((x,k)=>x+delta[k]/left)),screen=__EarSpaDebug.view.Project(next);
      return{x:screen.x+p.stage.x-(p.input.offset?.x||0),y:screen.y+p.stage.y-(p.input.offset?.y||0),screen,depth:delta.reduce((sum,x,k)=>sum+x*forward[k],0)/left};
    },{target,left:count-i});
    if(command.x<width*.1||command.x>width*.87||command.y<height*.12||command.y>height*.89){await Rebase();const p=await Probe();command.x=command.screen.x+p.stage.x-(p.input.offset?.x||0);command.y=command.screen.y+p.stage.y-(p.input.offset?.y||0);}
    cursor={x:command.x,y:command.y};await page.mouse.move(cursor.x,cursor.y);if(Math.abs(command.depth)>.0005)await page.mouse.wheel(0,command.depth/.004);await Step(1);
  }
  return Probe();
}
async function Select(id){await page.locator(`[data-tool="${id}"]`).click();await Step(1);await page.locator('#ear-canvas').focus();}
async function PracticeCase(id){await page.locator('#settings-open').click();await page.locator('#case-practice-type').selectOption(id);await page.locator('#case-practice-start').click();await Step(150);}
async function Shot(name){await page.screenshot({path:path.join(out,`Shot_Case${name}_${width}.png`)});}
async function LandHeld(id,steps=14){
  Check((await Probe()).active===id,'target '+id+' stays held before withdrawal');
  for(let i=0;i<steps;i++){await page.mouse.wheel(0,-200);await Step(3);}
  await page.keyboard.press('KeyT');await Step(75);Check((await Probe()).precision.trayView,'target '+id+' reaches tray view after physical withdrawal');
  const tray=await page.evaluate(()=>__EarSpaDebug.core.scene.getObjectByName('Model_Tray').position.toArray());
  await MoveToWorld([tray[0],tray[1]+5,tray[2]],90);await page.keyboard.up('Space');await Step(90);
  Check((await Probe()).harvest.some(c=>c.id===id),'target '+id+' is counted only after actual tray contact');
}
async function DrySheet(){
  await Select('scoop');const rim=await page.evaluate(()=>{const c=__EarSpaDebug.view.chunks.find(c=>c.id===3);return{normal:c.normal.toArray(),point:c.body.surface.points[49].map((x,i)=>x+c.normal.toArray()[i]*.08)};});
  await MoveToWorld(rim.point,90);await page.keyboard.down('Space');await Step(12);Check((await Probe()).active===3,'scoop contacts the actual dry-sheet rim');
  const start=(await Probe()).rendering.toolPosition;await MoveToWorld(start.map((x,i)=>x+rim.normal[i]*.7),140);
  Check((await Probe()).targets.find(c=>c.id===3).physics.detached,'rim peeling physically detaches the dry sheet');
  await LandHeld(3);
}
async function SoftenedForceps(id,{deep=false,dose=true}={}){
  const target=(await Probe()).targets.find(c=>c.id===id);
  if(dose){await Select('drops');await MoveToWorld(target.position,deep?130:80);await page.keyboard.down('Space');await Step(210);await page.keyboard.up('Space');}
  Check((await Probe()).targets.find(c=>c.id===id).softened>.6,'nozzle contact softens target '+id);
  await Select('tweezers');await page.keyboard.down('KeyE');await Step(deep?77:34);await page.keyboard.up('KeyE');
  if(deep){await Rebase();await page.mouse.down({button:'right'});await page.mouse.move(cursor.x+25,cursor.y);await Step(1);await page.mouse.up({button:'right'});}
  await MoveToWorld(target.position,deep?130:80);Check((await page.evaluate(()=>__EarSpaDebug.view.ForcepsProbe()))?.jawContact,'both tips contact target '+id);
  await page.keyboard.down('Space');await Step(18);Check((await Probe()).active===id,'actual jaw closure grips target '+id);
  const normal=await page.evaluate(id=>__EarSpaDebug.view.chunks.find(c=>c.id===id).normal.toArray(),id),start=(await Probe()).rendering.toolPosition;
  await MoveToWorld(start.map((x,i)=>x+normal[i]*1.1),110);Check((await Probe()).targets.find(c=>c.id===id).physics.detached,'controlled pull detaches target '+id);
  Check(!(await Probe()).careCase.complete,'carrying a target does not prematurely complete the request');
  await LandHeld(id,deep?23:14);
}
try{
  await page.goto(url+(url.includes('?')?'&':'?')+'debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.locator('#ear-start').click();await Step(150);
  let p=await Probe();report.version=p.version;const original=p,coins=p.shop.coins;
  Check(p.careCase.id==='drySheet','first business visit has the dry-sheet request');
  await page.locator('#case-details').click();const elapsed=(await Probe()).elapsed;await Step(120);Check((await Probe()).elapsed===elapsed,'reading the case pauses service time');await page.locator('#case-resume').click();
  await PracticeCase('drySheet');Check(await page.locator('#case-submit').isDisabled(),'submission is disabled before actual collection');await Shot('DryStart');
  await DrySheet();p=await Probe();
  Check(p.careCase.complete&&p.careCase.optional&&p.cleanliness===.1&&p.phase==='playing','intact sheet completes the request at actual 10% cleanliness without forcing an exit');
  await Step(120);Check((await Probe()).phase==='playing','completed goals leave time for optional cleaning');await Shot('DryReady');
  await page.locator('#case-submit').click();Check((await Probe()).phase==='complete'&&(await Probe()).shop.coins===coins,'practice submission completes without paying business money');
  await page.locator('#receipt-retry').click();await Step(150);Check((await Probe()).careCase.id==='drySheet'&&!(await Probe()).careCase.complete,'retry resets the current case and its goal');
  await PracticeCase('softenedWax');await Select('drops');await MoveToWorld((await Probe()).targets.find(c=>c.id===2).position,80);
  await page.keyboard.down('Space');await Step(50);await page.keyboard.up('Space');
  Check((await Probe()).targets.find(c=>c.id===2).softened<.1,'dense sticky case has a meaningful soak period');
  await DrySheet();p=await Probe();Check(!p.careCase.complete&&p.careCase.goals[1].complete,'dry-sheet collection during soaking leaves the sticky objective open');
  Check(p.targets.find(c=>c.id===2).softened>.3,'softening continues while another target is physically treated');
  await page.keyboard.press('KeyT');await Step(550);await SoftenedForceps(2,{dose:false});p=await Probe();Check(p.careCase.complete&&p.careCase.optional&&Math.abs(p.cleanliness-.2)<1e-8,'softened sticky wax plus dry sheet completes exactly 20% actual mass');
  await page.locator('#case-submit').click();await page.locator('#receipt-next').click();await Step(150);p=await Probe();
  Check(p.careCase.id==='deepBend','next case follows the selected 1 → 2 → 5 sequence');
  const deep=p.targets.find(c=>c.id===8);Check(deep.depth>14.4&&deep.depth<14.8,'deep case target is physically behind the bend');
  Check(!await page.evaluate(()=>__EarSpaDebug.view.CanReach(__EarSpaDebug.view.chunks.find(c=>c.id===8),'scoop')),'short scoop cannot reach the deep target');
  await page.locator('#depth-toggle').click();await Step(150);await Shot('DeepStart');
  await SoftenedForceps(8,{deep:true});p=await Probe();
  Check(p.careCase.complete&&p.careCase.optional&&Math.abs(p.cleanliness-.1)<1e-8,'deep goal completes with the entrance wax still present');
  Check(p.targets.filter(c=>!['fractured','exhausted'].includes(c.state)).reduce((s,c)=>s+c.mass,0)>8.999999,'deep extraction preserves total material mass');await Shot('DeepReady');
  await page.locator('#case-submit').click();await page.locator('#settings-open').click();await page.locator('#practice-return').click();await Step(1);p=await Probe();
  Check(!p.practice&&p.careCase.id===original.careCase.id&&p.cleanliness===original.cleanliness&&p.shop.coins===coins,'return restores business case, mass and coins');
  Check(p.targets.every((c,i)=>JSON.stringify(c.position)===JSON.stringify(original.targets[i].position)),'return restores the original physical scene');
  await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);Check((await Probe()).careCase===null,'original free practice stays goal-free');
  await page.locator('#settings-open').click();await page.locator('#practice-return').click();
  for(let i=0;i<11;i++)await Step(3600);p=await Probe();Check(p.phase==='complete'&&p.timedOut&&!p.careCase.complete,'timeout closes an incomplete business case');
  Check(p.shop.log[0].caseBonus===0,'incomplete timeout does not pay a case bonus');
  await page.locator('#receipt-next').click();await page.waitForFunction(()=>__EarSpaProbe().phase==='playing',null,{timeout:60000});await Step(150);p=await Probe();
  Check(p.careCase?.id==='softenedWax'||p.earType==='oily','next business customer uses its own case and prepared layout');
  Check(p.stats.triangles<=180000&&p.stats.drawCalls<=120,'case interface preserves scene rendering budget');
  Check(report.errors.length===0,'no browser, shader or asset errors');
  console.log('PASS '+report.checks.length+' real-input care-case checks at '+width);
}catch(error){report.failure=error.stack;report.probe=await Probe().catch(()=>null);await Shot('Failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,`Data_CareCasesReport_${width}.json`),JSON.stringify(report,null,2));await browser.close();}
