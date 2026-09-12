import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const require=createRequire(path.join(path.dirname(common),'package.json')),{chromium}=require('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8143/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}),page=await browser.newPage({viewport:{width:1000,height:900}}),report={errors:[],viewports:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);await page.evaluate(()=>requestAnimationFrame=()=>0);await page.locator('#welcome-settings').click();await page.locator('#practice-start').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(140));
 for(const seed of [20260912,83,519]){await page.evaluate(seed=>{__EarSpaDebug.view.Reset(seed,'oily');__EarSpaDebug.StepFrames(3);},seed);
 for(const [width,height] of [[1000,900],[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForFunction(w=>__EarSpaDebug.core.size.width===w,width);await page.evaluate(()=>__EarSpaDebug.StepFrames(3));const modes=[];
  for(let mode=0;mode<3;mode++){
   // Ignore other removable wax here: this checks permanent wall occlusion and the camera frustum.
   // Full play checks actual wax occlusion, GUI overlap and real instrument input separately.
   modes.push(await page.evaluate(async()=>{
    const T=await import('three'),{view,core}=__EarSpaDebug,wall=core.scene.getObjectByName('Model_Canal');core.scene.updateMatrixWorld(true);
    return view.chunks.map(c=>c.body.gel.cells.map(cell=>{
     const points=cell.ids.slice(4).map(id=>new T.Vector3().fromArray(c.body.gel.points[id]));points.unshift(points.reduce((v,p)=>v.add(p),new T.Vector3()).multiplyScalar(.25));
     return points.some(world=>{const screen=view.Project(world);if(screen.z<=-1||screen.z>=1||screen.x<8||screen.x>innerWidth-8||screen.y<8||screen.y>innerHeight-8)return false;const delta=world.clone().sub(core.camera.position),distance=delta.length();return !new T.Raycaster(core.camera.position,delta.normalize(),0,distance-.015).intersectObject(wall).length;});
    }));
   }));
   if(mode===2&&seed===20260912)await page.screenshot({path:path.join(here,'_dev/Shot_OilyEntry_'+width+'.png')});
   await page.locator('#depth-toggle').click();await page.evaluate(()=>__EarSpaDebug.StepFrames(90));
  }
  const hidden=modes[0].flatMap((cells,region)=>cells.flatMap((_,cell)=>modes.some(mode=>mode[region][cell])?[]:[{region,cell}]));const total=modes[0].reduce((n,cells)=>n+cells.length,0);report.viewports.push({seed,width,height,cells:total,hidden});assert.deepEqual(hidden,[],seed+'/'+width+': every local volume cell has a visible surface in at least one inspection view');console.log('PASS oily camera coverage',seed,width,total,'cells');
 }}
 assert.deepEqual(report.errors,[],'no browser, shader or asset errors');
}finally{await fs.mkdir(path.join(here,'_dev'),{recursive:true});await fs.writeFile(path.join(here,'_dev/Data_OilyVisibilityReport.json'),JSON.stringify(report,null,2));await browser.close();}
