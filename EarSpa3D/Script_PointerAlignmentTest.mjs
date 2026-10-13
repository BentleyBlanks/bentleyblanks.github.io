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
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const report={checks:[],samples:[],errors:[]},out=path.join(here,'_dev');await fs.mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
const Distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
function Check(ok,label){assert.ok(ok,label);report.checks.push(label);}
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
async function At(x,y){await page.mouse.move(x,y);await Step(1);return Probe();}
async function CursorMatches(p,label){
  const visual=await page.locator('#tool-reticle').evaluate(el=>({hidden:el.hidden,x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
  Check(!visual.hidden&&Math.hypot(visual.x-p.rendering.toolScreen.x,visual.y-p.rendering.toolScreen.y)<.01,label+' has one visible cursor on the actual working end');
  Check(await page.locator('#ear-canvas').evaluate(el=>getComputedStyle(el).cursor)==='none',label+' does not display an independent operating-system arrow');
}
try{
  await page.goto(url+(url.includes('?')?'&':'?')+'debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.locator('#welcome-settings').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);
  for(const id of ['scoop','tweezers','drops']){
    await page.locator(`[data-tool="${id}"]`).click();await Step(1);await page.mouse.move(-10,-10);
    let p=await At(670,350);const miss=Math.hypot(p.rendering.toolScreen.x-670,p.rendering.toolScreen.y-350);report.samples.push({id,miss});
    Check(miss<1,id+' directly follows an absolute pointer position in open space');
    p=await At(690,365);Check(Math.hypot(p.rendering.toolScreen.x-690,p.rendering.toolScreen.y-365)<1,id+' does not retain a spawn offset');await CursorMatches(p,id);
    await page.mouse.wheel(0,60);await Step(1);p=await Probe();Check(Math.hypot(p.rendering.toolScreen.x-690,p.rendering.toolScreen.y-365)<1,id+' keeps the same screen point during insertion');
  }
  await page.locator('[data-tool="tweezers"]').click();await Step(1);await page.mouse.move(-10,-10);let p=await At(650,350);
  const pivot=p.rendering.toolPosition,rotation=p.rendering.toolRotation;
  await page.mouse.down({button:'right'});await page.mouse.move(680,330);await Step(1);await page.mouse.up({button:'right'});await Step(1);p=await Probe();
  Check(Distance(rotation,p.rendering.toolRotation)>.01&&Distance(pivot,p.rendering.toolPosition)<.05,'wrist rotation preserves its physical pivot');await CursorMatches(p,'rotation');
  const before=p.rendering.toolScreen;p=await At(685,330);
  Check(Math.abs((p.rendering.toolScreen.x-before.x)-5)<1,'releasing rotation continues with a small movement rather than snapping to the hidden arrow');
  await page.keyboard.down('Shift');const fineStart=p.rendering.toolScreen;p=await At(705,330);await page.keyboard.up('Shift');await Step(1);const fineEnd=(await Probe()).rendering.toolScreen;
  Check(Math.abs(fineEnd.x-fineStart.x-5)<1,'fine movement changes the working cursor by one quarter of the hand movement');
  p=await At(709,330);Check(Math.abs(p.rendering.toolScreen.x-fineEnd.x-4)<1,'releasing fine mode has no position jump');await CursorMatches(p,'fine control');
  await page.mouse.move(-10,-10);await At(650,350);p=await At(1000,350);const constrained=p.rendering.toolScreen;
  Check(p.precision.contact||p.precision.blocked,'moving beyond the free workspace meets the real canal');await CursorMatches(p,'wall contact');
  p=await At(996,350);Check(p.rendering.toolScreen.x<constrained.x-1,'reversing from a wall does not repay accumulated pointer overshoot');
  Check((await page.evaluate(()=>__EarSpaDebug.view.AuditTool())).fieldMinimum>=-.012,'alignment never bypasses full-instrument collision');
  Check(p.cleanliness===0&&p.active===null,'pointer alignment does not select or extract wax');
  await page.mouse.move(-10,-10);Check(await page.locator('#settings-open').evaluate(el=>getComputedStyle(el).cursor)!=='none','UI retains its normal pointer');
  await page.locator('#settings-open').click();await page.locator('#settings-close').click();await page.mouse.move(-10,-10);p=await At(650,350);
  Check(Math.hypot(p.rendering.toolScreen.x-650,p.rendering.toolScreen.y-350)<1,'returning from settings resets stale pointer offsets');
  await page.screenshot({path:path.join(out,'Shot_PointerAlignment.png')});Check(report.errors.length===0,'no browser or renderer errors');
  console.log('PASS '+report.checks.length+' pointer alignment checks');
}catch(error){report.failure=error.stack;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(out,'Shot_PointerAlignmentFailure.png')});throw error;}
finally{await fs.writeFile(path.join(out,'Data_PointerAlignmentReport.json'),JSON.stringify(report,null,2));await browser.close();}
