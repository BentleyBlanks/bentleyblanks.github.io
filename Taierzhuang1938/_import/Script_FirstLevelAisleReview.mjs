// Local-only three-pane review, including exported meshes and held source time.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):2;
assert.ok(root&&Number.isInteger(revision)&&revision>0);
const group='FirstLevelAisleAuthorV'+revision,folder=path.join(root,'Models',group),out=path.join(root,'Preview',group);
assert.equal(await fs.access(path.join(folder,'Data_VisualAssessment.json')).then(()=>true,()=>false),false,'Preserve frozen review');
const entries=JSON.parse(await fs.readFile(path.join(folder,'Data_Versions.json'),'utf8')).actions;
await fs.mkdir(out,{recursive:true});const browser=await LaunchBrowser(),errors=[],results=[],controls=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 for(const entry of entries){
  await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+entry.id);
  await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading&&MotionReview.video.readyState>=2);
  assert.equal(await page.locator('#panes > article').count(),3);
  for(const variant of entry.variants){
   await page.evaluate(async id=>{MotionReview.setPlaying(false);await MotionReview.loadVariant(MotionReview.selected.variants.find(v=>v.id===id))},variant.id);
   for(const view of ['front','side']){
    await page.locator(`[data-view="${view}"]`).click();
    for(const seconds of [0,1.2,1.6,2.5,4.8]){
     await page.evaluate(t=>{MotionReview.setPlaying(false);MotionReview.setPhase(t/5)},seconds);
     await page.waitForFunction(()=>!MotionReview.video.seeking&&MotionReview.video.readyState>=2);
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     const checked=await page.evaluate(()=>{
      const m=MotionReview.model;let maxProjection=0,vertices=0;
      m.model.updateMatrixWorld(true);m.camera.updateMatrixWorld(true);
      m.model.traverse(mesh=>{if(!mesh.isMesh||!mesh.geometry.attributes.position)return;const v=mesh.position.clone();for(let i=0;i<mesh.geometry.attributes.position.count;i++){
       mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld).project(m.camera);maxProjection=Math.max(maxProjection,Math.abs(v.x),Math.abs(v.y));vertices++;
      }});
      return {maxProjection,vertices,modelTime:m.action.time,sourceTime:MotionReview.video.currentTime,rawFrames:MotionReview.recovery.tracks.map(t=>t.frame),path:MotionReview.variant.path};
     });
     assert.equal(checked.path,variant.path);assert.ok(checked.maxProjection<.96,'Clipped model: '+variant.id+' '+checked.maxProjection);
     assert.ok(Math.abs(checked.sourceTime-variant.review.sourcePoseSeconds)<.002&&Math.abs(checked.modelTime-seconds)<.00001);
     const file=`Texture_${variant.modelId}_${entry.id}_${view}_${seconds*1000}.png`;await page.screenshot({path:path.join(out,file)});
     results.push({action:entry.id,variant:variant.id,seconds,view,file,...checked});
    }
   }
  }
  await page.evaluate(()=>MotionReview.setPhase(.2));await page.waitForFunction(()=>Math.abs(MotionReview.model.action.time-1)<.00001);const start=await page.evaluate(()=>MotionReview.model.action.time);
  await page.locator('#next').click();await page.waitForFunction(t=>Math.abs(MotionReview.model.action.time-t-1/60)<.00001,start);
  const step=await page.evaluate(()=>MotionReview.model.action.time);await page.locator('#play').click();await page.waitForFunction(t=>MotionReview.model.action.time>t+.15,step);await page.locator('#play').click();
  controls.push({action:entry.id,frameStep:step-start,independentPlayback:true,sourceSeconds:await page.evaluate(()=>MotionReview.video.currentTime)});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_BrowserValidation.json'),JSON.stringify({status:'passed_pending_visual_read',results,controls,errors},null,2));
 console.log(JSON.stringify({models:entries.reduce((n,a)=>n+a.variants.length,0),screenshots:results.length,maxProjection:Math.max(...results.map(r=>r.maxProjection)),controls,errors}));
}finally{await browser.close()}
