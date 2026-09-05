// Verify the local real-time reviewer against actual exported animated models.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],url=args.includes('--url')?args[args.indexOf('--url')+1]:'http://127.0.0.1:8136/Preview/index.html';
if(!root||!args.includes('--root'))throw Error('--root is required');
const browserKit=args.includes('--project')?pathToFileURL(path.join(args[args.indexOf('--project')+1],'PrairieFire1937/Script_BrowserTestKit.mjs')):new URL('../../PrairieFire1937/Script_BrowserTestKit.mjs',import.meta.url);
const {LaunchBrowser}=await import(browserKit.href);
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(url);await page.waitForFunction(()=>window.MotionReview?.panes.every(p=>p.bones?.length>0));
 const actions=await page.evaluate(()=>MotionReview.catalog.actions);
 for(const entry of actions){
  const variants=entry.variants.filter(v=>v.id.includes('-v2-'));if(!variants.length)continue;
  await page.locator(`#list button[data-id="${entry.id}"]`).click();
  for(const variant of variants){
   await page.locator('#paneA .faction').selectOption(variant.faction);await page.locator('#paneA .version').selectOption(variant.id);
   await page.waitForFunction(id=>MotionReview.panes[0].variant?.id===id,variant.id);
   const snapshot=async phase=>{await page.evaluate(t=>MotionReview.setPhase(t),phase);await page.evaluate(()=>new Promise(requestAnimationFrame));return page.evaluate(()=>{const p=MotionReview.panes[0];return{duration:p.duration,bones:p.bones.length,matrices:p.bones.flatMap(b=>b.matrixWorld.elements)}})};
   const first=await snapshot(.15),second=await snapshot(.7),movement=Math.max(...first.matrices.map((v,i)=>Math.abs(v-second.matrices[i])));
   if(movement<.0001||!second.matrices.every(Number.isFinite))throw Error('Animation does not move finitely: '+variant.id);
   let seam=null;
   if(entry.loop){const a=await snapshot(0),b=await snapshot(1);seam=Math.max(...a.matrices.map((v,i)=>Math.abs(v-b.matrices[i])));if(seam>.001)throw Error('Loop seam exceeds tolerance: '+variant.id+' '+seam);}
   results.push({id:variant.id,clip:variant.clip,duration:first.duration,bones:first.bones,maxMatrixMovement:movement,loopEndpointMatrixDelta:seam});
   await snapshot(.45);
   if(['KneelHold','StretcherPair','WoundedLimp','RifleCrouchAdvance'].includes(entry.id))await page.screenshot({path:path.join(root,'Preview',`Texture_Final_${variant.faction}_${entry.id}.png`)});
  }
 }
 // Controls must alter the rendered view and timeline; reference video supports seeking.
 await page.locator('#list button[data-id="RifleCrouchAdvance"]').click();await page.waitForFunction(()=>MotionReview.panes[0].clip?.name.includes('RifleCrouchAdvance'));
 await page.locator('#skeleton').check();await page.locator('[data-view="side"]').click();await page.locator('#next').click();await page.evaluate(()=>new Promise(requestAnimationFrame));
 const controls=await page.evaluate(()=>({skeleton:MotionReview.panes[0].skeleton.visible,phase:MotionReview.phase,camera:MotionReview.panes[0].camera.position.toArray()}));
 if(!controls.skeleton||controls.phase<=0||controls.camera[0]<1)throw Error('Viewer controls failed');
 const source=actions.find(e=>e.id==='WoundedLimp').source;
 const response=await fetch(new URL('../'+source,url),{headers:{Range:'bytes=0-63'}});const bytes=(await response.arrayBuffer()).byteLength;
 if(response.status!==206||bytes!==64)throw Error('Reference video range requests failed');
 const report={status:errors.length?'failed':'passed',rendering:'GLTFLoader + AnimationMixer; actual bone matrices sampled in Chromium',variants:results,controls,referenceRangeStatus:response.status,errors};
 await fs.writeFile(path.join(root,'Preview','Data_Validation.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,variants:results.length,maxLoopEndpointMatrixDelta:Math.max(...results.map(r=>r.loopEndpointMatrixDelta||0)),errors}));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close()}
