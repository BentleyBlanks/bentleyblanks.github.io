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
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of [[1000,900,false],[320,568,true]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),cdp=await page.context().newCDPSession(page),report={width,checks:[],errors:[]};reports.push(report);

 const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 async function Start(){await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);}
 async function Input(type,t,button='left'){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:type==='down'?'touchStart':'touchEnd',touchPoints:type==='down'?[{x:t.screen.x,y:t.screen.y}]:[]});else{if(type==='down'){await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down({button});}else await page.mouse.up({button});}}
 async function Rotate(id,tool,predicate){const t=(await Probe()).targets.find(c=>c.id===id);if(touch)await page.locator('#mode-turn').click();await Input('down',t,'right');const before=(await Probe()).rendering,pivot=before.toolPosition;let state;
  for(let i=0;i<80;i++){await Step(3);const p=await Probe(),normal=await page.evaluate(id=>__EarSpaDebug.view.chunks.find(c=>c.id===id).normal.toArray(),id);state=InstrumentContact(tool,p.rendering.toolRotation,normal);if(predicate(state)&&p.rendering.heading-before.heading>.12)break;if(i===79)throw Error(tool+' cannot rotate to required physical orientation');}
  const end=(await Probe()).rendering;Check(end.toolPosition.every((v,i)=>Math.abs(v-pivot[i])<1e-7),'rotation keeps its safe pivot');await Input('up',t,'right');await Step(12);Check(Math.abs((await Probe()).rendering.heading-end.heading)<1e-9,'release stops rotation');if(touch)await page.locator('#mode-force').click();return state;
 }
 async function Hold(id,n=110){const t=(await Probe()).targets.find(c=>c.id===id);await Input('down',t);await Step(n);return(await Probe()).targets.find(c=>c.id===id);}
 try{
  await Start();Check(await page.locator('.heading-dial,#heading-angle,.instruction,#input-hint').count()===0,'no angle readout or persistent coaching');Check(await page.locator('.spa-brand #satisfaction').count()===1&&await page.locator('.spa-brand .clean-meter').count()===1,'title, mood and progress share one group');Check(!await page.locator('#sound-toggle').isVisible(),'sound control is inside settings');Check(!await page.getByText('探查深处',{exact:true}).count(),'no deep-inspection text button');
  Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout fits width');
  if(!touch){
   const t=(await Probe()).targets[0];await Input('down',t);await Step(3);await page.mouse.down({button:'right'});await Step(5);Check((await Probe()).turning&&!(await Probe()).active,'right press switches force to safe rotation');await page.mouse.up();await Step(3);Check((await Probe()).turning,'left release does not stop a held right button');await page.mouse.up({button:'right'});Check(!(await Probe()).turning&&!(await Probe()).active,'mixed mouse buttons release without stuck input');
   await Input('down',t,'right');await Step(3);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const angle=(await Probe()).rendering.heading;await Step(12);Check(!(await Probe()).turning&&(await Probe()).rendering.heading===angle,'focus loss stops rotation');await Input('up',t,'right');
  }
  await Rotate(0,'scoop',s=>s.facing<-.8);let c=await Hold(0);Check(!c.aligned&&c.physics.anchors===9&&!c.physics.detached,'back of the spoon cannot loosen wax');await page.screenshot({path:path.join(here,'_dev/Shot_ControlWrong_'+width+'.png')});await Input('up');await Step(60);
  await Rotate(0,'scoop',s=>s.facing>.8);c=await Hold(0);Check(c.aligned&&c.physics.detached,'open spoon face lifts the same wax');await Input('up');await Step(230);Check((await Probe()).harvest.some(c=>c.id===0),'proper spoon force collects after landing');
  await Start();await page.locator('[data-tool="tweezers"]').click();await Rotate(3,'tweezers',s=>s.jawTilt>.85);c=await Hold(3);Check(!c.aligned&&c.physics.anchors===9,'misoriented forceps cannot grip or fracture');await Input('up');await Step(60);
  await Rotate(3,'tweezers',s=>s.jawTilt<.12);c=await Hold(3,125);Check((await Probe()).fractures===1,'properly aligned jaws contact both sides and load brittle wax');await Input('up');
  await Start();await page.locator('[data-tool="feather"]').click();c=await Hold(0,100);Check(c.physics.anchors===9&&c.state==='attached'&&(await Probe()).cleanliness===0,'feather cannot carry a full deposit');await Input('up');
  const dust=await page.evaluate(()=>__EarSpaProbe().targets.find(c=>c.fine&&__EarSpaDebug.view.Pick(c.screen.x,c.screen.y,'feather')?.id===c.id));Check(!!dust,'visible fine debris remains individually selectable');c=await Hold(dust.id);Check(c.physics.detached,'feather still gathers real microdebris');await Input('up');await Step(230);Check((await Probe()).harvest.every(c=>c.mass<=.075),'feather batch contains only small residue');
  await Start();await page.locator('[data-tool="drops"]').click();const target=(await Probe()).targets[3];
  async function Pixels(){return page.evaluate(({x,y})=>{const{core,view}=__EarSpaDebug;view.HideTool();view.AimLamp(x,y);__EarSpaDebug.StepFrames(1);core.Render();const gl=core.renderer.getContext(),ratio=gl.drawingBufferWidth/innerWidth,size=Math.round(40*ratio),out=new Uint8Array(size*size*4);gl.readPixels(Math.round(x*ratio-size/2),Math.round(gl.drawingBufferHeight-y*ratio-size/2),size,size,gl.RGBA,gl.UNSIGNED_BYTE,out);return Array.from(out);},target.screen);}
  if(!touch)await page.mouse.move(target.screen.x,target.screen.y);await Step(1);const before=await Pixels();await page.screenshot({path:path.join(here,'_dev/Shot_ControlDry_'+width+'.png')});await Input('down',target);await Input('up');await Step(25);let wet=(await Probe()).targets[3];Check(wet.surfaceWet>.8&&wet.softened<.2,'visible wet surface arrives before internal diffusion');await Step(175);wet=(await Probe()).targets[3];const after=await Pixels();report.wetPixelChange=after.reduce((sum,v,i)=>sum+(i%4===3?0:Math.abs(v-before[i])),0)/(after.length*.75);Check(report.wetPixelChange>3,'softening changes actual target pixels');Check(wet.softened>.9,'softener still diffuses over three seconds');await page.screenshot({path:path.join(here,'_dev/Shot_ControlWet_'+width+'.png')});
  await page.locator('#settings-open').click();await page.locator('#sound-toggle').click();Check((await Probe()).settings.muted,'settings mute changes audio state');await page.screenshot({path:path.join(here,'_dev/Shot_ControlSettings_'+width+'.png')});await page.locator('#settings-close').click();
  Check(report.errors.length===0,'no browser, shader or resource errors');console.log('PASS controls '+width+': '+report.checks.length+' checks; wet pixel delta '+report.wetPixelChange.toFixed(2));
 }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev/Shot_ControlFailure_'+width+'.png')});throw error;}finally{await page.close();}
}}finally{await fs.writeFile(path.join(here,'_dev/Data_ControlPlayReport.json'),JSON.stringify(reports,null,2));await browser.close();}
