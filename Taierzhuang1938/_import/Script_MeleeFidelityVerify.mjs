// Compare actual exported GLB poses with untouched GVHMR joints at source time.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
assert.ok(root&&root!=='--root','--root required');
const group='MeleeVideoV2',out=path.join(root,'Preview','MeleeFidelityV2');
const recipes=JSON.parse(await fs.readFile(path.join(root,'Models',group,'Data_Recipes.json'),'utf8'));
await fs.mkdir(out,{recursive:true});
async function BindData(file){
 const buffer=await fs.readFile(file),jsonLength=buffer.readUInt32LE(12),doc=JSON.parse(buffer.subarray(20,20+jsonLength).toString());
 const binary=buffer.subarray(28+jsonLength),skin=doc.skins[0],accessor=doc.accessors[skin.inverseBindMatrices],view=doc.bufferViews[accessor.bufferView];
 return Object.fromEntries(skin.joints.map((id,index)=>[doc.nodes[id].name,{parent:doc.nodes.find(n=>n.children?.includes(id))?.name,matrix:Array.from({length:16},(_,i)=>binary.readFloatLE((view.byteOffset||0)+(accessor.byteOffset||0)+index*64+i*4))}]));
}
const browser=await LaunchBrowser(),results=[],errors=[],failures=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});page.on('pageerror',e=>errors.push(String(e)));
 for(const [name,cfg] of Object.entries(recipes)){
  await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
  await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading&&MotionReview.video.readyState>=2);
  const rawWrists=JSON.parse(await fs.readFile(path.join(root,'Models/RecoveryPreview',`Data_V2_${name}RawWristRotations.json`),'utf8'));
  await page.evaluate(value=>{window.FidelityRawWrists=value;window.FidelityWristCalibration={}},rawWrists);
  for(const faction of ['Nra','Ija']){
   const oldBind=await BindData(path.join(root,'Models/MeleeVideoV1',`Animation_${faction}_${name}_V1.glb`));
   const newBind=await BindData(path.join(root,'Models',group,`Animation_${faction}_${name}_V2.glb`));
   assert.deepEqual(Object.keys(newBind).sort(),Object.keys(oldBind).sort(),'Original bones retained');
   let maxBindDelta=0;
   for(const [bone,value] of Object.entries(newBind)){
    assert.equal(value.parent,oldBind[bone].parent,'Original hierarchy '+bone);
    maxBindDelta=Math.max(maxBindDelta,...value.matrix.map((v,i)=>Math.abs(v-oldBind[bone].matrix[i])));
   }
   assert.ok(maxBindDelta<1e-5,`Original bind changed: ${name} ${faction} ${maxBindDelta}`);
   await page.locator('#faction').selectOption(faction);
   await page.waitForFunction(f=>!MotionReview.loading&&MotionReview.variant.faction===f&&MotionReview.video.readyState>=2,faction);
   assert.ok((await page.evaluate(()=>MotionReview.variant.path)).startsWith('Models/'+group+'/'));
   await page.evaluate(()=>{window.FidelityWristCalibration={}});
   const samples=[],steps=(cfg.range[1]-cfg.range[0])*2;
   for(let step=0;step<=steps;step++){
    await page.evaluate(t=>MotionReview.setPhase(t),step/steps);
    await page.waitForFunction(()=>!MotionReview.video.seeking);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    samples.push(await page.evaluate(()=>{
     const m=MotionReview,raw=m.recovery.tracks[0],mapping={'Pelvis':0,'Spine':3,'Spine1':6,'Spine2':9,'Neck':12,'Head':15,'L Thigh':1,'R Thigh':2,'L Calf':4,'R Calf':5,'L Foot':7,'R Foot':8,'L Toe0':10,'R Toe0':11,'L Clavicle':13,'R Clavicle':14,'L UpperArm':16,'R UpperArm':17,'L Forearm':18,'R Forearm':19,'L Hand':20,'R Hand':21};
     const bones=Object.fromEntries(Object.keys(mapping).map(part=>[part,m.model.bones.find(b=>b.name.replaceAll('_',' ').endsWith(' '+part))]));
     const points=Object.fromEntries(Object.entries(bones).map(([part,b])=>[part,b.getWorldPosition(b.position.clone())]));
     const segments=[];
     for(const [part,index] of Object.entries(mapping)){
      const parent=Object.keys(mapping).find(p=>mapping[p]===raw.data.parents[index]);if(!parent)continue;
      const direction=points[part].clone().sub(points[parent]),source=raw.joints[index].position.clone().sub(raw.joints[mapping[parent]].position);
      segments.push({part,parent,angle:direction.angleTo(source)*180/Math.PI,length:direction.length()});
     }
     const wrists={},wristRotations={};
     for(const [side,ids] of [['L',[16,18,20]],['R',[17,19,21]]]){
      const shoulder=points[side+' UpperArm'],elbow=points[side+' Forearm'],hand=points[side+' Hand'];
      const upper=raw.joints[ids[1]].position.clone().sub(raw.joints[ids[0]].position).normalize(),lower=raw.joints[ids[2]].position.clone().sub(raw.joints[ids[1]].position).normalize();
      const expected=shoulder.clone().addScaledVector(upper,shoulder.distanceTo(elbow)).addScaledVector(lower,elbow.distanceTo(hand));
      wrists[side]=hand.distanceTo(expected);
      const rotations=FidelityRawWrists.worldRotations,frame=raw.frame,a=Math.floor(frame),b=Math.min(a+1,rotations.length-1),sideIndex=side==='L'?0:1;
      const matrix=m.model.camera.matrix.clone(),ReadRotation=row=>{matrix.set(row[0][0],row[0][1],row[0][2],0,row[1][0],row[1][1],row[1][2],0,row[2][0],row[2][1],row[2][2],0,0,0,0,1);return m.model.camera.quaternion.clone().setFromRotationMatrix(matrix)};
      const sourceRotation=ReadRotation(rotations[a][sideIndex]).slerp(ReadRotation(rotations[b][sideIndex]),frame-a);
      sourceRotation.premultiply(m.model.camera.quaternion.clone().setFromRotationMatrix(raw.rotation));
      const actual=bones[side+' Hand'].getWorldQuaternion(m.model.camera.quaternion.clone());
      FidelityWristCalibration[side]??=sourceRotation.clone().invert().multiply(actual);
      wristRotations[side]=actual.angleTo(sourceRotation.multiply(FidelityWristCalibration[side]))*180/Math.PI;
     }
     return{phase:m.phase,sourceFrame:raw.frame,segments,wrists,wristRotations};
    }));
   }
   const angles=samples.flatMap(s=>s.segments.map(s=>s.angle)),wrists=samples.flatMap(s=>Object.values(s.wrists));
   const maxLengthDrift=Math.max(...samples.flatMap(s=>s.segments.map((v,i)=>Math.abs(v.length-samples[0].segments[i].length))));
   const maxWristRotation=Math.max(...samples.flatMap(s=>Object.values(s.wristRotations)));
   const result={name,faction,maxBindDelta,maxLengthDrift,poses:samples.length,meanAngle:angles.reduce((a,b)=>a+b)/angles.length,maxAngle:Math.max(...angles),maxWrist:Math.max(...wrists),maxWristRotation,samples};
   results.push(result);console.log(JSON.stringify({...result,samples:undefined}));
   if(result.maxAngle>.5||result.maxWrist>.002||result.maxLengthDrift>.0001||maxWristRotation>.5)failures.push({name,faction,maxAngle:result.maxAngle,maxWrist:result.maxWrist,maxLengthDrift,maxWristRotation});
  }
 }
 const report={status:failures.length||errors.length?'failed':'passed',requirements:{maxSegmentAngleDeg:.5,maxWristDistanceM:.002,maxBoneLengthDriftM:.0001,maxBindDelta:1e-5,maxWristRotationDeg:.5},results,failures,errors};
 await fs.writeFile(path.join(out,'Data_FidelityValidation.json'),JSON.stringify(report,null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
}finally{await browser.close()}
