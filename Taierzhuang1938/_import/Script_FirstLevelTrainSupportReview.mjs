// Review the real three-pane player at normal speed, then capture contact beats.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],group='FirstLevelTrainSupportV2';
assert.ok(args.includes('--root')&&root);
const versions=JSON.parse(await fs.readFile(path.join(root,'Models',group,'Data_Versions.json'),'utf8')).actions[0];
const out=path.join(root,'Preview',group);await fs.mkdir(out,{recursive:true});
const browser=await LaunchBrowser(),results=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1800,height:1050}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise');
 await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading&&MotionReview.video.readyState>=2);
 assert.equal(await page.evaluate(()=>MotionReview.variant.id),versions.variants[0].id,'Default is the newest actual game model');
 for(const variant of versions.variants){
  await page.evaluate(id=>MotionReview.loadVariant(MotionReview.selected.variants.find(v=>v.id===id)),variant.id);
  await page.waitForFunction(()=>!MotionReview.loading&&MotionReview.video.readyState>=2);
  await page.evaluate(()=>{MotionReview.setPlaying(false);MotionReview.setPhase(0)});await page.waitForFunction(()=>!MotionReview.video.seeking);
  await page.evaluate(()=>{document.getElementById('speed').value='1';document.getElementById('speed').dispatchEvent(new Event('change'));MotionReview.setPlaying(true)});
  const playback=[];
  for(let sample=0;sample<34;sample++){
   await page.waitForTimeout(250);
   playback.push(await page.evaluate(()=>({video:MotionReview.video.currentTime,model:MotionReview.model.action.time,
    matrix:MotionReview.model.bones.find(b=>b.name.replaceAll('_',' ').endsWith(' Pelvis')).matrixWorld.elements.slice()})));
  }
  assert.ok(Math.max(...playback.map(s=>s.model))>7.9,variant.id+' plays its full source duration');
  const movement=Math.max(...playback.map(s=>Math.hypot(...[12,13,14].map(i=>s.matrix[i]-playback[0].matrix[i]))));
  assert.ok(movement>.2,'Loaded skeletal model actually rises');
  const maxSyncError=Math.max(...playback.map(s=>Math.abs(s.video-s.model)));assert.ok(maxSyncError<.08);
  const captures=[];
  for(const view of [{label:'正面',id:'Front'},{label:'侧面',id:'Side'}]){
   await page.getByRole('button',{name:view.label,exact:true}).click();
   for(const time of [0,4.5,5.2,5.5,5.7,478/60]){
    await page.evaluate(t=>{MotionReview.setPlaying(false);MotionReview.setPhase(t/MotionReview.model.duration)},time);
    await page.waitForFunction(()=>!MotionReview.video.seeking);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const screenshot='Preview/'+group+'/Texture_'+variant.modelId+'_'+view.id+'_'+Math.round(time*1000)+'.png';
    await page.screenshot({path:path.join(root,screenshot)});captures.push({view:view.id,sourceSeconds:time,screenshot});
   }
  }
  results.push({variantId:variant.id,path:variant.path,playbackSpeed:1,maxSyncError,pelvisMovementM:movement,playback,captures});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_ThreePaneValidation.json'),JSON.stringify({status:'playback_verified_captures_pending_visual_assessment',results,errors},null,2));
 console.log(JSON.stringify(results.map(({playback,captures,...r})=>({...r,playbackSamples:playback.length,captures:captures.length}))));
}finally{await browser.close()}
