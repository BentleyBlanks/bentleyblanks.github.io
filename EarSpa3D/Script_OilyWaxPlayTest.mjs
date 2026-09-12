import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {InstrumentContact} from './Script_InstrumentInteraction.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8143/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),reports=[];
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{for(const [width,height,touch] of (process.argv.includes('--diagnose')?[[1000,900,false]]:[[1000,900,false],[390,844,true],[320,568,true],[844,390,true]])){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),cdp=await page.context().newCDPSession(page),report={width,height,checks:[],errors:[],bites:[]};reports.push(report);
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
 // 整耳检查保持全部 60 Hz 游戏帧与 240 Hz 物理步，仅合并同一次同步推进中不可见的绘制。
 // 单帧 GPU 性能、连续渲染与穿透另由 OilyRenderingTest 验证。
 const Check=(ok,label)=>{assert.ok(ok,width+': '+label);report.checks.push(label);},Probe=()=>page.evaluate(()=>__EarSpaProbe()),Step=async n=>{await page.bringToFront();return page.evaluate(n=>{const {core}=__EarSpaDebug,render=core.Render;let frame=0;core.Render=()=>{if(++frame%12===0||frame===n)render();else core.scene.updateMatrixWorld(true);};try{return __EarSpaDebug.StepFrames(n);}finally{core.Render=render;}},n)},Shot=name=>page.screenshot({path:path.join(here,'_dev/Shot_Oily'+name+'_'+width+'.png')});
 async function Input(down,t){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:down?'touchStart':'touchEnd',touchPoints:down?[{x:t.screen.x,y:t.screen.y}]:[]});else if(down){await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down();}else await page.mouse.up();}
 async function Candidates(){
  return page.evaluate(async()=>{
   const T=await import('three'),{view,core}=__EarSpaDebug,camera=core.camera,wall=core.scene.getObjectByName('Model_Canal'),chunks=view.chunks.filter(c=>c.mass>0&&['attached','returning'].includes(c.state)),out=[],possible=[];
   core.scene.updateMatrixWorld(true);
   for(const c of chunks){
    const p=c.mesh.geometry.attributes.position,idx=c.mesh.geometry.index,h=c.mesh.geometry.attributes.gelThickness;
    for(let i=0;i<idx.count;i+=Math.max(3,Math.floor(idx.count/600/3)*3)){
     const ids=[0,1,2].map(k=>idx.getX(i+k)),world=ids.reduce((v,id)=>v.add(new T.Vector3().fromBufferAttribute(p,id)),new T.Vector3()).multiplyScalar(1/3).applyMatrix4(c.mesh.matrixWorld),screen=view.Project(world);
     screen.x=Math.floor(screen.x);screen.y=Math.floor(screen.y);if(screen.z<=-1||screen.z>=1||screen.x<8||screen.x>innerWidth-8||screen.y<8||screen.y>innerHeight-8)continue;
     const element=document.elementFromPoint(screen.x,screen.y);if(element?.id!=='ear-canvas')continue;
     const thickness=ids.reduce((n,id)=>n+h.getX(id)/3,0);possible.push({c,world,screen,thickness,score:thickness-Math.hypot(screen.x-innerWidth/2,screen.y-innerHeight/2)/innerWidth*.1});
    }
   }
   const bins=new Set(),meshes=chunks.map(c=>c.mesh),ray=new T.Raycaster(),aperture=core.scene.getObjectByName('Model_EntryAperture');
   for(const {c,world,screen,thickness,score} of possible.sort((a,b)=>b.score-a.score)){
    const bin=c.id+':'+Math.round(screen.x/12)+':'+Math.round(screen.y/12);if(bins.has(bin))continue;
    ray.setFromCamera(new T.Vector2(screen.x/innerWidth*2-1,1-screen.y/innerHeight*2),camera);ray.far=80;
    const hit=ray.intersectObjects(meshes)[0],skin=ray.intersectObject(wall)[0],rim=aperture?.visible?ray.intersectObject(aperture)[0]:null;
    if(hit?.object!==c.mesh||skin&&hit.distance>=skin.distance+.015||rim&&rim.distance<hit.distance||hit.point.distanceTo(world)>.08)continue;
    const depth=view.canal.Project(world).depth;if(depth>view.Reach('tweezers'))continue;bins.add(bin);out.push({id:c.id,screen,depth,thickness,score});if(out.length===32)break;
   }return out;
  });
 }
 async function Align(t){
  const normal=await page.evaluate(id=>__EarSpaDebug.view.chunks.find(c=>c.id===id).normal.toArray(),t.id);
  if(touch){await page.locator('#mode-turn').click();await Input(true,t);}else{await page.mouse.move(t.screen.x,t.screen.y);await page.mouse.down({button:'right'});}
  for(let i=0;i<70;i++){await Step(3);if(InstrumentContact('tweezers',(await Probe()).rendering.toolRotation,normal).aligned)break;}
  if(touch){await Input(false);await page.locator('#mode-force').click();}else await page.mouse.up({button:'right'});
 }
 try{
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>requestAnimationFrame=()=>0);
  await page.locator('#ear-start').click();await Step(140);const business=await Probe(),savedShop=await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'));
  await page.locator('#settings-open').click();await page.locator('#practice-start').click();await Step(140);const base=await Probe();await Shot('BiteRest');
  Check(base.practice==='oily'&&base.targets.length===3&&base.targets.every(c=>c.type==='oily'&&c.form==='coating'),'oil ear contains only three connected films and raised deposits');
  Check(base.targets.every(c=>c.physics.nodes===594&&c.physics.tetrahedra===1536&&c.physics.anchors===297),'every deep coating has a volumetric lattice and distributed adhesion');
  await page.locator('[data-tool="tweezers"]').click();
  let failures=0,deep=false,maxTriangles=0,maxDraws=0;
  for(let turn=0;turn<800;turn++){
   let probe=await Probe();if(probe.phase==='complete')break;if(!probe.viewReady){await Step(240);probe=await Probe();if(probe.phase==='complete')break;}
   const candidates=await Candidates();let taken=false;
   for(const t of candidates.slice(0,12)){
    await Input(true,t);await Step(3);probe=await Probe();
    const earlyBite=probe.targets.find(c=>c.id===probe.active)?.form==='oilyBite';
    if(probe.active!==t.id&&!earlyBite){await Input(false);continue;}
    if(!earlyBite&&!probe.targets.find(c=>c.id===t.id).aligned){await Input(false);await Align(t);await Input(true,t);}
    let peak=1;
    for(let i=0;!earlyBite&&i<8;i++){await Step(12);probe=await Probe();const c=probe.targets.find(c=>c.id===t.id);peak=Math.max(peak,c.physics.peakGelStretch);if(probe.active!==t.id||c.state!=='peeling')break;}
    const bite=probe.targets.find(c=>c.id===probe.active);
    if(bite?.form==='oilyBite'&&bite.state==='held'){
     const remainder=probe.targets.find(c=>c.id===t.id),mass=probe.targets.reduce((sum,c)=>sum+c.mass,0);
     Check(bite.mass<=.32000001&&Math.abs(mass-9)<1e-6,'local bite '+turn+' conserves mass and stays below the per-contact limit');
     if(remainder.mass>0)Check(remainder.physics.anchors>0&&remainder.state!=='held','remaining coating '+turn+' stays attached');
     Check(bite.physics.minJacobian>0&&Math.abs(bite.physics.volumeRatio-1)<.06,'bite '+turn+' retains positive volume');
     if(report.bites.length===0){await Shot('BiteStretch');const before=probe.targets.length;await Step(110);Check((await Probe()).targets.length===before,'holding the separated bite cannot harvest the mother film again');await Shot('BiteHeld');}
     maxTriangles=Math.max(maxTriangles,probe.stats.triangles);maxDraws=Math.max(maxDraws,probe.stats.drawCalls);
     report.bites.push({id:bite.id,mass:bite.mass,depth:t.depth,peak,remaining:remainder.mass,anchors:remainder.physics.anchors});taken=true;
     await Input(false);await Step(215);await fs.writeFile(path.join(here,'_dev/Data_OilyBiteProgress.json'),JSON.stringify({width,turn,bites:report.bites,probe:await Probe()},null,2));
     if(report.bites.length%10===0){await Shot('BiteProgress'+report.bites.length);console.log('progress',width,report.bites.length,(await Probe()).cleanliness);}
     break;
    }
    await Input(false);await Step(45);
   }
   if(taken)failures=0;else{
    failures++;console.log('search',width,turn,failures,candidates.length,(await Probe()).transfer);await Shot('BiteSearch'+failures);
    if(failures>3)throw Error('no reachable fresh bite '+JSON.stringify({remaining:(await Probe()).targets.filter(c=>c.mass>0&&c.form==='coating'),candidates:candidates.slice(0,3)}));
   }
   if(!taken||turn%6===5){await page.locator('#depth-toggle').click();deep=!deep;await Step(90);}
  }
  await Step(160);const complete=await Probe();report.complete={phase:complete.phase,cleanliness:complete.cleanliness,tray:complete.tray,stats:complete.stats};await Shot('BiteComplete');
  Check(complete.phase==='complete'&&complete.cleanliness===1&&complete.harvest.length>28,'many real local extractions complete the entire ear');
  Check(complete.harvest.every(c=>c.mass<=.32000001)&&Math.abs(complete.tray.mass-9)<1e-6&&complete.harvest.length===new Set(complete.harvest.map(c=>c.id)).size,'all removed material lands exactly once');
  Check(report.bites.some(b=>b.depth>20),'actual forceps input removes deep material beyond 20 mm');
  Check(maxTriangles<=180000&&maxDraws<=120,'repeated cutting remains inside the render budget');
  Check(await page.evaluate(()=>localStorage.getItem('earspa3d.shop.v1'))===savedShop,'practice never modifies business save');
  await page.locator('#settings-open').click();await page.locator('#practice-return').click();const restored=await Probe();
  Check(restored.practice===null&&restored.elapsed===business.elapsed&&JSON.stringify(restored.targets.map(c=>[c.id,c.mass,c.state,c.position]))===JSON.stringify(business.targets.map(c=>[c.id,c.mass,c.state,c.position])),'return restores the exact business ear and clock');
  Check(restored.tray.count===business.tray.count&&restored.tray.mass===business.tray.mass,'practice tray is isolated');
  for(const type of ['dry','wet','impacted','mixed']){
   await page.locator('#settings-open').click();await page.locator('#practice-type').selectOption(type);await page.locator('#practice-start').click();await Step(140);const chosen=await Probe();
   Check(chosen.practice===type&&Math.abs(chosen.targets.reduce((s,c)=>s+c.mass,0)-9)<1e-6,'practice '+type+' retains a full seeded ear');
  }
  Check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no viewport overflow');
  Check(report.errors.length===0,'no browser, shader or asset errors');console.log('PASS oily bites',width,report.bites.length,'bites',report.checks.length,'checks');
 }catch(error){report.failure=error.message;report.probe=await Probe().catch(()=>null);await Shot('BiteFailure');const snapshot=await page.evaluate(()=>JSON.stringify(__EarSpaDebug.view.chunks.filter(c=>c.mass>0&&['attached','returning'].includes(c.state)).map(c=>({id:c.id,mass:c.mass,body:c.body,position:c.mesh.position.toArray(),rotation:c.mesh.quaternion.toArray(),positions:c.mesh.geometry.attributes.position.array,indices:c.mesh.geometry.index.array})),(_,v)=>ArrayBuffer.isView(v)?Array.from(v):typeof v==='function'?undefined:v));await fs.writeFile(path.join(here,'_dev/Data_OilyFailureBodies.json'),snapshot);throw error;}
 finally{await fs.writeFile(path.join(here,'_dev/Data_OilyPlayReport.json'),JSON.stringify(reports,null,2));await page.close();}
}}finally{await browser.close();}
