// Read every exported frame and compare anatomical directions to the raw-derived
// source array. Also compare joint positions to Blender's independent report.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1],group='ReviewV7';
const ids=args.includes('--ids')?args[args.indexOf('--ids')+1].split(','):null;
const recipes=JSON.parse(await fs.readFile(path.join(root,'Models',group,'Data_Recipes.json'),'utf8'));
if(ids)for(const id of ids)assert.ok(recipes[id]&&recipes[id].kind!=='pair',`Unknown or non-body V7 action: ${id}`);
const names=['Pelvis','L Thigh','R Thigh','Spine','L Calf','R Calf','Spine1','L Foot','R Foot','Spine2','L Toe0','R Toe0','Neck','L Clavicle','R Clavicle','Head','L UpperArm','R UpperArm','L Forearm','R Forearm','L Hand','R Hand'];
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const [name,cfg] of Object.entries(recipes)){
  if(cfg.kind==='pair'||ids&&!ids.includes(name))continue;
  const motion=JSON.parse(await fs.readFile(path.join(root,'Models','_Cache',group,`Data_${name}Motion.json`),'utf8'));
  for(const faction of ['Nra','Ija']){
   const report=JSON.parse(await fs.readFile(path.join(root,'Models',group,`Data_${faction}_${name}_Validation.json`),'utf8'));
   await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
   await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading);
   await page.locator('#faction').selectOption(faction);
   await page.waitForFunction(faction=>!MotionReview.loading&&MotionReview.variant.faction===faction,faction);
   // Verify the requested V7 source even after a contact revision becomes latest.
   if(await page.evaluate(({name,faction})=>MotionReview.variant.id!==`${faction}-v7-${name}`,{name,faction})){
    await page.locator('#history > summary').click();
    await page.locator(`[data-variant="${faction}-v7-${name}"]`).click();
   }
   await page.waitForFunction(({name,faction})=>!MotionReview.loading&&MotionReview.variant.id===`${faction}-v7-${name}`,{name,faction});
   const data=await page.evaluate(({names,motion,report})=>{
    const model=MotionReview.model,bones=names.map(part=>model.bones.find(b=>b.name.replaceAll('_',' ').endsWith(' '+part)));
    if(bones.some(b=>!b))throw Error('Missing mapped bone');
    const sub=(a,b)=>a.map((x,i)=>x-b[i]);
    function Angle(a,b){const la=Math.hypot(...a),lb=Math.hypot(...b);return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0)/(la*lb))))*180/Math.PI}
    const conversion=a=>[a[0],a[2],-a[1]];
    let maxDirection=0,maxRawDirection=0,seamDirection=0,maxPosition=0,maxLength=0,maxWristRotationDelta=0,frames=0;
    const Quaternion=bones[0].quaternion.constructor,Matrix4=bones[0].matrixWorld.constructor;
    const conversionMatrix=new Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1),firstTarget={},firstSource={};
    function SourceQuaternion(r){return new Quaternion().setFromRotationMatrix(new Matrix4().set(r[0][0],r[0][1],r[0][2],0,r[1][0],r[1][1],r[1][2],0,r[2][0],r[2][1],r[2][2],0,0,0,0,1).premultiply(conversionMatrix))}
    const ends=[];
    for(let i=0;i<=motion.cycleFrames;i++){
     model.action.enabled=true;model.action.paused=false;model.mixer.setTime(i/60);model.model.updateMatrixWorld(true);
     const positions=bones.map(b=>b.getWorldPosition(b.position.clone()).toArray());
     for(const j of [20,21]){
      const q=bones[j].getWorldQuaternion(new Quaternion()).normalize(),raw=SourceQuaternion(motion.rotations[i][j]).normalize();
      if(i===0){firstTarget[j]=q.clone();firstSource[j]=raw.clone()}
      const targetDelta=q.multiply(firstTarget[j].clone().invert()).normalize(),sourceDelta=raw.multiply(firstSource[j].clone().invert()).normalize();
      maxWristRotationDelta=Math.max(maxWristRotationDelta,targetDelta.angleTo(sourceDelta)*180/Math.PI);
     }
     for(let j=0;j<22;j++)maxPosition=Math.max(maxPosition,Math.hypot(...sub(positions[j],conversion(report.samples[i].joints[j]))));
     for(let j=1;j<22;j++){
      const p=motion.sourceParents[j],segment=sub(positions[j],positions[p]),source=conversion(sub(motion.sourceRelativeJoints[i][j],motion.sourceRelativeJoints[i][p]));
      maxDirection=Math.max(maxDirection,Angle(segment,source));
      const raw=conversion(sub(motion.unclosedRelativeJoints[i][j],motion.unclosedRelativeJoints[i][p])),angle=Angle(segment,raw);
      if(i<motion.cycleFrames-motion.seamFrames)maxRawDirection=Math.max(maxRawDirection,angle);else seamDirection=Math.max(seamDirection,angle);
      const bind=sub(report.samples[0].joints[j],report.samples[0].joints[p]);maxLength=Math.max(maxLength,Math.abs(Math.hypot(...segment)-Math.hypot(...bind)));
     }
     if(i===0||i===motion.cycleFrames)ends.push(bones.flatMap(b=>b.matrixWorld.elements));frames++;
    }
    const loopDelta=motion.loop?Math.max(...ends[0].map((x,i)=>Math.abs(x-ends[1][i]))):null;
    return {frames,maxDirection,maxRawDirection,seamDirection,maxPosition,maxLength,maxWristRotationDelta,loopDelta};
   },{names,motion,report});
   assert.ok(data.maxDirection<.05,`${name} ${faction}: segment direction ${data.maxDirection}`);
   assert.ok(data.maxPosition<.00003,`${name} ${faction}: exported joint position ${data.maxPosition}`);
   assert.ok(data.maxLength<.00003,`${name} ${faction}: changed original bone lengths`);
   assert.ok(data.maxRawDirection<.05,`${name} ${faction}: altered source outside seam`);
   assert.ok(data.maxWristRotationDelta<.05,`${name} ${faction}: changed recovered wrist rotation ${data.maxWristRotationDelta}`);
   if(cfg.loop)assert.ok(data.loopDelta<.001,`${name} ${faction}: loop pose mismatch ${data.loopDelta}`);
   results.push({name,faction,...data});console.log(name,faction,data.frames,'frames',data.maxRawDirection.toFixed(5)+' deg');
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'Models',group,ids?'Data_SelectedExportFidelityValidation.json':'Data_ExportFidelityValidation.json'),JSON.stringify({status:'passed',selectedIds:ids,results,errors},null,2));
 console.log(JSON.stringify({status:'passed',variants:results.length,frames:results.reduce((n,r)=>n+r.frames,0),maxRawDirection:Math.max(...results.map(r=>r.maxRawDirection)),maxPosition:Math.max(...results.map(r=>r.maxPosition))}));
}finally{await browser.close()}
