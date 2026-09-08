// Render local candidate review images; this does not launch campaign regression.
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):2;
if(!root||!Number.isInteger(revision))throw Error('Provide root and revision');
const group='FirstLevelStairAuthorV'+revision,folder=path.join(root,'Models',group),out=path.join(root,'Preview',group);
const entry=JSON.parse(await fs.readFile(path.join(folder,'Data_Versions.json'),'utf8')).actions[0];
await fs.mkdir(out,{recursive:true});const browser=await LaunchBrowser(),errors=[],images=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+entry.id);
 await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading&&MotionReview.video.readyState>=2);
 for(const variant of entry.variants){
  await page.evaluate(async id=>{MotionReview.setPlaying(false);await MotionReview.loadVariant(MotionReview.selected.variants.find(v=>v.id===id))},variant.id);
  for(const view of ['side','front']){
   await page.locator(`[data-view="${view}"]`).click();
   for(const seconds of [0,1.25,4.6,7.25,9.3,11.8]){
    await page.evaluate(t=>{MotionReview.setPlaying(false);MotionReview.setPhase(t/12)},seconds);
    await page.waitForFunction(()=>!MotionReview.video.seeking&&MotionReview.video.readyState>=2);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const state=await page.evaluate(()=>({modelSeconds:MotionReview.model.action.time,sourceSeconds:MotionReview.video.currentTime,rawFrames:MotionReview.recovery.tracks.map(t=>t.frame),path:MotionReview.variant.path}));
    const file=`Texture_${variant.modelId}_${view}_${Math.round(seconds*1000)}.png`;await page.screenshot({path:path.join(out,file)});
    images.push({file,variant:variant.id,seconds,view,...state});
   }
  }
 }
 await fs.writeFile(path.join(out,'Data_PreviewCaptures.json'),JSON.stringify({status:'captured_for_visual_review',regressionTestRun:false,images,errors},null,2));
 console.log(JSON.stringify({models:entry.variants.length,images:images.length,errors}));
}finally{await browser.close()}
