import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NormalizeWaxPhysicsSettings,WAX_PHYSICS_STORAGE} from './Data_WaxPhysicsSettings.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8128/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[],defaults=NormalizeWaxPhysicsSettings();
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of [[1000,900,false],[390,844,true],[320,568,true],[844,390,true]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),cdp=await page.context().newCDPSession(page),report={width,height,touch,checks:[],errors:[]};reports.push(report);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Probe=()=>page.evaluate(()=>__EarSpaProbe()),Shot=name=>page.screenshot({path:path.join(here,`_dev/Shot_PhysicsSettings${name}_${width}.png`)});
  const Click=async selector=>touch?page.locator(selector).tap():page.locator(selector).click();
  async function Ready(){await page.waitForFunction(()=>window.__EarSpaProbe,{timeout:60000});await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});}
  async function Open(){await Click('#welcome-settings');await Click('#physics-settings>summary');}
  try{
    await page.goto(url);await Ready();const original=await Probe(),business=await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'));
    Check(!await page.evaluate(()=>Boolean(window.__EarSpaDebug)),'normal page keeps writable debug globals disabled');
    Check(JSON.stringify(original.physicsSettings)===JSON.stringify(defaults),'normal page starts with reduced-elasticity defaults');
    await Click('#welcome-settings');Check(!await page.locator('#physics-settings').evaluate(e=>e.open),'physics panel starts collapsed');await page.locator('#physics-debug').evaluate(e=>e.scrollIntoView({block:'start'}));await Shot('Collapsed');
    await Click('#physics-settings>summary');Check(await page.locator('#physics-settings').evaluate(e=>e.open),'mouse or touch expands the physics panel');
    await page.locator('#physics-debug').evaluate(e=>e.scrollIntoView({block:'start'}));await Shot('Dry');
    const slider=page.locator('#physics-stretch');await slider.scrollIntoViewIfNeeded();
    if(touch){const box=await slider.boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.22,y:box.y+box.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else{await slider.focus();await slider.press('Home');for(let i=0;i<6;i++)await slider.press('ArrowRight');}
    const dry=(await Probe()).physicsSettings.dry.stretch;Check(dry!==defaults.dry.stretch&&dry>=.35&&dry<=1.6,'real range input changes the dry material parameter');
    Check((await page.locator('#physics-stretch-value').textContent()).startsWith(dry.toFixed(2)),'displayed numeric value matches the actual parameter');
    await page.locator('#physics-material').selectOption('wet');Check(+(await slider.inputValue())===defaults.wet.stretch,'material changes retain independent settings');
    await page.locator('#physics-material').selectOption('oily');Check(await page.locator('#physics-viscosity').count()===1&&await page.locator('#physics-bend').count()===0,'oil gel exposes its own applicable physical controls');
    await page.locator('#physics-recovery').focus();await page.locator('#physics-recovery').press('End');await page.locator('#physics-recovery').press('ArrowLeft');const oil=(await Probe()).physicsSettings.oily.recovery;
    Check(oil===.29,'oil shape recovery is adjustable');await Shot('Oil');
    Check(JSON.stringify((await Probe()).targets.map(c=>c.position))===JSON.stringify(original.targets.map(c=>c.position)),'editing parameters does not rebuild or move the current ear');
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),WAX_PHYSICS_STORAGE);Check(saved.dry.stretch===dry&&saved.oily.recovery===oil,'all material changes persist in the separate physics key');
    Check(await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'))===business,'physics edits preserve the economy save');
    Check(await page.evaluate(()=>{const d=document.querySelector('#settings-dialog');return document.documentElement.scrollWidth<=innerWidth&&d.scrollWidth<=d.clientWidth+1;}),'expanded settings have no horizontal overflow');
    const close=await page.locator('#settings-close').boundingBox();Check(close.y>=0&&close.y+close.height<=height,'close button remains visible at the bottom of a long panel');
    await Click('#settings-close');Check(!await page.locator('#settings-dialog').evaluate(e=>e.open),'close button works after scrolling');
    await page.reload();await Ready();Check((await Probe()).physicsSettings.dry.stretch===dry&&(await Probe()).physicsSettings.oily.recovery===oil,'reloading restores the adjusted values before play');
    await Open();Check(+(await slider.inputValue())===dry,'reloaded slider shows the persisted value');await Click('#physics-reset');
    Check(JSON.stringify((await Probe()).physicsSettings)===JSON.stringify(defaults),'reset restores all four materials at once');
    Check((await page.locator('#physics-status').textContent()).includes('全部材质已恢复默认'),'reset has a visible completion status');await Shot('Reset');
    await page.reload();await Ready();Check(JSON.stringify((await Probe()).physicsSettings)===JSON.stringify(defaults),'reset defaults remain after reload');
    await page.evaluate(key=>localStorage.setItem(key,'{broken'),WAX_PHYSICS_STORAGE);await page.reload();await Ready();await Open();
    Check(JSON.stringify((await Probe()).physicsSettings)===JSON.stringify(defaults)&&(await page.locator('#physics-status').textContent()).includes('未能读取'),'corrupt stored data falls back without blocking the game');
    await Click('#settings-close');await Click('#ear-start');await Click('#settings-open');Check(await page.locator('#physics-settings').count()===1,'same Debug section is available during service');
    Check(report.errors.length===0,'no console, page or asset errors');console.log('PASS physics settings',width,report.checks.length,'checks');
  }catch(error){report.failure=error.message;await Shot('Failure');throw error;}finally{await page.close();}
}
  const page=await browser.newPage();await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked');};Storage.prototype.setItem=()=>{throw new Error('blocked');};});
  await page.goto(url);await page.waitForFunction(()=>window.__EarSpaProbe,{timeout:60000});await page.locator('#welcome-settings').click();await page.locator('#physics-settings>summary').click();await page.locator('#physics-reset').click();
  assert.ok((await page.locator('#physics-status').textContent()).includes('本次会话有效'),'storage denial is reported without preventing adjustment');await page.close();console.log('PASS storage-unavailable settings');
}finally{await fs.writeFile(path.join(here,'_dev/Data_PhysicsSettingsPlayReport.json'),JSON.stringify(reports,null,2));await browser.close();}
