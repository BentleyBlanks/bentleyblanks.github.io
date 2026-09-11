import { LandingSound } from './Script_LandingSound.mjs';
// Real mouse / CDP touch. Debug stepping advances time, never assigns cleaning or fracture state.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {InstrumentContact,IsFeatherDebris} from './Script_InstrumentInteraction.mjs';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8082/EarSpa3D/';
export async function RunDirectional({profiles=[[1000,900,false],[390,844,true],[320,568,true],[844,390,true]],detail=false}={}){
 const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const reports=[];await fs.mkdir(path.join(here,'_dev'),{recursive:true});
 try{for(const [width,height,touch] of profiles){
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1,userAgent:touch?'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36':undefined});
  // 手工推进物理时不再混入机器快慢决定的 rAF 步数；保留浏览器和 Playwright 自己的 rAF。
  await page.addInitScript(()=>{const native=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>callback.name==='Animate'?0:native(callback);});
  if(touch)await page.addInitScript(()=>{Object.defineProperty(navigator,'deviceMemory',{get:()=>4});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});});
  const heardTiers=new Set();
  const cdp=await page.context().newCDPSession(page),report={width,height,touch,checks:[],errors:[]};reports.push(report);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  const Check=(ok,label)=>{assert.ok(ok,width+'×'+height+': '+label);report.checks.push(label);};
  const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
  let down=false;
  async function Input(type,x=0,y=0){if(type==='up'&&!down)return;if(type==='down')down=true;if(type==='up')down=false;if(touch)await cdp.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{x,y}]});else{if(type==='down'){await page.mouse.move(x,y);await page.mouse.down();}if(type==='move')await page.mouse.move(x,y,{steps:8});if(type==='up')await page.mouse.up();}await page.waitForTimeout(20);}
  async function Select(id){await Input('up');await page.locator('[data-tool="'+id+'"]').click();}
  async function Start(){await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);}
  async function Press(id,frames=110){let t=(await Probe()).targets.find(c=>c.id===id);const deep=t.depth>10;if((await page.locator('#depth-toggle').getAttribute('aria-pressed')==='true')!==deep){await page.locator('#depth-toggle').click();await Step(70);t=(await Probe()).targets.find(c=>c.id===id);} await Input('down',t.screen.x,t.screen.y);await Step(frames);return (await Probe()).targets.find(c=>c.id===id);}
  async function Align(id,tool){
   if(!['scoop','tweezers'].includes(tool))return;
   let t=(await Probe()).targets.find(c=>c.id===id);if((await page.locator('#depth-toggle').getAttribute('aria-pressed')==='true')!==(t.depth>10)){await page.locator('#depth-toggle').click();await Step(70);t=(await Probe()).targets.find(c=>c.id===id);}
   // 握持方向跨目标保留，整局测试也必须像玩家一样转到有效工作面，不能假定自动对齐。
   const normal=await page.evaluate(id=>__EarSpaDebug.view.chunks.find(c=>c.id===id).normal.toArray(),id);
   if(touch){await page.locator('#mode-turn').click();await Input('down',t.screen.x,t.screen.y);}else{await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down({button:'right'});}
   let aligned=false;for(let i=0;i<100;i++){await Step(3);const p=await Probe(),contact=InstrumentContact(tool,p.rendering.toolRotation,normal);aligned=contact.aligned;if(aligned)break;}
   if(touch){await Input('up');await page.locator('#mode-force').click();}else await page.mouse.up({button:'right'});
   Check(aligned,'real rotation aligns '+tool+' for target '+id);
  }
  async function Collect(id,tool){await Select(tool);await Align(id,tool);const before=(await Probe()).harvest.length;const c=await Press(id);Check(c.state==='held','hold current tool direction detaches '+id);Check((await Probe()).harvest.length===before,'holding does not award cleaning '+id);await Input('up');await Step(80);if(id===0){Check((await Probe()).rendering.headRealtime&&(await Probe()).rendering.outerVisible,'same live head stays visible during extraction');await page.screenshot({path:path.join(here,'_dev','Shot_LiveExtraction_'+width+'.png')});}await Step(150);Check((await Probe()).harvest.filter(c=>c.id===id).length===1,'exactly one landing award '+id);const landed=(await Probe()).events.find(e=>e.type==='landingSound'&&e.id===id);Check(landed?.cue===LandingSound(c).cue,'size selects approved landing '+id);heardTiers.add(landed.tier);}
  try{
   await Start();let p=await Probe();
   Check(p.targets.length===21&&p.targets.filter(c=>c.fine).reduce((s,c)=>s+c.grainCount,0)===108,'initial ear contains large deposits and 108 separate tiny grains');
   Check(p.targets.some(c=>c.tone==='paleYellow'&&!c.fine)&&p.targets.some(c=>c.tone==='brown'&&!c.fine),'pale yellow thin keratin coexists with dark wax');
   Check(p.targets.some(c=>c.fine&&c.tone==='paleYellow'),'tiny residue also contains pale yellow grains');
   Check(p.targets.some(c=>c.form==='film')&&p.targets.some(c=>c.form==='ribbon'),'adherent wet films and long thin dry sheets coexist');
   Check(Math.abs(p.targets.reduce((s,c)=>s+c.mass,0)-9)<1e-8,'initial mass remains nine accounting units');
   Check(p.rendering.hairCount===360&&p.rendering.hairRootFixed,'dense pale hairs have fixed roots');
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.tool-dock button:not([hidden])')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})}));
   Check(!layout.overflow&&layout.buttons.every(r=>r.x>=0&&r.x+r.w<=width+1&&r.y+r.h<=height+1),'tool dock fits viewport');
   if(touch)Check(p.stats.pixelRatio>=1.8,'mobile retains clear 2x drawing buffer');
   await page.screenshot({path:path.join(here,'_dev','Shot_DirectionalStart_'+width+'.png')});
   const t=p.targets[0];let pivotStart;await Select('scoop');
   if(touch){await page.locator('#mode-turn').click();await Input('down',t.screen.x,t.screen.y);pivotStart=(await Probe()).rendering.toolPosition;await Step(15);await Input('up');await page.locator('#mode-force').click();}
   else{await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down({button:'right'});pivotStart=(await Probe()).rendering.toolPosition;await Step(15);await page.mouse.up({button:'right'});}
   p=await Probe();Check(p.rendering.toolPosition.every((v,i)=>Math.abs(v-pivotStart[i])<1e-7),'rotation preserves the physical contact pivot');Check(Math.abs(p.rendering.heading)>.01&&!p.turning,'real rotate gesture persists angle and ends cleanly');Check(p.cleanliness===0&&p.targets[0].state==='attached','rotating never applies extraction force');
   if(!touch){
    await Start();let parent=(await Probe()).targets.find(c=>c.type==='dry'&&!c.fine&&c.form==='ribbon')||(await Probe()).targets.find(c=>c.type==='dry'&&!c.fine);
    for(let generation=1;generation<=3;generation++){
      await Select('tweezers');await Press(parent.id,125);await Input('up');await Step(60);
      const children=(await Probe()).targets.filter(c=>c.generation===generation&&String(c.id).startsWith(String(parent.id)+'.'));
      Check(children.length>=2,'actual pointer force produces generation '+generation);
      Check(Math.abs(children.reduce((sum,c)=>sum+c.mass,0)-parent.mass)<1e-7,'generation '+generation+' preserves its parent mass');
      Check(children.every(c=>c.mass<parent.mass),'generation '+generation+' produces smaller pieces');
      parent=await page.evaluate(ids=>__EarSpaProbe().targets.filter(c=>ids.includes(c.id)).sort((a,b)=>b.mass-a.mass).find(c=>__EarSpaDebug.view.Pick(c.screen.x,c.screen.y,'tweezers')?.id===c.id),children.map(c=>c.id));
      Check(!!parent,'generation '+generation+' keeps a visible contact point');
    }
    Check(parent.fine===IsFeatherDebris(parent),'third generation uses actual fragment size and mass');await Select(parent.fine?'tweezers':'feather');await Press(parent.id,60);await Input('up');Check((await Probe()).targets.find(c=>c.id===parent.id).state==='attached','incompatible tool cannot collect third-generation residue');await Collect(parent.id,parent.fine?'feather':'scoop');
   }
   await Start();await Select('scoop');await Press(8,60);await Input('up');p=await Probe();
   Check(p.targets.find(c=>c.id===8).state==='attached'&&p.rendering.reachBlocked,'short spoon cannot grip or advance deep wax');
   Check(p.rendering.contactOcclusion.includes('silhouette')&&p.rendering.contactRimMm<.2,'contact occlusion follows actual outlines within a submillimetre rim');
   await page.locator('#depth-toggle').click();await Step(70);p=await Probe();
   const dust=await page.evaluate(()=>__EarSpaProbe().targets.find(c=>c.fine&&__EarSpaDebug.view.Pick(c.screen.x,c.screen.y,'scoop')?.id===c.id));Check(!!dust,'a visible microdust patch can be targeted separately');await Select('scoop');await Press(dust.id,40);await Input('up');Check((await Probe()).targets.find(c=>c.id===dust.id).state==='attached','spoon cannot remove tiny dust');
   for(const original of p.targets.filter(c=>!c.fine)){
    if(original.type==='impacted'){await Select('drops');await Press(original.id,3);await Input('up');Check((await Probe()).targets.find(c=>c.id===original.id).softened<.5,'softener needs real diffusion time');await Step(195);}
    await Collect(original.id,original.type==='dry'?'scoop':'tweezers');
   }
   for(let guard=0;guard<16;guard++){const next=(await Probe()).targets.find(c=>c.fine&&c.state==='attached');if(!next)break;await Collect(next.id,'feather');}
   await Step(60);p=await Probe();Check(p.phase==='complete'&&!p.timedOut&&Math.abs(p.cleanliness-1)<1e-8,'all deposits and dust finish within service limit');Check(p.shop.totalCustomers===1,'service pays exactly once');Check(p.audio.contextState==='running'&&p.audio.sfxMissing.length===0,'real input unlocks sound with no missing cues');
   Check(['small','medium','large'].every(t=>heardTiers.has(t)),'all three approved sizes occur during real play');Check(!p.audio.sfxLoaded.some(c=>/customer|relaxSigh/.test(c)),'female voices are not loaded');Check(!p.events.some(e=>e.type==='sound'&&/customer|relaxSigh/.test(e.cue)),'no female voice events');
   await page.screenshot({path:path.join(here,'_dev','Shot_DirectionalComplete_'+width+'.png')});
   const coins=p.shop.coins;await Step(300);Check((await Probe()).shop.coins===coins,'receipt cannot pay repeatedly');
   p=await Probe();Check(p.tray.count>0&&Math.abs(p.tray.mass-9)<1e-7,'all landed wax is stored separately on the tray');
   Check(p.rendering.trayCloseup>.99&&!p.rendering.outerVisible,'settlement camera reaches the plate close-up');
   const trayBefore=p.tray.count,first=p.tray.pieces[0];
   await Input('down',first.screen.x,first.screen.y);await Step(1);
   Check((await Probe()).tray.toolVisible,'real pointer holds the free cleanup scoop');
   const destination=await page.evaluate(async position=>{const T=await import('three'),{view,core}=__EarSpaDebug;return view.Project(new T.Vector3(position[0],.1,-19).add(core.scene.getObjectByName('Model_Tray').position));},first.position);
   for(let i=1;i<=18;i++){await Input('move',first.screen.x+(destination.x-first.screen.x)*i/18,first.screen.y+(destination.y-first.screen.y)*i/18);await Step(2);}
   await Input('up');await Step(90);p=await Probe();
   Check(p.tray.count<trayBefore&&p.tray.count>0,'scoop sweeps only contacted wax past the rim, leaving the rest');
   Check(p.shop.coins===coins&&Math.abs(p.cleanliness-1)<1e-8,'manual tray cleanup never changes the awarded income or cleanliness');
   const remainingTray={count:p.tray.count,mass:p.tray.mass};
   await page.screenshot({path:path.join(here,'_dev','Shot_TrayCleanup_'+width+'.png')});
   await page.locator('#receipt-next').click();await page.waitForFunction(()=>window.__EarSpaProbe().phase==='playing');await Step(150);p=await Probe();Check(p.tray.count===remainingTray.count&&Math.abs(p.tray.mass-remainingTray.mass)<1e-8&&p.cleanliness===0,'next customer preserves the tray while resetting only their own score');await page.locator('#shop-open').click();const beforePause=(await Probe()).timeRemaining;await Step(180);Check((await Probe()).timeRemaining===beforePause,'shopping pauses service clock');await page.locator('[data-select-tool="feather"]').click();Check((await Probe()).rendering.previewTriangles>500,'feather has a real rotatable shop model');await page.screenshot({path:path.join(here,'_dev','Shot_FeatherShop_'+width+'.png')});await page.locator('#shop-close').click();
   await page.evaluate(()=>{const{core}=__EarSpaDebug,render=core.Render;core.Render=()=>{};try{for(let i=0;i<4;i++)__EarSpaDebug.StepFrames(3600);}finally{core.Render=render;core.Render();}});p=await Probe();Check(p.phase==='complete'&&p.timedOut&&p.cleanliness<1&&p.timeRemaining===0,'deadline ends incomplete service without claiming full cleaning');
   const secondCoins=p.shop.coins,tiltButton=await page.locator('#tray-tilt').boundingBox();
   await Input('down',tiltButton.x+tiltButton.width/2,tiltButton.y+tiltButton.height/2);await Step(15);p=await Probe();
   Check(p.tray.tilting&&p.tray.tilt>.3&&p.tray.count===remainingTray.count,'holding tilt starts a visible physical pour without instant deletion');
   await Input('up');await Step(90);Check(!(await Probe()).tray.tilting&&(await Probe()).tray.tilt<.001,'release returns the tray to level');
   await Input('down',tiltButton.x+tiltButton.width/2,tiltButton.y+tiltButton.height/2);await Step(330);await Input('up');await Step(120);p=await Probe();
   Check(p.tray.count===0&&p.tray.batches===0,'holding tilt spills every remaining piece and releases render batches');
   Check(p.shop.coins===secondCoins&&p.cleanliness===0,'pouring old wax cannot award or erase the next service score');
   await page.screenshot({path:path.join(here,'_dev','Shot_TrayEmpty_'+width+'.png')});
   Check(report.errors.length===0,'no page, shader or resource errors');report.final=p;console.log('PASS '+width+'×'+height+' '+(touch?'touch':'mouse')+' '+report.checks.length+' checks');
  }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await page.screenshot({path:path.join(here,'_dev','Shot_DirectionalFailure_'+width+'.png')});throw error;}
  finally{await fs.writeFile(path.join(here,'_dev','Data_DirectionalPlayReport.json'),JSON.stringify(reports,null,2));await page.close();}
 }}finally{await browser.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await RunDirectional({profiles:process.argv.includes('--desktop')?[[1000,900,false]]:process.argv.includes('--mobile')?[[390,844,true],[320,568,true],[844,390,true]]:undefined});
