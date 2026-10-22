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
const report={checks:[],errors:[],viewport:[1280,720],evidence:{natural:'Level-5 equipment fixture only. Natural mixed-practice dust and real pointer movement acquire multiple existing groups; normal release and Escape are real input.',capacityFixture:'The 12 existing, separate natural dust objects are explicitly prepared in held/detached state without changing geometry, position, mass, quality, income or targets. Release runs the production queue. This verifies a full queue, not natural acquisition of all 12 in one stroke.',interruption:'EndService is invoked directly during a controlled queue to verify the exact timeout cleanup method. It is not reported as a real 600-second UI timeout.'}};
const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Mass=p=>p.targets.filter(c=>!['fractured','exhausted'].includes(c.state)).reduce((s,c)=>s+c.mass,0);
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);console.log('PASS',label);};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
async function Practice(){await page.mouse.up();await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);await page.locator('[data-tool="feather"]').click();await Step(1);await page.evaluate(()=>__EarSpaDebug.view.SetSkins({},{feather:5}));}
async function Sweep(){const p=await Probe(),target=p.targets.find(c=>c.id==='dust5'),x=p.stage.x+target.screen.x,y=p.stage.y+target.screen.y;await page.mouse.move(x,y);await Step(2);await page.mouse.down();for(let i=1;i<=50;i++){await page.mouse.move(x+i,y);await Step(1);}return page.evaluate(()=>__EarSpaDebug.view.FeatherSweepProbe());}
async function Observe(){await page.evaluate(()=>{const view=__EarSpaDebug.view;window.__FeatherLandings=[];if(!view.__QueueOriginalUpdate)view.__QueueOriginalUpdate=view.Update;view.Update=function(dt){const landed=view.__QueueOriginalUpdate(dt);for(const c of landed)__FeatherLandings.push({id:c.id,mass:c.mass,age:view.transfer?.age??null,state:c.state});return landed;};});}
async function Drain(ids){
 const result=await page.evaluate(ids=>{const start=__EarSpaProbe().harvest.length,trace=[],failures=[];let previous=start,frames=0;for(;frames<260*ids.length+30;frames++){
  const p=__EarSpaDebug.StepFrames(1),events=__FeatherLandings;
  if(p.harvest.length-start!==events.length)failures.push('harvest without exactly one real landing event');
  if(p.transfer?.age<1.5&&p.harvest.some(c=>c.id===p.transfer.id))failures.push('current carrying item already scored');
  if(p.harvest.length-previous>1)failures.push('more than one group scored in a frame');
  if(p.harvest.length!==previous){trace.push({frame:frames,id:p.harvest.at(-1).id,harvest:p.harvest.length,age:p.transfer?.age,queued:p.transfer?.queued.length,trayMass:p.tray.mass});previous=p.harvest.length;}
  if(Math.abs(p.targets.filter(c=>!['fractured','exhausted'].includes(c.state)).reduce((s,c)=>s+c.mass,0)-9)>1e-8)failures.push('material mass changed');
  if(!p.transfer&&p.harvest.length-start===ids.length)break;
 }
 return{trace,events:__FeatherLandings,failures:[...new Set(failures)],frames,p:__EarSpaProbe()};},ids);
 Check(result.failures.length===0,'every counted group corresponds to one real landing, with no carry-time score or mass change');
 Check(ids.every(id=>result.events.filter(e=>e.id===id).length===1)&&result.events.length===ids.length,'each released group lands exactly once');
 Check(!result.p.transfer&&result.p.harvest.length===ids.length&&Math.abs(result.p.tray.mass-ids.length*.075)<1e-8,'the sequential queue drains completely with the exact collected mass');
 Check(result.trace.every((e,i)=>e.age>=1.5&&(!i||e.frame>result.trace[i-1].frame+150)),'separate groups have separate carry and gravity-drop intervals');
 await Step(240);Check((await Probe()).harvest.length===ids.length,'extra idle frames cannot score any group twice');
 return{trace:result.trace,landings:result.events,frames:result.frames};
}
async function HeldFixture(){return page.evaluate(()=>{const view=__EarSpaDebug.view,items=view.chunks.filter(c=>c.fine);for(const c of items){c.body.anchors.forEach(a=>a.alive=false);c.body.detached=true;c.state='held';c.toolId='feather';c.precisionFree=true;c.batch=[];}for(const c of items)view.Release(c);return items.map(c=>c.id);});}
try{
 await page.addInitScript(()=>localStorage.setItem('earspa3d.calm.settings',JSON.stringify({controlScheme:'assisted',muted:true,haptics:false})));
 await page.goto(url+(url.includes('?')?'&':'?')+'debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});await page.evaluate(()=>window.requestAnimationFrame=()=>0);
 await page.locator('#ear-start').click();await Step(150);report.version=(await Probe()).version;
 await Practice();Check((await Probe()).rendering.featherSweep.capacity===12,'level 5 reports capacity for 12 separate microdust groups');const natural=await Sweep();
 Check(natural.held>=3&&natural.grains===natural.held*9,'real feather movement picks up at least three natural nine-grain groups');Check((await Probe()).harvest.length===0,'holding the natural groups does not score');
 report.naturalPickup=natural;await page.screenshot({path:path.join(out,'Shot_FeatherQueueHeld_1280.png')});await Observe();await page.mouse.up();await Step(1);let p=await Probe();
 Check(p.transfer?.queued.length===natural.held-1&&p.transfer.queued.length>0,'real pointer release starts one transfer and queues the other groups');report.naturalQueue=await Drain(natural.ids);
 await Practice();const cancelled=await Sweep();await page.keyboard.press('Escape');await Step(100);p=await Probe();
 Check(cancelled.held>=3&&!p.transfer&&p.rendering.featherSweep.held===0&&p.harvest.length===0&&p.tray.mass===0,'Escape drops genuinely held groups locally without collection');Check(Math.abs(Mass(p)-9)<1e-8,'cancel preserves all nine mass units');
 await Practice();const fixture=await HeldFixture();await Observe();p=await Probe();
 Check(fixture.length===12&&p.transfer.queued.length===11&&p.harvest.length===0,'explicit held-object fixture starts all 12 separate queue entries without scoring');report.fullQueue=await Drain(fixture);
 await Practice();await HeldFixture();await Step(45);await page.evaluate(()=>__EarSpaDebug.view.EndService());await Step(150);p=await Probe();
 Check(!p.transfer&&p.harvest.length===0&&p.tray.mass===0&&Math.abs(Mass(p)-9)<1e-8,'timeout cleanup before first landing clears all 12 without collection or mass loss');
 await Practice();await HeldFixture();await Step(220);p=await Probe();Check(p.harvest.length===1&&p.transfer?.queued.length===10&&p.transfer.age<1.5,'interruption fixture includes one real landed item and eleven still uncollected');await page.evaluate(()=>__EarSpaDebug.view.EndService());await Step(240);p=await Probe();
 Check(!p.transfer&&p.harvest.length===1&&Math.abs(p.tray.mass-.075)<1e-8&&Math.abs(Mass(p)-9)<1e-8,'timeout cleanup retains the prior landing and awards none of the remaining eleven');
 await page.screenshot({path:path.join(out,'Shot_FeatherQueueInterrupted_1280.png')});Check(report.errors.length===0,'no feather queue browser or asset errors');
}catch(error){report.failure=error.message;report.last=await Probe().catch(()=>null);await page.screenshot({path:path.join(out,'Shot_FeatherQueueFailure_1280.png')}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(out,'Data_FeatherQueuePlayReport.json'),JSON.stringify(report,null,2));await browser.close();}
