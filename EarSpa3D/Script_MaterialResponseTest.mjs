import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
assert.ok(url,'Pass the current worktree --url=http://127.0.0.1:PORT/EarSpa3D/');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const report={checks:[],errors:[],views:[]},Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  const Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
  await page.screenshot({path:path.join(here,'_dev/Shot_MaterialResponse_Outer.png')});
  await page.locator('#ear-start').click();await Step(150);await page.locator('#lamp-toggle').click();await page.mouse.move(595,430);await Step(3);
  await page.screenshot({path:path.join(here,'_dev/Shot_MaterialResponse_Mixed.png')});
  for(const type of ['dry','wet','impacted','oily']){
    await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption(type);await page.locator('#practice-start').click();await Step(150);await page.mouse.move(595,430);await Step(3);
    const state=await page.evaluate(()=>{
      const {view,core}=__EarSpaDebug;core.Render();
      return{stats:{...core.stats},chunks:view.chunks.filter(c=>!c.fine).map(c=>({type:c.type,thickness:c.body.surface?Array.from(c.mesh.geometry.attributes.waxResponse.array).filter((v,i)=>i%3===0):[],opaque:!c.mesh.material.transparent,depthWrite:c.mesh.material.depthWrite}))};
    });
    report.views.push({type,...state});
    Check(state.stats.triangles<=180000&&state.stats.drawCalls<=120,type+' stays within the full scene geometry/draw budget: '+state.stats.triangles+' / '+state.stats.drawCalls);
    if(type!=='oily')Check(state.chunks.every(c=>c.opaque&&c.depthWrite&&c.thickness.every(v=>v>0&&Number.isFinite(v))),type+' uses measured shell thickness and stable depth writing');
    await page.screenshot({path:path.join(here,'_dev/Shot_MaterialResponse_'+type+'.png')});
  }
  // Controlled solver fixture checks coupling, independently of the real-input test.
  await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('wet');await page.locator('#practice-start').click();await Step(150);
  report.coupling=await page.evaluate(async()=>{
    const {view,core}=__EarSpaDebug,{GripPeelBody,StepPeelBody,WritePeelSurface}=await import('./Script_PeelPhysics.mjs');
    const {FractureGeometry,GeometryVolume}=await import('./Script_FractureGeometry.js');
    const c=view.chunks[0],s=c.body.surface,g=c.mesh.geometry;
    const materialCoordinates=g.attributes.waxRest.array.slice(),before=view.RenderingProbe().contactRefreshes;
    const point=s.points[53].slice(),target=point.map((v,i)=>v+c.normal.toArray()[i]*.6);
    GripPeelBody(c.body,point);
    for(let i=0;i<60;i++)StepPeelBody(c.body,{target,minAnchors:c.body.anchors.length},1/60);
    c.mesh.position.fromArray(c.body.position);c.mesh.quaternion.fromArray(c.body.rotation);
    WritePeelSurface(c.body,g.attributes.position.array,g.attributes.waxResponse.array);
    g.attributes.position.needsUpdate=g.attributes.waxResponse.needsUpdate=true;g.computeVertexNormals();
    view.Update(.08);core.Render();
    const response=Array.from(g.attributes.waxResponse.array),restStable=materialCoordinates.every((v,i)=>v===g.attributes.waxRest.array[i]);
    const pieces=FractureGeometry(g,{normal:[0,1,0],point:[0,0,0]});
    const cut={count:pieces.length,volumeError:Math.abs(pieces.reduce((sum,p)=>sum+GeometryVolume(p),0)/GeometryVolume(g)-1),attributes:pieces.every(p=>p.attributes.waxRest?.count===p.attributes.position.count&&p.attributes.waxCap.array.some(v=>v===1)&&p.attributes.waxResponse.array.every(Number.isFinite))};
    pieces.forEach(p=>p.dispose());
    return{bend:c.body.bend,peakStrain:Math.max(...response.filter((v,i)=>i%3===1)),finite:response.every(Number.isFinite),restStable,refreshes:view.RenderingProbe().contactRefreshes-before,cut};
  });
  const coupling=report.coupling;
  Check(coupling.bend>.05&&coupling.peakStrain>.01&&coupling.finite,'a loaded solver shell drives finite local material strain');
  Check(coupling.restStable,'surface grain stays in the same material coordinates while bending');
  Check(coupling.refreshes>0,'contact silhouette is regenerated from the bent surface');
  Check(coupling.cut.count===2&&coupling.cut.attributes&&coupling.cut.volumeError<.01,'fracture preserves material coordinates, physical response, closed caps and volume');
  await page.screenshot({path:path.join(here,'_dev/Shot_MaterialResponse_Loaded.png')});
  for(const [width,height] of [[390,844],[320,568],[844,390]]){
    await page.setViewportSize({width,height});await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption('mixed');await page.locator('#practice-start').click();await Step(150);await page.mouse.move(width*.5,height*.46);await Step(3);
    Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' layout fits viewport');
    await page.screenshot({path:path.join(here,'_dev/Shot_MaterialResponse_'+width+'.png')});
  }
  Check(report.errors.length===0,'no page, shader or resource errors');
  console.log('PASS '+report.checks.length+' material response/render checks '+JSON.stringify(coupling));
}finally{await fs.writeFile(path.join(here,'_dev/Data_MaterialResponseReport.json'),JSON.stringify(report,null,2));await browser.close();}
