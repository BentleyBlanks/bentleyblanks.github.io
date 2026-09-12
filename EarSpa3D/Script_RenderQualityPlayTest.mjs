import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NormalizeRenderQuality,RENDER_QUALITY_STORAGE} from './Data_RenderQuality.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8147/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),report={checks:[],errors:[],views:[]};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
function Watch(page){page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('test preparation failure'))report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});}
async function Ready(page){await page.waitForFunction(()=>window.__EarSpaProbe,null,{timeout:90000});await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});}
try{
  const page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:2});Watch(page);
  const Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n),Shot=name=>page.screenshot({path:path.join(here,'_dev/Shot_RenderQuality'+name+'.png')});
  await page.goto(url+'?debug=1');await Ready(page);let p=await Probe();
  Check(JSON.stringify(p.renderQuality)===JSON.stringify(NormalizeRenderQuality()),'default configuration preserves automatic resolution and full effects');
  await page.locator('#welcome-settings').click();await page.locator('#quality-settings>summary').click();await Shot('Desktop');
  const original=p.targets.map(c=>({id:c.id,position:c.position,mass:c.mass,physics:c.physics})),business=JSON.stringify(p.shop);
  await page.locator('#quality-preset').selectOption('low');p=await Step(1);
  Check(p.stats.pixelRatio===.75&&p.rendering.shadowSize===512&&p.rendering.shadows,'low preset changes actual render resolution and shadow map');
  Check(p.rendering.contactSamples===1&&p.rendering.detailLayers===1&&p.rendering.furLayers===2,'low preset reduces contact rays, gel detail and fur passes');
  await page.locator('#quality-contact').selectOption('off');await page.locator('#quality-shadows').selectOption('high');p=await Step(1);
  Check(!p.rendering.contactEnabled&&p.rendering.contactOccluders===0&&p.rendering.shadowSize===2048,'individual overrides reach the renderer');
  Check(await page.locator('#quality-preset').inputValue()==='custom','individual overrides show custom preset');
  await page.locator('#quality-enabled').uncheck();p=await Step(1);
  Check(!p.rendering.shadows&&p.rendering.sssStrength===0&&p.rendering.wetRendering===0&&p.rendering.surfaceDetail===0&&p.rendering.reflectionStrength===0&&p.rendering.furLayers===0,'master switch disables every optional rendering effect');
  const disabledScene=await page.evaluate(()=>{const result={transmission:0,fur:0};__EarSpaDebug.core.scene.traverse(n=>{if(n.userData.featherShell&&n.visible)result.fur++;for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])if(m.transmission>0)result.transmission++;});return result;});
  Check(disabledScene.transmission===0&&disabledScene.fur===0,'master switch removes physical transmission pass and visible fur shells');
  Check(JSON.stringify(p.targets.map(c=>({id:c.id,position:c.position,mass:c.mass,physics:c.physics})))===JSON.stringify(original)&&JSON.stringify(p.shop)===business,'quality changes preserve current physics, geometry positions and business state');
  await page.evaluate(()=>__EarSpaDebug.view.SetSkins({},{scoop:2,feather:2}));
  Check(await page.evaluate(()=>{let fur=0;__EarSpaDebug.core.scene.traverse(n=>{if(n.userData.featherShell&&n.visible)fur++;});return fur===0;}),'upgraded tools inherit disabled fur rendering');
  await page.locator('#quality-enabled').check();p=await Step(1);
  Check(p.renderQuality.shadows==='high'&&p.renderQuality.contact==='off'&&p.rendering.shadows,'enabling restores individual choices');
  await page.evaluate(()=>{const core=__EarSpaDebug.core;core.Tick(100000);for(let i=1;i<=90;i++)core.Tick(100000+i*50);});p=await Probe();
  Check(p.rendering.shadows&&p.stats.pixelRatio===.75,'slow frames do not override manually selected shadows or resolution');
  const retained=p.renderQuality;await page.reload();await Ready(page);p=await Probe();
  Check(JSON.stringify(p.renderQuality)===JSON.stringify(retained)&&p.stats.pixelRatio===.75,'reload restores settings before play');
  await page.locator('#welcome-settings').click();await page.locator('#quality-settings>summary').click();await page.locator('#quality-reset').click();
  await page.locator('#settings-close').click();await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await Step(150);await Shot('DefaultScene');
  // Read actual framebuffer changes, with the simulation paused in the settings dialog.
  await page.locator('#settings-open').click();
  const Pixels=()=>page.evaluate(()=>{const {core}=__EarSpaDebug;core.Render();const gl=core.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,buffer=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buffer);let sum=0;for(let i=0;i<buffer.length;i+=4)sum+=buffer[i]+buffer[i+1]+buffer[i+2];return sum;});
  const before=await Pixels();await page.locator('#quality-enabled').uncheck();const after=await Pixels();
  Check(Math.abs(before-after)>10000,'actual rendered pixels change when effects are disabled');await page.locator('#settings-close').click();await Shot('EffectsOffScene');
  await page.locator('#settings-open').click();await page.locator('#quality-reset').click();
  await page.locator('#gameplay-settings>summary').click();await Shot('GameplayDesktop');
  const initial=await Probe();await page.locator('#debug-next-customer').click();await page.waitForFunction(()=>__EarSpaProbe().phase==='playing'&&!document.querySelector('#settings-dialog').open,null,{timeout:90000});p=await Step(150);
  Check(p.shop.todayIndex===initial.shop.todayIndex+1&&p.shop.todayCustomers[initial.shop.todayIndex].skipped,'debug button skips an unfinished customer');
  Check(p.shop.coins===initial.shop.coins&&p.shop.reputation===initial.shop.reputation&&p.shop.totalCustomers===initial.shop.totalCustomers,'skipping grants no payout, reputation or completed-service credit');
  Check(p.cleanliness===0&&p.elapsed<3&&p.targets.reduce((sum,c)=>sum+c.mass,0)>8.99,'next customer starts a fresh playable service');
  // Seed one legitimately delivered tray item to exercise cross-customer preservation.
  await page.evaluate(()=>{const {view}=__EarSpaDebug,c=view.chunks.find(c=>c.type==='dry'&&!c.fine);c.toolId='scoop';view.Release(c,0);});await Step(250);
  const tray=(await Probe()).tray;Check(tray.count===1&&tray.mass>0,'released earwax reaches the collection tray before debug skip');
  // Failure and double-click protection must retry the same customer, even across day boundaries.
  await page.locator('#settings-open').click();
  await page.evaluate(()=>{const view=__EarSpaDebug.view,prepare=view.PrepareCustomer;let fail=true;view.PrepareCustomer=async(...args)=>{if(fail){fail=false;await new Promise(r=>setTimeout(r,100));throw new Error('test preparation failure');}return prepare(...args);};document.querySelector('#debug-next-customer').click();document.querySelector('#debug-next-customer').click();});
  await page.waitForFunction(()=>__EarSpaProbe().phase==='complete');const failed=await Probe();
  Check((await page.locator('#gameplay-status').textContent()).includes('重试'),'failed preparation exposes an actionable retry');
  await page.locator('#debug-next-customer').click();await page.waitForFunction(()=>__EarSpaProbe().phase==='playing',null,{timeout:90000});p=await Probe();
  Check(p.shop.day===failed.shop.day&&p.shop.todayIndex===failed.shop.todayIndex,'retry and duplicate click do not skip another customer');
  Check(p.tray.count===tray.count&&p.tray.mass===tray.mass,'debug skip and retry preserve already collected tray items');
  const day=p.shop.day;
  while((await Probe()).shop.day===day){await page.locator('#settings-open').click();await page.locator('#debug-next-customer').click();await page.waitForFunction(()=>__EarSpaProbe().phase==='playing'&&!document.querySelector('#settings-dialog').open,null,{timeout:90000});}
  p=await Probe();Check(p.shop.day===day+1&&p.shop.todayIndex===0&&p.shop.coins===initial.shop.coins,'last customer advances to the next day without debug income');
  await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('oily');await page.locator('#practice-start').click();await Step(150);
  await page.locator('#settings-open').click();Check(await page.locator('#debug-next-customer').isDisabled(),'practice cannot skip suspended business customers');
  await page.locator('#quality-wetness').selectOption('off');await Step(1);
  Check(await page.evaluate(()=>__EarSpaDebug.view.chunks.every(c=>c.mesh.material.transmission===0)),'current oily gel disables its actual transmission pass');
  await page.locator('#quality-detail').selectOption('low');await page.locator('#quality-wetness').selectOption('mid');await Step(1);await page.locator('#settings-close').click();await Shot('OilyMedium');
  Check((await Probe()).rendering.wetRendering===.65&&(await Probe()).rendering.detailLayers===1,'oily material uses adjusted wetness and detail layers');
  await page.locator('#settings-open').click();await page.locator('#practice-return').click();await page.locator('#settings-open').click();Check(!await page.locator('#debug-next-customer').isDisabled(),'return from practice restores gameplay debug control');
  await page.locator('#settings-close').click();
  // Normal completion still awards once, then uses the same next-customer path.
  await page.evaluate(()=>{const {core}=__EarSpaDebug,render=core.Render;core.Render=()=>{};try{for(let i=0,n=Math.ceil(__EarSpaProbe().timeRemaining/60)+1;i<n;i++)__EarSpaDebug.StepFrames(3600);}finally{core.Render=render;core.Render();}});
  const completed=await Probe();Check(completed.phase==='complete'&&completed.shop.totalCustomers===initial.shop.totalCustomers+1,'normal timeout still settles a service once');
  await page.locator('#receipt-next').click();await page.waitForFunction(()=>__EarSpaProbe().phase==='playing',null,{timeout:90000});p=await Probe();
  Check(p.shop.totalCustomers===completed.shop.totalCustomers&&p.shop.coins===completed.shop.coins&&p.tray.mass===tray.mass,'normal next button retains payout and tray without double settlement');
  await page.close();
  for(const [width,height] of [[390,844],[320,568],[844,390]]){
    const mobile=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true});Watch(mobile);await mobile.goto(url);await Ready(mobile);
    Check(!await mobile.evaluate(()=>Boolean(window.__EarSpaDebug)),width+' ordinary page has no writable debug global');
    await mobile.locator('#welcome-settings').tap();await mobile.locator('#quality-settings>summary').tap();await mobile.locator('#quality-preset').selectOption('mid');await mobile.locator('#quality-settings').evaluate(e=>e.scrollIntoView({block:'start'}));
    await mobile.screenshot({path:path.join(here,`_dev/Shot_RenderQualityMobile_${width}.png`)});
    await mobile.locator('#gameplay-settings>summary').tap();await mobile.locator('#gameplay-settings').evaluate(e=>e.scrollIntoView({block:'start'}));await mobile.screenshot({path:path.join(here,`_dev/Shot_GameplayMobile_${width}.png`)});
    const layout=await mobile.evaluate(()=>{const d=document.querySelector('#settings-dialog'),close=document.querySelector('#settings-close').getBoundingClientRect();return{overflow:d.scrollWidth>d.clientWidth+1||document.documentElement.scrollWidth>innerWidth,close:close.top>=0&&close.bottom<=innerHeight};});
    Check(!layout.overflow&&layout.close,width+' expanded panels fit viewport and keep close button reachable');
    await mobile.locator('#debug-next-customer').tap();await mobile.waitForFunction(()=>__EarSpaProbe().phase==='playing'&&!document.querySelector('#settings-dialog').open,null,{timeout:90000});
    Check((await mobile.evaluate(()=>__EarSpaProbe())).shop.todayIndex===1,width+' touch debug skip works directly from welcome');report.views.push({width,height,...layout});await mobile.close();
  }
  const storage=await browser.newPage();Watch(storage);await storage.addInitScript(key=>localStorage.setItem(key,'{broken'),RENDER_QUALITY_STORAGE);await storage.goto(url);await Ready(storage);await storage.locator('#welcome-settings').click();await storage.locator('#quality-settings>summary').click();
  Check((await storage.locator('#quality-status').textContent()).includes('未能读取'),'corrupt stored configuration falls back safely');await storage.close();
  const blocked=await browser.newPage();Watch(blocked);await blocked.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('blocked');};Storage.prototype.setItem=()=>{throw Error('blocked');};});await blocked.goto(url);await Ready(blocked);await blocked.locator('#welcome-settings').click();await blocked.locator('#quality-settings>summary').click();await blocked.locator('#quality-preset').selectOption('low');
  Check((await blocked.locator('#quality-status').textContent()).includes('本次会话有效')&&(await blocked.evaluate(()=>__EarSpaProbe())).stats.pixelRatio===.75,'unavailable storage still permits live quality adjustment');await blocked.close();
  Check(report.errors.length===0,'no unexpected console, shader, asset or page errors');console.log('PASS',report.checks.length,'render quality and gameplay checks');
}catch(error){report.failure=error.stack;throw error;}finally{await fs.writeFile(path.join(here,'_dev/Data_RenderQualityPlayReport.json'),JSON.stringify(report,null,2));await browser.close();}
