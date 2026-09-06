// Inspect actual exported animation frames, including protected V7 body matrices.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
const recipes=JSON.parse(await fs.readFile(path.join(root,'Models/ReviewV8/Data_Recipes.json'),'utf8'));
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const name of Object.keys(recipes))for(const faction of ['Nra','Ija']){
  const report=JSON.parse(await fs.readFile(path.join(root,`Models/ReviewV8/Data_${faction}_${name}_Validation.json`),'utf8'));
  await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
  await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading);
  await page.locator('#faction').selectOption(faction);
  await page.waitForFunction(id=>!MotionReview.loading&&MotionReview.variant.id===id,`${faction}-v8-${name}`);
  await page.evaluate(()=>MotionReview.setPlaying(false));
  const current=await page.evaluate(({report,faction})=>{
   const m=MotionReview.model,Vector=m.model.position.constructor,Quaternion=m.model.quaternion.constructor;
   let prop;m.model.traverse(o=>{if(o.name===`Model_${faction}MeleeVideoDadao`)prop=o});if(!prop)throw Error('Missing exported sword carrier');
   const keep=m.bones.filter(b=>!/[ _](Hand|Finger|Forearm)/.test(b.name)),wrists=m.bones.filter(b=>/[ _]Hand$/.test(b.name)),elbows=m.bones.filter(b=>/[ _]Forearm$/.test(b.name));
   const samples=[];let maxPropAngle=0,maxPropPosition=0,maxStep=0,maxHandStep=0,maxWristExportError=0,last=null,lastHands=null;
   for(let i=0;i<report.samples.length;i++){
    m.action.enabled=true;m.action.paused=false;m.mixer.setTime(i/60);m.model.updateMatrixWorld(true);
    // Blender's local -Z blade axis is exported as local -Y along with the
    // mesh vertices; the empty's rotation is basis-converted on both sides.
    const q=prop.getWorldQuaternion(new Quaternion()).normalize(),d=new Vector(0,-1,0).applyQuaternion(q);
    const expected=report.samples[i].bladeDirection,goal=new Vector(expected[0],expected[2],-expected[1]);maxPropAngle=Math.max(maxPropAngle,d.angleTo(goal)*180/Math.PI);
    const p=report.samples[i].propMatrix,pos=prop.getWorldPosition(new Vector());maxPropPosition=Math.max(maxPropPosition,pos.distanceTo(new Vector(p[0][3],p[2][3],-p[1][3])));
    if(last)maxStep=Math.max(maxStep,last.angleTo(q)*180/Math.PI);last=q;
    const hands=wrists.map(b=>b.getWorldQuaternion(new Quaternion()).normalize());if(lastHands)for(let k=0;k<hands.length;k++)maxHandStep=Math.max(maxHandStep,hands[k].angleTo(lastHands[k])*180/Math.PI);lastHands=hands;
    for(const side of ['R','L']){const b=wrists.find(b=>b.name.replaceAll('_',' ').endsWith(side+' Hand')),p=report.samples[i].wristPositions[side];maxWristExportError=Math.max(maxWristExportError,b.getWorldPosition(new Vector()).distanceTo(new Vector(p[0],p[2],-p[1])))}
    samples.push({body:keep.flatMap(b=>b.matrixWorld.elements),wrists:wrists.flatMap(b=>b.getWorldPosition(new Vector()).toArray()),elbows:elbows.flatMap(b=>b.getWorldPosition(new Vector()).toArray())});
   }
   return{samples,maxPropAngle,maxPropPosition,maxStep,maxHandStep,maxWristExportError,names:keep.map(b=>b.name)};
  },{report,faction});
  await page.evaluate(id=>MotionReview.loadVariant(MotionReview.selected.variants.find(v=>v.id===id)),`${faction}-v7-${name}`);
  await page.waitForFunction(id=>!MotionReview.loading&&MotionReview.variant.id===id,`${faction}-v7-${name}`);
  const prior=await page.evaluate(({current})=>{
   const m=MotionReview.model,Vector=m.model.position.constructor,keep=current.names.map(n=>m.bones.find(b=>b.name===n)),wrists=m.bones.filter(b=>/[ _]Hand$/.test(b.name)),elbows=m.bones.filter(b=>/[ _]Forearm$/.test(b.name));let body=0,wrist=0,elbow=0,length=0;
   for(let i=0;i<current.samples.length;i++){
    m.action.enabled=true;m.action.paused=false;m.mixer.setTime(i/60);m.model.updateMatrixWorld(true);
    const b=keep.flatMap(b=>b.matrixWorld.elements),w=wrists.flatMap(b=>b.getWorldPosition(new Vector()).toArray());
    for(let k=0;k<b.length;k++)body=Math.max(body,Math.abs(b[k]-current.samples[i].body[k]));
    for(let k=0;k<w.length;k++)wrist=Math.max(wrist,Math.abs(w[k]-current.samples[i].wrists[k]));
    const e=elbows.flatMap(b=>b.getWorldPosition(new Vector()).toArray());for(let k=0;k<e.length;k++)elbow=Math.max(elbow,Math.abs(e[k]-current.samples[i].elbows[k]));
    for(let k=0;k<w.length;k+=3){const before=Math.hypot(...w.slice(k,k+3).map((x,j)=>x-e[k+j])),after=Math.hypot(...current.samples[i].wrists.slice(k,k+3).map((x,j)=>x-current.samples[i].elbows[k+j]));length=Math.max(length,Math.abs(before-after))}
   }
   return{maxBodyMatrixDelta:body,maxWristCoordinateCorrection:wrist,maxElbowPositionDelta:elbow,maxForearmLengthDelta:length};
  },{current});
  assert.ok(prior.maxBodyMatrixDelta<.00003,`${name} ${faction}: protected body changed ${prior.maxBodyMatrixDelta}`);
  assert.ok(prior.maxElbowPositionDelta<.00003,`${name} ${faction}: elbow moved`);
  assert.ok(prior.maxForearmLengthDelta<.00003,`${name} ${faction}: forearm length changed`);
  assert.ok(current.maxWristExportError<.00003,`${name} ${faction}: wrist differs from verified correction`);
  assert.ok(current.maxPropAngle<.01,`${name} ${faction}: sword export direction ${current.maxPropAngle}`);
  assert.ok(current.maxPropPosition<.00003,`${name} ${faction}: sword export position`);
  assert.ok(current.maxStep<30,`${name} ${faction}: sudden blade flip ${current.maxStep}`);
  assert.ok(current.maxHandStep<60,`${name} ${faction}: sudden hand flip ${current.maxHandStep}`);
  results.push({name,faction,frames:current.samples.length,...prior,maxPropAngle:current.maxPropAngle,maxPropPosition:current.maxPropPosition,maxStepDegrees:current.maxStep,maxHandStepDegrees:current.maxHandStep,maxContactResidual:report.maxContactResidual});
  console.log(name,faction,current.samples.length,'frames',prior.maxBodyMatrixDelta,'body delta',current.maxStep,'blade step',current.maxHandStep,'hand step');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'Models/ReviewV8/Data_ExportValidation.json'),JSON.stringify({status:'passed',results,errors},null,2));
}finally{await browser.close()}
