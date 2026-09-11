import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8081/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of [[1000,900,false],[390,844,true]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),cdp=await page.context().newCDPSession(page),report={width,height,touch,checks:[],errors:[],samples:[]};reports.push(report);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
  async function Input(down,t){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:down?'touchStart':'touchEnd',touchPoints:down?[{x:t.screen.x,y:t.screen.y}]:[]});else if(down){await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down();}else await page.mouse.up();}
  const Surface=()=>page.evaluate(()=>{
    const c=__EarSpaDebug.view.chunks.find(c=>c.id===2),s=c.body.surface,p=c.mesh.geometry.attributes.position.array,alive=c.body.anchors.filter(a=>a.alive);
    return{state:c.state,remaining:alive.length,bend:c.body.bend,stretch:s.maxStretch,renderDelta:Math.max(...p.map((v,i)=>Math.abs(v-c.original[i]))),attachedError:Math.max(0,...alive.map(a=>Math.hypot(...s.points[a.node].map((v,k)=>v-a.rest[k])))),vertices:p.length/3,position:c.mesh.position.toArray(),geometry:Array.from(p)};
  });
  try{
    await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);
    let probe=await Probe();const original=probe.targets.find(c=>c.id===2);
    Check(probe.targets.filter(c=>!c.fine).every(c=>c.physics.solver==='xpbd-shell'&&c.physics.nodes===65),'all visible deposits use the physical shell');
    Check(probe.targets.filter(c=>c.fine).every(c=>c.physics.solver==='rigid-grain'),'microdebris keeps its small-particle solver');
    await page.screenshot({path:path.join(here,'_dev/Shot_SoftWaxRest_'+width+'.png')});
    await Input(true,original);
    for(const frames of [6,6,6,6,10,36]){await Step(frames);const s=await Surface();const{geometry,...sample}=s;report.samples.push(sample);if(s.remaining>2&&s.remaining<13&&s.bend>.2){await page.screenshot({path:path.join(here,'_dev/Shot_SoftWaxPeeling_'+width+'.png')});}}
    Check(report.samples.some(s=>s.remaining>2&&s.remaining<13&&s.renderDelta>.07&&s.bend>.2&&s.attachedError<.05),'actual pointer force bends the rendered body while its remaining attachment points stay seated');
    let s=await Surface();Check(s.remaining===2&&s.state==='peeling','spoon loosens the wet layer while preserving its two final attachments');
    Check(s.vertices===original.vertices&&s.stretch<.15,'deformation retains surface detail with bounded extension');
    await page.screenshot({path:path.join(here,'_dev/Shot_SoftWaxFold_'+width+'.png')});
    const bent=s.bend;await Input(false);await Step(200);s=await Surface();
    Check(['attached','returning'].includes(s.state)&&s.bend<bent*.45,'letting go physically returns the uncollected layer');
    await page.screenshot({path:path.join(here,'_dev/Shot_SoftWaxReturn_'+width+'.png')});
    await page.locator('[data-tool="tweezers"]').click();const before=await Surface();await Input(true,(await Probe()).targets.find(c=>c.id===2));const after=await Surface();
    Check((await Probe()).active===2&&after.geometry.every((v,i)=>Math.abs(v-before.geometry[i])<1e-5),'tweezers can regrip during recovery without resetting or snapping the surface');
    await Step(110);probe=await Probe();Check(probe.targets.find(c=>c.id===2).state==='held'&&probe.cleanliness===0,'forceps detach the same body without awarding collection early');
    await Input(false);await Step(230);probe=await Probe();Check(probe.harvest.filter(c=>c.id===2).length===1&&probe.cleanliness>0,'the deformed body can be carried out and counted once on landing');
    Check(probe.stats.triangles<=180000&&probe.stats.drawCalls<=120,'shell skinning stays inside the existing rendering budget');
    Check(report.errors.length===0,'no browser, shader or asset errors');console.log('PASS soft wax '+width+' '+report.checks.length+' real '+(touch?'touch':'mouse')+' checks');
  }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev/Shot_SoftWaxFailure_'+width+'.png')});throw error;}
  finally{await fs.writeFile(path.join(here,'_dev/Data_SoftWaxPlayReport.json'),JSON.stringify(reports,null,2));await page.close();}
}}finally{await browser.close();}
