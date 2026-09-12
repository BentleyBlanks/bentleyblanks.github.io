import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
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
 await page.evaluate(()=>__EarSpaDebug.StepFrames(50));
 report.pull=await page.evaluate(id=>{const p=__EarSpaDebug.Probe(),c=p.targets.find(c=>c.id===id);return{active:p.active,...c.physics};},id);
 assert.equal(report.pull.active,id,'actual thin-film pointer contact selects its connected body');
 assert.ok(report.pull.anchors<21&&report.pull.peakGelStretch>1.1,'pulling the thin region deforms and peels the same film');
 assert.ok(report.pull.minJacobian>0&&Math.abs(report.pull.volumeRatio-1)<.06,'thin-region loading retains positive volume');
 await page.screenshot({path:path.join(here,'_dev/Shot_OilyFilmGrip.png')});await page.mouse.up();
 await page.locator('#settings-open').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(140));
  await page.locator('#depth-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(90));await page.screenshot({path:path.join(here,'_dev/Shot_OilyCoatingDeep.png')});
 await page.locator('#depth-toggle').click();await page.setViewportSize({width:1697,height:674});await page.waitForFunction(()=>__EarSpaDebug.core.size.width===1697,null,{polling:50});await page.evaluate(()=>__EarSpaDebug.StepFrames(90));await page.screenshot({path:path.join(here,'_dev/Shot_OilyCoatingWide.png')});
 assert.deepEqual(report.errors,[]);console.log('PASS real thin-film gripping and deep coating rendering',JSON.stringify(report));
}finally{await fs.writeFile(path.join(here,'_dev/Data_OilyFilmPlayReport.json'),JSON.stringify(report,null,2));await browser.close();}
