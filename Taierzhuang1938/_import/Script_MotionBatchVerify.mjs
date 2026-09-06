// Inspect the delivered GLBs, anatomical strafe directions and full-body framing.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root||root==='--root')throw Error('--root required');
const group=args.includes('--group')?args[args.indexOf('--group')+1]:'NextTenV1';
const reportName=group==='NextTenV1'?'Data_BatchPlaybackValidation.json':`Data_${group}PlaybackValidation.json`;
const recipes=JSON.parse(await fs.readFile(path.join(root,'Models',group,'Data_Recipes.json'),'utf8'));
const reviewOutput=group==='MeleeVideoV1'?path.join(root,'Preview',group):path.join(root,'Preview');
await fs.mkdir(reviewOutput,{recursive:true});
const browser=await LaunchBrowser(),results=[],errors=[];
function MatrixDelta(a,b){return Math.max(0,...a.map((value,i)=>Math.abs(value-b[i])))}
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});
 page.on('pageerror',error=>errors.push(error.message));
 for(const name of Object.keys(recipes).filter(name=>!args.includes('--ids')||args[args.indexOf('--ids')+1].split(',').includes(name))){
  await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
  await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading&&MotionReview.video.readyState>=2);
  for(const faction of ['Nra','Ija']){
   await page.locator('#faction').selectOption(faction);
   await page.waitForFunction(f=>!MotionReview.loading&&MotionReview.variant.faction===f&&MotionReview.video.readyState>=2,faction);
   const samples=[];
   for(const phase of [0,.25,.5,.75,1]){
    await page.evaluate(t=>MotionReview.setPhase(t),phase);
    await page.waitForFunction(()=>!MotionReview.video.seeking);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const state=await page.evaluate(()=>{
     const m=MotionReview.model;let maxProjection=0,minHeight=Infinity;
     m.model.traverse(object=>{if(object.isMesh&&object.geometry.attributes.position){const v=object.position.clone();for(let i=0;i<object.geometry.attributes.position.count;i+=10){object.getVertexPosition(i,v);v.applyMatrix4(object.matrixWorld);minHeight=Math.min(minHeight,v.y);v.project(m.camera);maxProjection=Math.max(maxProjection,Math.abs(v.x),Math.abs(v.y))}}});
     const left=m.bones.find(b=>/L[_ ]Thigh$/.test(b.name)),right=m.bones.find(b=>/R[_ ]Thigh$/.test(b.name));
     const axis=left.getWorldPosition(left.position.clone()).sub(right.getWorldPosition(right.position.clone()));axis.y=0;axis.normalize();
     const travel=MotionReview.variant.travelMeters;
     return{phase:MotionReview.phase,path:MotionReview.variant.path,matrices:m.bones.flatMap(b=>b.matrixWorld.elements),maxProjection,minHeight,anatomicalLeftDisplacement:travel?axis.x*travel[0]+axis.z*travel[2]:null};
    });
    assert.ok(state.path.startsWith(`Models/${group}/`),'Requested delivery group loaded');
    assert.ok(state.maxProjection<1,`${name} ${faction} body leaves viewport at ${phase}: ${state.maxProjection}`);
    if(name==='RifleStrafeLeft')assert.ok(state.anatomicalLeftDisplacement>0,'Actual GLB left strafe');
    if(name==='RifleStrafeRight')assert.ok(state.anatomicalLeftDisplacement<0,'Actual GLB right strafe');
    samples.push(state);
    if([0,.5,1].includes(phase))await page.screenshot({path:path.join(reviewOutput,`Texture_Batch_${name}_${faction}_${phase===0?'Start':phase===1?'End':'Middle'}.png`)});
    if(faction==='Nra'&&phase===.5)await page.screenshot({path:path.join(reviewOutput,`Texture_Latest_${name}.png`)});
   }
   const movement=MatrixDelta(samples[0].matrices,samples[2].matrices);
   assert.ok(movement>.0001,'Actual model bones move');
   const loopEndpointDelta=recipes[name].loop?MatrixDelta(samples[0].matrices,samples.at(-1).matrices):null;
   if(loopEndpointDelta!==null)assert.ok(loopEndpointDelta<.001,'Loop poses join');
   for(const sample of samples)delete sample.matrices;
   results.push({name,faction,movement,loopEndpointDelta,samples});
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(reviewOutput,group==='MeleeVideoV1'?'Data_BatchPlaybackValidation.json':reportName),JSON.stringify({status:'passed',results,errors},null,2));
 console.log(JSON.stringify({status:'passed',models:results.length,sampledPoses:results.reduce((n,r)=>n+r.samples.length,0),maxProjection:Math.max(...results.flatMap(r=>r.samples.map(s=>s.maxProjection))),errors}));
}finally{await browser.close()}
