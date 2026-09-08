// Capture the current private candidate only; no game or campaign regression.
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):1;
const url=args.includes('--url')?args[args.indexOf('--url')+1]:'http://127.0.0.1:8136';
if(!root||!Number.isInteger(revision)||revision<1)throw Error('Provide root and positive revision');
const group='FirstLevelMealAuthorV'+revision,out=path.join(root,'Preview',group);
const {actions}=JSON.parse(await fs.readFile(path.join(root,'Models',group,'Data_Versions.json'),'utf8'));
await fs.mkdir(out,{recursive:true});const browser=await LaunchBrowser(),errors=[],images=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/Preview/index.html?action='+actions[0].id);
 await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading&&MotionReview.video.readyState>=2);
 for(const entry of actions){
  await page.evaluate(async id=>{MotionReview.setPlaying(false);await MotionReview.select(MotionReview.catalog.actions.find(a=>a.id===id))},entry.id);
  const role=entry.id.replace('TrainMeal','').replace('Authored','');
  for(const variant of entry.variants){
   await page.evaluate(async id=>{MotionReview.setPlaying(false);await MotionReview.loadVariant(MotionReview.selected.variants.find(v=>v.id===id))},variant.id);
   for(const view of ['side','three']){
    await page.locator(`[data-view="${view}"]`).click();
    for(const seconds of role==='Pair'?[0,3.2,7.9,9.9,11.8]:role==='Giver'?[3.2]:[9.9]){
     await page.evaluate(t=>{MotionReview.setPlaying(false);MotionReview.setPhase(t/12)},seconds);
     await page.waitForFunction(()=>!MotionReview.video.seeking&&MotionReview.video.readyState>=2);
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     const state=await page.evaluate(()=>({modelSeconds:MotionReview.model.action.time,sourceSeconds:MotionReview.video.currentTime,
      rawFrames:MotionReview.recovery.tracks.map(t=>t.frame),path:MotionReview.variant.path,clip:MotionReview.model.action.getClip().name}));
     const file=`Texture_${variant.modelId}_${role}_${view}_${Math.round(seconds*1000)}.png`;
     await page.screenshot({path:path.join(out,file)});images.push({file,variant:variant.id,role,seconds,view,...state});
    }
   }
  }
 }
 // Detail views are isolated to NRA01's current model pane. This changes only
 // the local preview camera, not the clip, source/raw or library defaults.
 for(const [role,seconds] of [['Giver',3.2],['Pair',7.9],['Receiver',9.9]]){
  const entry=actions.find(a=>a.id==='TrainMeal'+role+'Authored');
  await page.evaluate(async id=>{await MotionReview.select(MotionReview.catalog.actions.find(a=>a.id===id));MotionReview.setPlaying(false)},entry.id);
  await page.evaluate(async id=>{await MotionReview.loadVariant(MotionReview.selected.variants.find(v=>v.id===id));MotionReview.selected.cameraDistance=1.5;MotionReview.selected.cameraCenter=[0,1,.4]},entry.variants[0].id);
  await page.locator('[data-view="three"]').click();
  await page.evaluate(t=>{MotionReview.setPlaying(false);MotionReview.setPhase(t/12)},seconds);
  await page.waitForFunction(()=>!MotionReview.video.seeking&&MotionReview.video.readyState>=2);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const file=`Texture_LugouNra01_${role}_Detail_${Math.round(seconds*1000)}.png`;
  await page.screenshot({path:path.join(out,file)});images.push({file,variant:entry.variants[0].id,role,seconds,view:'detail'});
 }
 await fs.writeFile(path.join(out,'Data_PreviewCaptures.json'),JSON.stringify({status:'captured_for_visual_review',regressionTestRun:false,images,errors},null,2));
 console.log(JSON.stringify({models:actions.flatMap(a=>a.variants).length,images:images.length,errors}));
}finally{await browser.close()}
