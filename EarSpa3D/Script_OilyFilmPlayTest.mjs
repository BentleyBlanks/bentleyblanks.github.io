import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {InstrumentContact} from './Script_InstrumentInteraction.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8113/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),report={errors:[]};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,{timeout:60000});await page.evaluate(()=>requestAnimationFrame=()=>0);
 await page.locator('#welcome-settings').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(140));
 await page.locator('[data-tool="tweezers"]').click();
 report.target=await page.evaluate(async()=>{
  const T=await import('three'),{view,core}=__EarSpaDebug;core.scene.updateMatrixWorld(true);const camera=core.camera,wall=core.scene.getObjectByName('Model_Canal'),candidates=[];
  for(const c of view.chunks){const p=c.mesh.geometry.attributes.position,h=c.mesh.geometry.attributes.gelThickness,n=c.mesh.geometry.attributes.normal;
   for(let i=0;i<p.count;i+=2){if(h.getX(i)<.065||h.getX(i)>.105)continue;const world=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(c.mesh.matrixWorld),normal=new T.Vector3().fromBufferAttribute(n,i).transformDirection(c.mesh.matrixWorld),toward=camera.position.clone().sub(world).normalize();if(normal.dot(toward)<.2)continue;
    const screen=view.Project(world);if(screen.x<200||screen.x>800||screen.y<230||screen.y>680)continue;
    const ray=new T.Raycaster(camera.position,toward.negate(),0,40),hit=ray.intersectObjects(view.chunks.map(c=>c.mesh))[0],skin=ray.intersectObject(wall)[0];
    if(hit?.object===c.mesh&&(!skin||hit.distance<skin.distance+.015)&&hit.point.distanceTo(world)<.05)candidates.push({id:c.id,screen,thickness:h.getX(i),score:Math.hypot(screen.x-500,screen.y-460)});
   }
  }return candidates.sort((a,b)=>a.score-b.score)[0];
 });
 assert.ok(report.target,'a visible thin region exists away from the raised deposit and UI');
 const {screen,id}=report.target;await page.mouse.move(screen.x,screen.y);await page.mouse.down();
 report.pull=await page.evaluate(id=>{let peak=1;for(let frame=0;frame<100;frame++){__EarSpaDebug.StepFrames(1);const source=__EarSpaDebug.view.chunks.find(c=>c.id===id);peak=Math.max(peak,source.body.gel.maxStretch);if(__EarSpaProbe().active!==id)break;}const p=__EarSpaProbe(),source=p.targets.find(c=>c.id===id),bite=p.targets.find(c=>c.id===p.active);return{active:p.active,source,bite,peak};},id);
 assert.ok(report.pull.bite?.form==='oilyBite'&&report.pull.bite.mass<=.32,'real thin-film input separates only a local bite');
 assert.ok(report.pull.source.mass>2.7&&report.pull.source.physics.anchors>250&&report.pull.peak>1.1,'nearby film stretches while the mother film stays attached');
 assert.ok([report.pull.source,report.pull.bite].every(c=>c.physics.minJacobian>0&&Math.abs(c.physics.volumeRatio-1)<.06),'both sides retain positive volume');
 await page.screenshot({path:path.join(here,'_dev/Shot_OilyFilmGrip.png')});await page.mouse.up();
 await page.locator('#settings-open').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(140));
 // Scoop input must move the real working surface; stationary pressing is inert.
 await page.locator('[data-tool="scoop"]').click();
 report.scoop=await page.evaluate(async()=>{
  const T=await import('three'),{view,core}=__EarSpaDebug,camera=core.camera,wall=core.scene.getObjectByName('Model_Canal'),out=[];core.scene.updateMatrixWorld(true);
  for(const c of view.chunks){const p=c.mesh.geometry.attributes.position,h=c.mesh.geometry.attributes.gelThickness;
   for(let i=0;i<p.count;i+=3){const world=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(c.mesh.matrixWorld),depth=view.canal.Project(world).depth;if(depth<1||depth>7||h.getX(i)<.15||h.getX(i)>.8)continue;
    const screen=view.Project(world);if(screen.x<170||screen.x>820||screen.y<200||screen.y>690)continue;
    const ray=new T.Raycaster(camera.position,world.clone().sub(camera.position).normalize(),0,40),hit=ray.intersectObjects(view.chunks.map(c=>c.mesh))[0],skin=ray.intersectObject(wall)[0];if(hit?.object!==c.mesh||skin&&hit.distance>=skin.distance+.015||hit.point.distanceTo(world)>.04)continue;
    const normal=view.CollisionProbe?new T.Vector3().fromArray(c.normal.toArray()):c.normal.clone(),center=view.canal.CenterAt(depth).clone(),inward=center.sub(world).normalize();out.push({id:c.id,screen,pull:view.Project(world.clone().addScaledVector(inward,1)),normal:inward.toArray(),depth});
   }
  }return out;
 });
 let scooped=false;
 for(const target of report.scoop.slice(0,20)){
  await page.mouse.move(target.screen.x,target.screen.y);await page.mouse.down({button:'right'});
  for(let f=0;f<85;f++){await page.evaluate(()=>__EarSpaDebug.StepFrames(3));if(InstrumentContact('scoop',(await page.evaluate(()=>__EarSpaProbe())).rendering.toolRotation,target.normal).aligned)break;}
  await page.mouse.up({button:'right'});await page.mouse.move(target.screen.x,target.screen.y);await page.mouse.down();await page.evaluate(()=>__EarSpaDebug.StepFrames(60));
  const stationary=await page.evaluate(()=>__EarSpaProbe());assert.equal(stationary.cleanliness,0,'stationary spoon cannot clean oil');assert.equal(stationary.targets.length,3,'stationary spoon cannot split material');
  for(let f=1;f<=20;f++){
   await page.mouse.move(target.screen.x+(target.pull.x-target.screen.x)*f/22,target.screen.y+(target.pull.y-target.screen.y)*f/22);await page.evaluate(()=>__EarSpaDebug.StepFrames(3));const p=await page.evaluate(()=>__EarSpaProbe()),bite=p.targets.find(c=>c.id===p.active);
   if(bite?.form==='oilyBite'){assert.ok(bite.mass<=.32&&p.targets.find(c=>c.id===target.id).mass>2.6,'actual spoon motion removes only a small region');report.scoopResult={id:bite.id,mass:bite.mass,depth:target.depth};scooped=true;await page.screenshot({path:path.join(here,'_dev/Shot_OilyScoopBite.png')});break;}
  }
  await page.mouse.up();if(scooped)break;await page.evaluate(()=>__EarSpaDebug.StepFrames(60));
 }
 assert.ok(scooped,'a real scoop stroke can remove a local sticky bite');
 await page.locator('#settings-open').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(140));
  await page.locator('#depth-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(90));await page.screenshot({path:path.join(here,'_dev/Shot_OilyCoatingDeep.png')});
 await page.locator('#depth-toggle').click();await page.setViewportSize({width:1697,height:674});await page.waitForFunction(()=>__EarSpaDebug.core.size.width===1697,null,{polling:50});await page.evaluate(()=>__EarSpaDebug.StepFrames(90));await page.screenshot({path:path.join(here,'_dev/Shot_OilyCoatingWide.png')});
 assert.deepEqual(report.errors,[]);console.log('PASS real thin-film gripping, stationary scoop, local scoop bite and deep views',JSON.stringify({errors:report.errors,thinBite:report.pull.bite.mass,scoop:report.scoopResult}));
}finally{await fs.writeFile(path.join(here,'_dev/Data_OilyFilmPlayReport.json'),JSON.stringify(report,null,2));await browser.close();}
