import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);assert.ok(url,'Pass the current worktree --url=');
const revision=process.argv.find(a=>a.startsWith('--compare='))?.slice(10);
const previous=revision?execFileSync('git',['show',revision+':EarSpa3D/Script_FractureGeometry.js'],{encoding:'utf8'}):null;
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const report={checks:[],errors:[]},Check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.locator('#ear-start').click();await page.locator('#lamp-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
  report.normals=await page.evaluate(async previous=>{
    const T=await import('three'),current=await import('./Script_FractureGeometry.js');
    let old=null,blob=null;
    if(previous){blob=URL.createObjectURL(new Blob([previous.replace("from 'three'",'from '+JSON.stringify(new URL('./vendor/three/build/three.module.js?v=ear013-fixed-rotation-20260912',location.href).href))],{type:'text/javascript'}));old=await import(blob);}
    const {core,view}=__EarSpaDebug,{GripPeelBody,StepPeelBody,WritePeelSurface}=await import('./Script_PeelPhysics.mjs');
    const result={maxError:0,cases:0,finite:true,beforeMs:null,afterMs:null};
    const geometries=[];
    for(const c of view.chunks.filter(c=>!c.fine)){
      const s=c.body.surface,p=s.points[53].slice();GripPeelBody(c.body,p);
      for(let frame=0;frame<15;frame++)StepPeelBody(c.body,{target:p.map((v,i)=>v+c.normal.toArray()[i]*.2),minAnchors:c.body.anchors.length},1/60);
      const g=c.mesh.geometry;WritePeelSurface(c.body,g.attributes.position.array,g.attributes.waxResponse.array);g.attributes.position.needsUpdate=true;
      geometries.push(g.clone());
      for(const piece of current.FractureGeometry(g,{normal:[0,1,0],point:[0,0,0]}))geometries.push(piece);
    }
    for(const g of geometries){
      current.SmoothWaxNormals(g);const actual=g.attributes.normal.array.slice();
      result.finite&&=actual.every(Number.isFinite);
      if(old){old.SmoothWaxNormals(g);for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-g.attributes.normal.array[i]);if(error>result.maxError){result.maxError=error;result.worst={case:result.cases,vertex:Math.floor(i/3),cap:g.attributes.waxCap?.getX(Math.floor(i/3)),position:Array.from(g.attributes.position.array.slice(Math.floor(i/3)*3,Math.floor(i/3)*3+3))};}}}
      result.cases++;
    }
    function Measure(fn){const samples=[];for(let round=0;round<5;round++){const start=performance.now();for(let i=0;i<10;i++)for(const g of geometries)fn(g);samples.push((performance.now()-start)/(geometries.length*10));}return samples.sort((a,b)=>a-b)[2];}
    result.afterMs=Measure(current.SmoothWaxNormals);if(old)result.beforeMs=Measure(old.SmoothWaxNormals);
    for(const g of geometries)g.dispose();if(blob)URL.revokeObjectURL(blob);
    // A controlled release isolates the new flight/landing pipeline; actual
    // mouse and touch extraction are covered independently by ToolDragPlayTest.
    const c=view.chunks[0];for(const anchor of c.body.anchors)anchor.alive=false;c.body.detached=true;c.state='held';c.toolId='tweezers';
    view.Release(c);const samples=[];let firstLanding=null;
    for(let frame=0;frame<250;frame++){
      const landed=view.Update(1/60);if(frame%6===0)samples.push({frame,state:c.state,position:c.mesh.position.toArray(),rotation:c.mesh.quaternion.toArray(),stored:!!c.trayStored});
      if(landed.includes(c)&&firstLanding===null)firstLanding=frame;
    }
    core.Render();return{...result,flight:samples,firstLanding,stored:c.trayStored,stats:{...core.stats},tray:view.TrayProbe?.()};
  },previous);
  Check(report.normals.cases>=18&&report.normals.finite,'loaded shells and sealed cuts retain finite normals');
  if(previous)Check(report.normals.maxError<1e-5,'cached normals match the original area weighting on loaded shells and sealed cuts');
  Check(report.normals.firstLanding>90&&report.normals.firstLanding<204&&report.normals.stored,'released shell falls and is stored only after a real landing');
  const falling=report.normals.flight.filter(s=>s.state==='dropping'&&!s.stored);
  Check(falling.length>=3&&falling.some(s=>Math.abs(s.rotation[0]-falling[0].rotation[0])>1e-5),'the lightweight shell banks continuously during its measured fall');
  Check(report.normals.stats.triangles<=180000&&report.normals.stats.drawCalls<=120,'collected scene stays within geometry and draw budgets');
  await page.evaluate(()=>{const{view,core}=__EarSpaDebug;view.Showcase();for(let i=0;i<180;i++)view.Update(1/60);core.Render();});
  await page.screenshot({path:path.join(here,'_dev/Shot_LightWax_Tray.png')});
  await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
  await page.screenshot({path:path.join(here,'_dev/Shot_LightWax_Final.png')});
  Check(report.errors.length===0,'no browser or shader errors');
  console.log('PASS '+report.checks.length+' light wax render checks '+JSON.stringify({normalCases:report.normals.cases,maxError:report.normals.maxError,beforeMs:report.normals.beforeMs,afterMs:report.normals.afterMs,firstLanding:report.normals.firstLanding}));
}finally{await fs.writeFile(path.join(here,'_dev/Data_LightWaxRenderReport.json'),JSON.stringify(report,null,2));await browser.close();}
