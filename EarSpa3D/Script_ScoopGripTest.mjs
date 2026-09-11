import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim()),require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8098/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']}),page=await browser.newPage({viewport:{width:1000,height:900}}),report={errors:[],editions:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
  report.geometry=await page.evaluate(async()=>{
    const T=await import('three'),{GLTFLoader}=await import('./vendor/three/examples/jsm/loaders/GLTFLoader.js'),asset=await new GLTFLoader().loadAsync('./Models/Model_ImmersiveEar.glb');
    return ['','_Basic','_Refined','_Master'].map(suffix=>{
      const mesh=asset.scene.getObjectByName('Model_ScoopShaft'+suffix),g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv,index=g.index;
      mesh.material=new T.MeshBasicMaterial({side:T.DoubleSide});mesh.updateMatrixWorld(true);
      let maxUvSpan=0,maxAxialError=0,maxSurfaces=0,minSurfaces=Infinity,rays=0;
      for(let i=0;i<p.count;i++)maxAxialError=Math.max(maxAxialError,Math.abs(uv.getY(i)-(1-(p.getY(i)-.4)/19.6)));
      for(let i=0;i<index.count;i+=3){const u=[0,1,2].map(k=>uv.getX(index.getX(i+k)));maxUvSpan=Math.max(maxUvSpan,Math.max(...u)-Math.min(...u));}
      // Count actual triangle intersections across the grip: nested sleeves
      // produce four surfaces even when the renderer hides one with depth tests.
      for(let i=0;i<41;i++)for(let j=0;j<7;j++){
        const a=(j+.371)*Math.PI*2/7,origin=new T.Vector3(Math.cos(a),10.137+i*.232,Math.sin(a)),direction=new T.Vector3(-origin.x,0,-origin.z);
        const hits=new T.Raycaster(origin,direction,0,2).intersectObject(mesh),distances=[];
        for(const hit of hits)if(!distances.some(d=>Math.abs(d-hit.distance)<1e-6))distances.push(hit.distance);
        minSurfaces=Math.min(minSurfaces,distances.length);maxSurfaces=Math.max(maxSurfaces,distances.length);rays++;
      }
      return{suffix,rays,minSurfaces,maxSurfaces,maxUvSpan,maxAxialError,triangles:index.count/3};
    });
  });
  for(const g of report.geometry){assert.equal(g.minSurfaces,2);assert.equal(g.maxSurfaces,2);assert.ok(g.maxUvSpan<=1/32+1e-6);assert.ok(g.maxAxialError<1e-6);}
  await page.locator('#ear-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(150));await page.locator('#shop-open').click();await page.locator('[data-preview-view="grip"]').click();
  await page.locator('#tool-preview').screenshot({path:path.join(here,'_dev/Shot_ScoopGrip_Comparison.png')});
  // Exercise the same preview factory at all existing editions and skin choices.
  for(const [level,skin] of [[1,'classic'],[2,'classic'],[4,'classic'],[4,'walnut'],[4,'jade']]){
    await page.evaluate(({level,skin})=>{
      const canvas=document.createElement('canvas');canvas.id='grip-audit';canvas.style.cssText='width:460px;height:300px';document.querySelector('.preview-stage').append(canvas);
      window.gripAudit=__EarSpaDebug.view.CreateToolPreview(canvas,'scoop',level,Math.min(5,level+1),skin);gripAudit.SetView('grip');
    },{level,skin});
    const canvas=page.locator('#grip-audit');await canvas.screenshot({path:path.join(here,`_dev/Shot_ScoopGrip_${level}_${skin}.png`)});
    const box=await canvas.boundingBox();await page.mouse.move(box.x+200,box.y+150);await page.mouse.down();await page.mouse.move(box.x+350,box.y+150,{steps:12});await page.mouse.up();
    await canvas.screenshot({path:path.join(here,`_dev/Shot_ScoopGrip_${level}_${skin}_Rotated.png`)});
    await page.evaluate(()=>{gripAudit.Dispose();document.getElementById('grip-audit').remove();delete window.gripAudit;});report.editions.push({level,skin});
  }
  await page.locator('#shop-close').click();report.stats=await page.evaluate(()=>__EarSpaProbe().stats);
  assert.ok(report.stats.triangles<=180000);assert.equal(report.errors.length,0);report.clean=true;
  console.log('PASS: 1148 grip cross-sections, continuous UVs, five material/edition previews; no browser errors');
}finally{await fs.writeFile(path.join(here,'_dev/Data_ScoopGripReport.json'),JSON.stringify(report,null,2));await browser.close();}
