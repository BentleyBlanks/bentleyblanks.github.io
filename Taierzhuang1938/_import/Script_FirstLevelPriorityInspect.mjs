// Capture source-specific beats from the real three-pane player, including side views.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
assert.ok(root&&root!=='--root');
const group='FirstLevelPriorityV1',out=path.join(root,'Preview',group);
await fs.mkdir(out,{recursive:true});
const beats={TrainStairDisembark:[0,3.5,4.5,6.5,9.9],TrainMealCutOffer:[0,3,7.5,9.9],ZhouSeatedAttempt:[0,3.25,4.5,8.75]};
const browser=await LaunchBrowser(),results=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 for(const [name,times] of Object.entries(beats)){
  await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
  await page.waitForFunction(name=>window.MotionReview&&!MotionReview.loading&&MotionReview.selected.id===name&&MotionReview.video.readyState>=2,name);
  for(const view of [{label:'正面',id:'Front'},{label:'侧面',id:'Side'}]){
   await page.getByRole('button',{name:view.label,exact:true}).click();
   for(const seconds of times){
    await page.evaluate(seconds=>{MotionReview.setPlaying(false);MotionReview.setPhase(seconds/MotionReview.model.duration)},seconds);
    await page.waitForFunction(()=>!MotionReview.video.seeking);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const state=await page.evaluate(()=>({videoSeconds:MotionReview.video.currentTime,
     modelSeconds:MotionReview.model.action.time,variantId:MotionReview.variant.id,raw:MotionReview.review.recoveryTracks[0].path}));
    assert.equal(state.variantId,'Nra-v1-'+name);
    assert.ok(Math.abs(state.videoSeconds-seconds)<.055);
    assert.ok(Math.abs(state.modelSeconds-seconds)<.002);
    const file=`Texture_${name}_${view.id}_${Math.round(seconds*1000)}.png`;
    await page.screenshot({path:path.join(out,file)});
    results.push({name,view:view.id,sourceSeconds:seconds,...state,screenshot:'Preview/'+group+'/'+file});
   }
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_EventViewValidation.json'),JSON.stringify({status:'captured_pending_visual_acceptance',results,errors},null,2));
 console.log(JSON.stringify({captures:results.length,maxSourceSyncError:Math.max(...results.map(r=>Math.abs(r.sourceSeconds-r.videoSeconds))),errors}));
}finally{await browser.close()}
