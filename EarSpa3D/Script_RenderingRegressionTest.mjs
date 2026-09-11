import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim()),require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8082/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']}),page=await browser.newPage({viewport:{width:1000,height:900}}),report={checks:[],errors:[]};
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);const initial=await page.evaluate(()=>__EarSpaProbe());
 Check(initial.rendering.shadersWarmed,'all initial tool materials are prepared before accepting play');
 Check(initial.rendering.outerPbr==='Texture_OuterSkinPbrAtlas.png'&&initial.rendering.outerSssStrength!==initial.rendering.sssStrength,'outside skin has a separate atlas and scattering profile');
 Check(initial.stats.triangles<=180000&&initial.stats.drawCalls<=120,'external ear framing respects geometry and draw budget');
 report.rays=await page.evaluate(async()=>{const T=await import('three'),{core}=__EarSpaDebug,wall=core.scene.getObjectByName('Model_Canal'),reference=wall.clone();reference.raycast=T.Mesh.prototype.raycast;reference.updateMatrixWorld(true);let count=0,maxError=0;
  for(let i=0;i<192;i++){const ray=new T.Raycaster(new T.Vector3(Math.sin(i*1.3),Math.cos(i*.7),i%2?6:-1),new T.Vector3(Math.sin(i*.53)*.65,Math.cos(i*.31)*.65,1).normalize()),a=ray.intersectObject(wall)[0],b=ray.intersectObject(reference)[0];if(!!a!==!!b)throw Error('BVH changed visible wall intersection');if(a){maxError=Math.max(maxError,Math.abs(a.distance-b.distance));count++;}}
  const head=core.scene.getObjectByName('Model_Temple'),ray=new T.Raycaster(core.camera.position,new T.Vector3().sub(core.camera.position).normalize()),ear=ray.intersectObject(wall)[0],skin=ray.intersectObject(head)[0];return{count,maxError,canalBeforeHead:!!ear&&(!skin||ear.distance<skin.distance)};
 });
 Check(report.rays.count>150&&report.rays.maxError<1e-7,'192 BVH rays match independent full triangle searches');Check(report.rays.canalBeforeHead,'head skin does not obstruct the external canal entrance');
 await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
 report.ao=await page.evaluate(()=>{const{core,view}=__EarSpaDebug;function Pixels(){core.Render();const gl=core.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,out=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}view.SetContact(false);const off=Pixels();view.SetContact(true);const on=Pixels();let count=0,sum=0;for(let i=0;i<on.length;i+=4){const d=(off[i]+off[i+1]+off[i+2]-on[i]-on[i+1]-on[i+2])/3;if(d>2){count++;sum+=d;}}return{pixels:count,fraction:count/(on.length/4),mean:sum/Math.max(1,count)};});
 Check(report.ao.pixels>200&&report.ao.fraction<.20,'AO produces measurable local edges without darkening the whole screen');
 for(const id of ['drops','feather']){const before=await page.evaluate(()=>__EarSpaDebug.core.renderer.info.programs.length),start=performance.now();await page.locator('[data-tool="'+id+'"]').click();await page.mouse.move(520,240);await page.evaluate(()=>__EarSpaDebug.StepFrames(1));const after=await page.evaluate(()=>__EarSpaDebug.core.renderer.info.programs.length);report[id]={firstInteractionMs:performance.now()-start,newPrograms:after-before};Check(after-before<=4,id+' first use reuses its prepared programs');}
 const start=performance.now();for(let i=0;i<30;i++)await page.mouse.move(350+i*10,520+Math.sin(i*.4)*45);report.feather.sweep30Ms=performance.now()-start;
 report.extraction=[];
 for(const [width,height] of [[1000,900],[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});await page.reload();await page.waitForFunction(()=>window.__EarSpaDebug);await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));const t=await page.evaluate(()=>__EarSpaProbe().targets[0]);await page.locator('[data-tool="drops"]').click();await page.mouse.click(t.screen.x,t.screen.y);await page.evaluate(()=>__EarSpaDebug.StepFrames(195));await page.locator('[data-tool="tweezers"]').click();await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down();await page.evaluate(()=>__EarSpaDebug.StepFrames(130));await page.mouse.up();await page.evaluate(()=>__EarSpaDebug.StepFrames(85));const p=await page.evaluate(()=>__EarSpaProbe()),b=p.rendering.trayBounds;
  Check(b.visible&&b.x>=0&&b.right<=width&&b.y>=0&&b.bottom<=height,width+' extraction keeps the floating tray within the viewport');Check(p.rendering.headRealtime&&p.rendering.outerVisible&&p.stats.triangles<=180000,width+' extraction retains the local live ear within budget');report.extraction.push({width,height,bounds:b,triangles:p.stats.triangles});await page.screenshot({path:path.join(here,'_dev/Shot_LocalExtractionFinal_'+width+'.png')});
 }
 Check(report.errors.length===0,'rendering regression has no shader or page errors');console.log('PASS '+report.checks.length+' rendering and startup regressions');
}finally{await fs.writeFile(path.join(here,'_dev/Data_RenderingRegressionReport.json'),JSON.stringify(report,null,2));await browser.close();}
