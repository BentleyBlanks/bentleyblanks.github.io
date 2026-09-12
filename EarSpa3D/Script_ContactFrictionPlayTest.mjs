import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8142/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),report={errors:[],checks:[]};
const Check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}}),Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.locator('#ear-start').click();await Step(150);
 await page.evaluate(async()=>{const a=__EarSpaDebug.audio;await a.ready;a.setBgmVolume(0);a.setAmbienceVolume(0);});
 let p=await Probe(),t=p.targets[0];await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down();await Step(60);p=await Probe();
 Check(p.active===0&&p.audio.activeContacts.length===0,'real stationary scoop grip is silent');
 Check(!p.events.some(e=>e.type==='sound'&&e.cue==='scrapeSoft'),'grip does not play a full scrape sample');
 let loadedMoving=false;report.motion=[];
 for(let i=1;i<=12;i++){
  await page.mouse.move(t.screen.x+(t.pullScreen.x-t.screen.x)*i*.006,t.screen.y+(t.pullScreen.y-t.screen.y)*i*.006);await Step(1);p=await Probe();
  report.motion.push({force:p.targets[0].physics.force,contacts:p.audio.activeContacts});
  if(p.audio.activeContacts.includes('scrape')){loadedMoving=true;break;}
 }
 Check(loadedMoving,'actual mouse sliding under load starts dry friction');
 await Step(1);p=await Probe();Check(p.audio.activeContacts.length===0,'holding the new pointer position stops friction on the next frame');
 await page.mouse.up();await Step(60);
 // 实测 WebAudio 输出：直接调用合成器也不能在零速度或零压力时泄漏底噪。
 report.signals=await page.evaluate(async()=>{
  const a=__EarSpaDebug.audio,wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(1600);
  const Peak=async ms=>{let peak=0;const data=new Float32Array(a.analyser().fftSize);for(let i=0;i<ms/8;i++){a.analyser().getFloatTimeDomainData(data);for(const v of data)peak=Math.max(peak,Math.abs(v));await wait(8);}return peak;};
  a.contact.begin('scrape');a.contact.update('scrape',{speed01:0,pressure01:.7});a.Update(.016);await wait(120);const stationary=await Peak(140);
  a.contact.update('scrape',{speed01:.6,pressure01:.7});a.Update(.016);await wait(100);const moving=await Peak(160);
  a.contact.update('scrape',{speed01:0,pressure01:.7});a.Update(.016);await wait(120);const stopped=await Peak(140);
  a.contact.update('scrape',{speed01:.6,pressure01:0});a.Update(.016);await wait(100);const unloaded=await Peak(140);
  a.contact.end('scrape',{release:.025});return{stationary,moving,stopped,unloaded};
 });
 Check(report.signals.stationary<.00003&&report.signals.stopped<.00003&&report.signals.unloaded<.00003,'measured stationary/stopped/unloaded audio is silent');
  Check(report.signals.moving>.001&&report.signals.moving<.99,'measured sliding output exists without clipping');
  t=(await Probe()).targets[0];await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down({button:'right'});
  let shallow=false;
  for(let i=0;i<180;i++){
    const facing=await page.evaluate(async()=>{const {InstrumentContact}=await import('./Script_InstrumentInteraction.mjs');return InstrumentContact('scoop',__EarSpaProbe().rendering.toolRotation,__EarSpaDebug.view.chunks[0].normal.toArray()).facing;});
    if(facing>.12&&facing<.20){shallow=true;break;}await Step(1);
  }
  await page.mouse.up({button:'right'});Check(shallow,'real handle rotation reaches a shallow front angle previously rejected');
  await page.mouse.down();await Step(1);p=await Probe();
  report.shallow=await page.evaluate(async()=>{const {WaxGripNormal}=await import('./Script_WaxEdgeContact.mjs'),{InstrumentContact}=await import('./Script_InstrumentInteraction.mjs'),c=__EarSpaDebug.view.chunks[0];return InstrumentContact('scoop',__EarSpaProbe().rendering.toolRotation,WaxGripNormal(c.body,c.normal.toArray()));});
  Check(p.active===0&&p.targets[0].aligned&&report.shallow.facing>.04&&report.shallow.facing<.28,'actual shallow contact is accepted against the current material surface');
  await page.mouse.up();await Step(1);
 await page.screenshot({path:path.join(here,'_dev/Shot_ContactFriction.png')});
 Check(report.errors.length===0,'no browser errors or missing resources');
 console.log('PASS real contact/start/stop inputs and measured WebAudio gates',JSON.stringify(report.signals));
}catch(error){report.failure=error.message;throw error;}
finally{await fs.writeFile(path.join(here,'_dev/Data_ContactFrictionPlayReport.json'),JSON.stringify(report,null,2));await browser.close();}
