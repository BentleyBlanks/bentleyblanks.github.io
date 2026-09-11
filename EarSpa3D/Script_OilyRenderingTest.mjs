import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim()),require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8110/EarSpa3D/',browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),report={checks:[],errors:[]};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});const page=await browser.newPage({viewport:{width:1000,height:900}});
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
await page.addInitScript(()=>{window.nativeFrame=requestAnimationFrame.bind(window);window.localStorage.setItem('earspa3d.shop.v1',JSON.stringify({version:2,coins:500,day:3,toolLevels:{}}));});
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>requestAnimationFrame=()=>0);await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
 let p=await page.evaluate(()=>__EarSpaProbe());Check(p.earType==='oily'&&p.practice===null&&p.targets.every(c=>c.type==='oily'),'ordinary business customers can naturally be oily');
 const maps=await page.evaluate(()=>__EarSpaDebug.view.chunks.map(c=>({transmission:c.mesh.material.transmission,ior:c.mesh.material.ior,thickness:!!c.mesh.geometry.attributes.gelThickness,rest:!!c.mesh.geometry.attributes.gelRest,clearcoat:c.mesh.material.clearcoat})));
 Check(maps.every(m=>m.transmission>0&&m.ior>1&&m.thickness&&m.rest&&m.clearcoat>0),'wet dielectric shading has material-space pigment and physical thickness inputs');
 await page.locator('[data-tool="tweezers"]').click();p=await page.evaluate(()=>__EarSpaProbe());const target=p.targets.find(c=>c.id===2);await page.mouse.move(target.screen.x,target.screen.y);await page.mouse.down();
 report.timing=await page.evaluate(async()=>{
  const samples=[],cpu=[],gl=__EarSpaDebug.core.renderer.getContext();
  for(let i=0;i<135;i++){await new Promise(nativeFrame);const start=performance.now();__EarSpaDebug.StepFrames(1);cpu.push(performance.now()-start);gl.finish();samples.push(performance.now()-start);}
  const Summary=a=>{const s=a.slice(15).sort((a,b)=>a-b);return{median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};return{frameWithGpuMs:Summary(samples),frameSubmissionMs:Summary(cpu),renderer:gl.getParameter(gl.RENDERER)};
 });
 report.surface=await page.evaluate(async()=>{
  const T=await import('three'),{view,core}=__EarSpaDebug,c=view.chunks.find(c=>c.id===2),mesh=c.mesh,wall=core.scene.getObjectByName('Model_Canal');core.scene.updateMatrixWorld(true);const positions=mesh.geometry.attributes.position;let minimum=Infinity,count=0;
  for(let i=0;i<positions.count;i+=3){const world=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld),projected=view.canal.Project(world);if(projected.depth<0||projected.depth>20)continue;const center=view.canal.CenterAt(projected.depth).clone(),delta=world.clone().sub(center),distance=delta.length(),hit=new T.Raycaster(center,delta.normalize(),0,10).intersectObject(wall)[0];if(hit){minimum=Math.min(minimum,hit.distance-distance);count++;}}
  return{count,minimum,volumeRatio:c.body.gel.volumeRatio,minJacobian:c.body.gel.minJacobian,peakStretch:c.body.gel.peakStretch};
 });
 Check(report.surface.count>100&&report.surface.minimum>-.08,'independent rendered-mesh rays find no material canal penetration');
 Check(report.surface.peakStretch>1.8&&report.surface.minJacobian>0,'ordinary oily customer stretches without inverted volume cells');
 Check(report.timing.frameWithGpuMs.p95<80,'measured GPU-complete frames avoid sustained long stalls on this machine');
 await page.screenshot({path:path.join(here,'_dev/Shot_OilyBusinessHeld.png')});await page.mouse.up();await page.evaluate(()=>__EarSpaDebug.StepFrames(230));
 const saved=await page.evaluate(()=>__EarSpaProbe()),saveText=await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'));
 Check(saved.tray.count===1&&saved.harvest.length===1,'normal collection creates a persistent gel tray piece');
 await page.locator('#settings-open').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
 Check((await page.evaluate(()=>__EarSpaProbe())).tray.count===0,'practice begins with its own empty tray');
 await page.locator('#settings-open').click();await page.locator('#practice-return').click();p=await page.evaluate(()=>__EarSpaProbe());
 Check(p.tray.count===saved.tray.count&&JSON.stringify(p.tray.pieces)===JSON.stringify(saved.tray.pieces)&&p.cleanliness===saved.cleanliness&&p.elapsed===saved.elapsed,'returning restores a nonempty tray and partially cleaned business ear');
 Check(await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'))===saveText,'the partially completed business save is unchanged');
 report.preparation=await page.evaluate(async()=>{const {view}=__EarSpaDebug;await view.PrepareCustomer(88001,{urgent:true,earType:'oily'});await view.PrepareCustomer(88001,{urgent:true,earType:'dry'});view.Reset(88001,'dry');return{types:view.chunks.filter(c=>!c.fine).map(c=>c.type),...view.PreparationProbe()};});
 Check(report.preparation.types.every(t=>t==='dry'),'preparation cache keys include ear type as well as seed');
 Check(report.errors.length===0,'no shader, browser or asset errors');console.log('PASS oily rendering',report.checks.length,JSON.stringify(report.timing));
}finally{await fs.writeFile(path.join(here,'_dev/Data_OilyRenderingReport.json'),JSON.stringify(report,null,2));await browser.close();}
