import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const root=process.argv[process.argv.indexOf('--root')+1];
if(!root||root==='--root')throw Error('--root required');
const browser=await LaunchBrowser(),results=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});
 await page.goto('http://127.0.0.1:8136/Preview/index.html?action=DeathCollapse');
 await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading&&MotionReview.video.readyState>=2);
 for(const faction of ['Nra','Ija']){
  await page.locator('#faction').selectOption(faction);
  await page.waitForFunction(f=>!MotionReview.loading&&MotionReview.variant.faction===f&&MotionReview.video.readyState>=2,faction);
  let late;
  for(const [name,phase] of [['Start',0],['Fall',.33],['End',.7],['Hold',.95]]){
   await page.evaluate(t=>MotionReview.setPhase(t),phase);
   await page.waitForFunction(()=>!MotionReview.video.seeking);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const state=await page.evaluate(()=>{
    const model=MotionReview.model;let maxProjection=0;
    model.model.traverse(object=>{if(object.isSkinnedMesh){const vector=object.position.clone();for(let i=0;i<object.geometry.attributes.position.count;i+=20){object.getVertexPosition(i,vector);vector.applyMatrix4(object.matrixWorld).project(model.camera);maxProjection=Math.max(maxProjection,Math.abs(vector.x),Math.abs(vector.y))}}});
    return{duration:model.duration,matrices:model.bones.flatMap(b=>b.matrixWorld.elements),loop:document.getElementById('loop').checked,maxProjection};
   });
   assert.equal(state.loop,false);
   assert.ok(state.matrices.every(Number.isFinite));
   assert.ok(state.maxProjection<1,`${faction} ${name} complete body in view: ${state.maxProjection}`);
   if(name==='End')late=state.matrices;
   if(name==='Hold'){
    const delta=Math.max(...late.map((value,i)=>Math.abs(value-state.matrices[i])));
    assert.ok(delta<1e-6,`${faction} held final pose changed ${delta}`);
    results.push({faction,duration:state.duration,heldPoseDelta:delta});
   }else await page.screenshot({path:path.join(root,'Preview',`Texture_Death${faction}_${name}.png`)});
  }
  await page.evaluate(()=>MotionReview.setPhase(.995));
  await page.locator('#play').click();
  await page.waitForFunction(()=>!MotionReview.playing&&MotionReview.phase===1);
 }
 await fs.writeFile(path.join(root,'Preview/Data_DeathPlaybackValidation.json'),JSON.stringify({status:'passed',results},null,2));
 console.log(JSON.stringify({status:'passed',results}));
}finally{await browser.close()}
