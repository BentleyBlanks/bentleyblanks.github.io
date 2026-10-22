import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);assert(url,'Pass --url=...');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const report={checks:[],errors:[],samples:[]},Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>cb.name==='Animate'?0:raf(cb);});
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:120000});
 const Step=async n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
 await page.locator('#ear-start').click();await Step(150);
 let initial=await page.evaluate(()=>__EarSpaProbe().rendering);report.initial=initial;
 Check(initial.lampEquipment.level===1&&!initial.lampEquipment.mounted&&initial.lampIntensity===55,'new career starts with weak fixed lamp');
 await page.mouse.move(530,280);await Step(1);await page.mouse.move(740,400);await Step(1);
 let moved=await page.evaluate(()=>__EarSpaProbe().rendering);
 Check(JSON.stringify(initial.lampAim)===JSON.stringify(moved.lampAim)&&JSON.stringify(initial.lampPosition)===JSON.stringify(moved.lampPosition),'hovering tool does not turn or move fixed lamp');
 await page.locator('#lamp-aim').click();await page.mouse.click(620,310);await Step(2);
 let aimed=await page.evaluate(()=>__EarSpaProbe().rendering);
 Check(JSON.stringify(initial.lampAim)!==JSON.stringify(aimed.lampAim),'explicit aim mode changes world-space lamp target');
 await page.mouse.move(700,420);await Step(1);
 Check(JSON.stringify(aimed.lampAim)===JSON.stringify((await page.evaluate(()=>__EarSpaProbe().rendering)).lampAim),'new aim stays fixed after tool moves');
 await page.screenshot({path:path.join(here,'_dev/Shot_CareerWeakLamp.png')});
 // Controlled fixture checks physical lighting upgrades independently of earning.
 await page.evaluate(()=>__EarSpaDebug.view.SetCareLighting({level:3,intensity:145,mounted:false,label:'明亮检查灯'}));await Step(1);
 Check((await page.evaluate(()=>__EarSpaProbe().rendering)).lampIntensity===145,'lamp upgrade changes emitted intensity');
 await page.screenshot({path:path.join(here,'_dev/Shot_CareerBrightLamp.png')});
 await page.evaluate(()=>__EarSpaDebug.view.SetCareLighting({level:3,intensity:145,mounted:true,label:'器具照明'}));await Step(1);
 const mounted=await page.evaluate(()=>__EarSpaProbe().rendering);
 const lampTarget=await page.evaluate(()=>__EarSpaDebug.view.Targets().find(c=>c.type==='dry'&&!c.fine&&c.screen.x>350&&c.screen.x<900&&c.screen.y>180&&c.screen.y<600));assert(lampTarget,'visible lamp test target');
 await page.mouse.move(lampTarget.screen.x,lampTarget.screen.y);await Step(3);
 Check(JSON.stringify(mounted.lampPosition)!==JSON.stringify((await page.evaluate(()=>__EarSpaProbe().rendering)).lampPosition),'installed instrument lamp moves with tool');
 await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);
 await page.locator('[data-tool="brush"]').click();
 const target=await page.evaluate(()=>__EarSpaDebug.view.Targets().find(c=>c.fine&&c.screen.x>350&&c.screen.x<900&&c.screen.y>160&&c.screen.y<500));assert(target,'visible micro-debris');
 await page.mouse.move(target.screen.x,target.screen.y);await Step(2);await page.mouse.down();
 let maxBend=0;
 for(let i=0;i<18;i++){
  await page.mouse.move(target.screen.x+Math.sin(i*.3)*45,target.screen.y+Math.cos(i*.3)*18);await Step(2);
  const sample=await page.evaluate(()=>({bristles:__EarSpaProbe().rendering.bristles,audit:__EarSpaDebug.view.AuditTool()}));report.samples.push(sample);
  maxBend=Math.max(maxBend,sample.bristles.brush.maxBend);Check(sample.audit.fieldMinimum>=-.006,'elastic fibers respect full skin collision');
 }
 await page.mouse.up();await Step(3);Check(maxBend>.015,'moving brush develops visible elastic bend');
 await page.screenshot({path:path.join(here,'_dev/Shot_CareerBristles.png')});
 // The grade calculation is independently covered by economy tests; this fixture
 // checks the rendered gate, duplicate prevention and expiry without fake income.
 report.sparkle=await page.evaluate(()=>{const d=__EarSpaDebug,c=d.view.chunks.find(c=>!c.fine);const low=d.view.CelebrateWax(c,{grade:4,sparkle:false}),high=d.view.CelebrateWax(c,{grade:5,sparkle:true}),duplicate=d.view.CelebrateWax(c,{grade:5,sparkle:true});d.StepFrames(30);return{low,high,duplicate,probe:__EarSpaProbe().rendering.sparkles,render:{...d.core.renderer.info.render}};});
 Check(!report.sparkle.low&&report.sparkle.high&&!report.sparkle.duplicate&&report.sparkle.probe.active===1,'only top grade sparkles, once per piece');
 Check(report.sparkle.render.triangles<=180000&&report.sparkle.render.calls<=120,'sparkles retain geometry and draw-call budget');
 await page.screenshot({path:path.join(here,'_dev/Shot_CareerSparkle.png')});await Step(240);
 Check((await page.evaluate(()=>__EarSpaProbe().rendering.sparkles)).active===0,'sparkles expire');
 Check(report.errors.length===0,'no browser or shader errors');console.log('PASS '+report.checks.length+' career effects checks');
}finally{await fs.mkdir(path.join(here,'_dev'),{recursive:true});await fs.writeFile(path.join(here,'_dev/Report_CareerEffects.json'),JSON.stringify(report,null,2));await browser.close();}
