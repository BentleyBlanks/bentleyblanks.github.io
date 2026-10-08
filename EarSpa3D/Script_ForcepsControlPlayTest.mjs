import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
assert.ok(url,'pass --url= for this worktree preview');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
const Distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
try{for(const [width,height,touch] of [[1000,900,false],[390,844,true],[320,568,true],[844,390,true]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch}),cdp=await page.context().newCDPSession(page);
 const report={width,height,checks:[],errors:[]};reports.push(report);
 const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);};
 const Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Probe=()=>page.evaluate(()=>__EarSpaProbe());
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 async function Down(x,y){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else{await page.mouse.move(x,y);await page.mouse.down();}}
 async function Move(x,y){if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await page.waitForFunction(({x,y})=>Math.abs(window.__ForcepsPointer?.x-x)<1&&Math.abs(window.__ForcepsPointer?.y-y)<1,{x,y});}else await page.mouse.move(x,y);}
 async function Up(){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
 try{
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;document.querySelector('#ear-canvas').addEventListener('pointermove',e=>window.__ForcepsPointer={x:e.clientX,y:e.clientY});});
  await page.locator('#welcome-settings').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);
  await page.locator('[data-tool="tweezers"]').click();await Step(1);
  // A deterministic, softened wet-wax fixture isolates grip acquisition from
  // navigation and diffusion. All approach, grip, pull and release use real input.
  const setup=await page.evaluate(()=>{
   const v=__EarSpaDebug.view,c=v.chunks[2];c.wetting=c.softened=1;
   v.SetToolDrag(false);v.ShowTool(c,'tweezers',0,v.Project(c.mesh.position));v.SetToolDrag(true);v.ShowTool(c,'tweezers',0,v.Project(c.mesh.position));
   return{contact:v.ForcepsProbe(),position:v.RenderingProbe().toolPosition,anchors:c.body.anchors.filter(a=>a.alive).length};
  });
  Check(setup.contact?.id===2&&!setup.contact.jawContact,'fixture touches only one side of wet wax');
  let x=width*.55,y=height*.5;await Down(x,y);await Step(45);let p=await Probe();
  Check(p.active===null&&!p.events.some(e=>e.type==='grab'),'one-sided touch does not latch a false grip');
  Check(p.targets[2].physics.anchors===setup.anchors&&p.cleanliness===0,'one-sided stationary touch causes no damage or score');
  Check(Distance(setup.position,p.rendering.toolPosition)<.001,'approaching wax never snaps the instrument');
  Check((await page.locator('#pull-label').textContent()).includes('还没夹住'),'approach feedback explains how to continue');
  await page.screenshot({path:path.join(here,'_dev/Shot_ForcepsApproach_'+width+'.png')});
  for(let i=0;i<45;i++){
   x+=3*height/900;await Move(x,y);await Step(1);p=await Probe();if(p.active!==null)break;
  }
  Check(p.active===2&&p.targets[2].jawContact&&p.targets[2].aligned,'same held gesture slides into a real two-sided grip');
  Check(p.events.filter(e=>e.type==='grab').length===1,'approach latches exactly once without releasing');
  const held=await page.evaluate(()=>{const v=__EarSpaDebug.view,c=v.chunks[2];return{gaps:c.jawGaps.slice(),offset:c.toolOffset.toArray(),audit:v.AuditTool()};});
  report.held=held;
  Check(Math.hypot(...held.offset)>.05,'grip follows the contacted jaw section, not the tool origin');
  Check(held.audit.fieldMinimum>=-.012&&held.audit.meshMinimum>=-.05,'closed full instrument clears the canal');
  await Step(40);p=await Probe();
  Check(p.active===2&&!p.targets[2].physics.detached,'stationary grip remains latched without automatic extraction');
  Check(await page.evaluate(gaps=>__EarSpaDebug.view.chunks[2].jawGaps.every((v,i)=>v===gaps[i]),held.gaps),'deforming wax does not reopen or resize latched jaws');
  await page.screenshot({path:path.join(here,'_dev/Shot_ForcepsGrip_'+width+'.png')});
  const pull=await page.evaluate(()=>{const v=__EarSpaDebug.view,c=v.chunks[2],r=v.RenderingProbe(),point=c.normal.clone().fromArray(r.toolPosition),a=v.Project(point),b=v.Project(point.addScaledVector(c.normal,2.8));return{x:b.x-a.x,y:b.y-a.y};});
  for(let i=0;i<60;i++){
   x+=pull.x/45;y+=pull.y/45;await Move(x,y);await Step(5);p=await Probe();if(p.targets[2].physics.detached)break;
  }
  Check(p.targets[2].physics.detached&&p.active===2,'actual dragging detaches and holds wet wax');
  Check(p.cleanliness===0,'holding detached wax cannot score before landing');
  Check(p.fractures===0,'softened wet wax survives a controlled pull');
  await Up();await Step(250);p=await Probe();
  Check(p.harvest.some(c=>c.id===2),'release carries wet wax out and lands it in the tray');
  Check(Math.abs(p.cleanliness-p.harvest.reduce((sum,c)=>sum+c.mass,0)/9)<1e-8,'cleanliness matches only landed mass');
  Check(p.rendering.toolVisible&&!p.rendering.draggingTool&&p.active===null,'delivery returns the parked tool with input released');
  await page.screenshot({path:path.join(here,'_dev/Shot_ForcepsDelivered_'+width+'.png')});
  Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'controls fit the viewport');
  Check(report.errors.length===0,'no browser, shader or resource errors');
  console.log('PASS forceps controls '+width+': '+report.checks.length+' checks');
 }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev/Shot_ForcepsFailure_'+width+'.png')});throw error;}finally{await page.close();}
}}finally{await fs.writeFile(path.join(here,'_dev/Data_ForcepsControlReport.json'),JSON.stringify(reports,null,2));await browser.close();}
