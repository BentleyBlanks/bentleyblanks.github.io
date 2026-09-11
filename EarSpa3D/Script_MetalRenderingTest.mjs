import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim()),require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8106/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']}),page=await browser.newPage({viewport:{width:1000,height:900}}),report={checks:[],errors:[],finishes:[],pixels:[]};
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
 // 覆盖真实等级/皮肤切换后的整件工具，包含合并网格里的滴管箍环与吸引管。
 for(let level=1;level<=5;level++)for(const skin of ['classic','walnut','jade']){
  const sample=await page.evaluate(({level,skin})=>{
   const ids=['scoop','tweezers','drops','brush','suction','feather'],{core,view}=__EarSpaDebug;
   view.SetSkins(Object.fromEntries(ids.map(id=>[id,skin])),Object.fromEntries(ids.map(id=>[id,level])));
   let metals=0,handles=0;const failures=[];
   core.scene.traverse(n=>{for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[]){
    const steel=/ToolSteel/.test(m.name),handle=/ToolHandle/.test(m.name),expected=steel||(handle&&skin==='classic'&&level>1);
    if(steel||handle){if(expected){metals++;if(m.metalness!==1||!m.envMap||m.envMap===core.scene.environment||!m.userData.instrumentMetal)failures.push(n.name+':missing conductor reflection');}else{handles++;if(m.metalness!==0||m.userData.instrumentMetal||m.envMap)failures.push(n.name+':non-metal converted');}}
   }});__EarSpaDebug.StepFrames(1);return{level,skin,metals,handles,failures};
  },{level,skin});report.finishes.push(sample);Check(sample.metals>=4&&sample.failures.length===0,'all tool metal assignments at '+level+'/'+skin);
 }
 await page.evaluate(()=>__EarSpaDebug.view.SetSkins({},{}));
 await page.locator('#shop-open').click();
 for(const id of ['scoop','tweezers','drops','brush','suction','feather']){
  await page.locator('[data-select-tool="'+id+'"]').click();
  await page.evaluate(id=>{const canvas=document.createElement('canvas');canvas.id='metal-preview';canvas.style.cssText='width:460px;height:300px;position:fixed;left:10px;top:10px;z-index:99999;background:#24221f';document.querySelector('#shop-dialog').append(canvas);window.metalPreview=__EarSpaDebug.view.CreateToolPreview(canvas,id,2,5,'classic');},id);
  const canvas=page.locator('#metal-preview');await canvas.screenshot({path:path.join(here,'_dev/Shot_Metal_'+id+'_Full.png')});
  await page.evaluate(()=>metalPreview.SetView('tip'));const before=await canvas.screenshot({path:path.join(here,'_dev/Shot_Metal_'+id+'_Tip.png')});
  const box=await canvas.boundingBox();await page.mouse.move(box.x+170,box.y+140);await page.mouse.down();await page.mouse.move(box.x+260,box.y+140,{steps:8});await page.mouse.up();const after=await canvas.screenshot({path:path.join(here,'_dev/Shot_Metal_'+id+'_Rotated.png')});Check(!before.equals(after),id+' preview renders real rotation');
  await page.evaluate(()=>{metalPreview.Dispose();document.getElementById('metal-preview').remove();delete window.metalPreview;});
 }
 await page.locator('#shop-close').click();
 for(const [width,height,quality] of [[1000,900,'high'],[390,844,'low']]){
  await page.setViewportSize({width,height});await page.evaluate(q=>{__EarSpaDebug.core.SetQuality(q);__EarSpaDebug.StepFrames(60);},quality);
  await page.locator('[data-tool="tweezers"]').click();const t=await page.evaluate(()=>__EarSpaProbe().targets[0]);await page.mouse.move(t.screen.x,t.screen.y);await page.evaluate(()=>__EarSpaDebug.StepFrames(5));
  const pixels=await page.evaluate(()=>{
   const {core}=__EarSpaDebug,metals=new Set();core.scene.traverse(n=>{for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[])if(m.userData.instrumentMetal)metals.add(m);});
   function Read(){core.Render();const gl=core.renderer.getContext(),out=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}
   const on=Read(),saved=[...metals].map(m=>[m,m.envMapIntensity]);saved.forEach(([m])=>m.envMapIntensity=0);const off=Read();saved.forEach(([m,v])=>m.envMapIntensity=v);core.Render();
   const luminance=[];let energy=0,clipped=0;for(let i=0;i<on.length;i+=4){const delta=(on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2])/3;if(delta>3){const l=(on[i]+on[i+1]+on[i+2])/3;luminance.push(l);energy+=delta;if(l>250)clipped++;}}
   luminance.sort((a,b)=>a-b);return{affected:luminance.length,meanReflection:energy/Math.max(1,luminance.length),p10:luminance[Math.floor(luminance.length*.1)],p90:luminance[Math.floor(luminance.length*.9)],clippedFraction:clipped/Math.max(1,luminance.length),programs:core.renderer.info.programs.length,textures:core.renderer.info.memory.textures};
  });report.pixels.push({width,height,quality,...pixels});
  Check(pixels.affected>300&&pixels.meanReflection>8,quality+' metal reflection changes actual visible pixels');Check(pixels.p90-pixels.p10>55&&pixels.clippedFraction<.03,quality+' reflections retain dark/bright bands without white clipping');
  await page.screenshot({path:path.join(here,'_dev/Shot_Metal_Game_'+quality+'.png')});
  await page.locator('#lamp-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(3));const dark=await page.evaluate(()=>({lamp:__EarSpaProbe().rendering.lampIntensity,metal:__EarSpaDebug.core.scene.getObjectByName('Model_ForcepsJawLeft').material.envMapIntensity}));Check(dark.lamp===0&&dark.metal<.06,'lamp off keeps the metal in the dark canal');await page.screenshot({path:path.join(here,'_dev/Shot_Metal_Dark_'+quality+'.png')});await page.locator('#lamp-toggle').click();
 }
 const stats=await page.evaluate(()=>__EarSpaProbe().stats);Check(stats.triangles<=180000&&stats.drawCalls<=120,'metal rendering stays within scene budget');report.stats=stats;Check(report.errors.length===0,'no shader errors, page errors or failed assets');report.clean=true;console.log('PASS '+report.checks.length+' metal rendering checks');
}finally{await fs.writeFile(path.join(here,'_dev/Data_MetalRenderingReport.json'),JSON.stringify(report,null,2));await browser.close();}
