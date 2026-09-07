// Inspect actual GLB bind data, all-frame support and unchanged upper-body motion.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {LoadGlb,ReadAccessor} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
assert.ok(root&&root!=='--root');
const group='FirstLevelSeatedV2',output=path.join(root,'Preview',group);
await fs.mkdir(output,{recursive:true});
const Read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const browser=await LaunchBrowser(),errors=[],results=[];
const catalog=await Read('Preview/Data_Catalog.json');
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 for(const name of ['TrainMealCutOffer','TrainBenchRise']){
  const report=await Read(`Models/${group}/Data_${name}ContactValidation.json`);
  const source=catalog.actions.find(a=>a.id===name).variants.find(v=>v.id==='Nra-v1-'+name);
  const prior=await Read(source.review.retargetReport);
  const original=LoadGlb(path.join(root,source.path)),current=LoadGlb(path.join(root,report.path));
  const oldSkin=original.json.skins[0],newSkin=current.json.skins[0];
  const oldNames=oldSkin.joints.map(i=>original.json.nodes[i].name),newNames=newSkin.joints.map(i=>current.json.nodes[i].name);
  assert.deepEqual(newNames,oldNames,'Original skin bone names and order');
  const oldBind=ReadAccessor(original,oldSkin.inverseBindMatrices).data,newBind=ReadAccessor(current,newSkin.inverseBindMatrices).data;
  assert.equal(newBind.length,oldBind.length);
  const bindError=Math.max(...newBind.map((v,i)=>Math.abs(v-oldBind[i])));
  assert.ok(bindError<.00003,'Original inverse bind matrices');
  function Parents(glb){const parents=new Map();glb.json.nodes.forEach(n=>{for(const child of n.children||[])parents.set(glb.json.nodes[child].name,n.name)});return oldNames.map(n=>parents.get(n))}
  assert.deepEqual(Parents(current),Parents(original),'Original bone hierarchy');
  await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
  await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading);
  await page.evaluate(name=>MotionReview.loadVariant(MotionReview.selected.variants.find(v=>v.id==='Nra-v2-'+name)),name);
  await page.waitForFunction(name=>window.MotionReview&&!MotionReview.loading&&MotionReview.variant.id==='Nra-v2-'+name&&MotionReview.video.readyState>=2,name);
  const data=await page.evaluate(({report,prior})=>{
   const m=MotionReview.model,V=m.bones[0].position.constructor;
   const Find=p=>m.bones.find(b=>b.name.replaceAll('_',' ').endsWith(' '+p));
   const Pt=p=>Find(p).getWorldPosition(new V());
   const Convert=p=>new V(p[0],p[2],-p[1]);
   const upper=['Pelvis','Spine','Spine1','Spine2','Neck','Head','L Clavicle','R Clavicle','L UpperArm','R UpperArm','L Forearm','R Forearm','L Hand','R Hand'];
   const ids=[0,3,6,9,12,15,13,14,16,17,18,19,20,21];
   const meshes=[];m.model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
   const seat=m.model.getObjectByName('Prop_TrainBenchSeat');
   if(!seat?.isMesh)throw Error('Exported bench seat missing');
   const seatBounds={min:new V(Infinity,Infinity,Infinity),max:new V(-Infinity,-Infinity,-Infinity)};
   for(let i=0;i<seat.geometry.attributes.position.count;i++){
    const p=new V().fromBufferAttribute(seat.geometry.attributes.position,i).applyMatrix4(seat.matrixWorld);
    seatBounds.min.min(p);seatBounds.max.max(p);
   }
   const benchColor=seat.material.color.toArray();
   const skins=meshes.map(mesh=>{
    const foot={L:[],R:[]},g=mesh.geometry;
    for(let i=0;i<g.attributes.position.count;i++)for(const side of ['L','R']){
     let weight=0;
     for(let j=0;j<4;j++){
      const bone=mesh.skeleton.bones[g.attributes.skinIndex.getComponent(i,j)];
      if(bone&&new RegExp(' '+side+' (Foot|Toe0)$').test(bone.name.replaceAll('_',' ')))weight+=g.attributes.skinWeight.getComponent(i,j);
     }
     if(weight>.65)foot[side].push(i);
    }
    return {mesh,foot};
   });
   let footError=0,upperError=0,lengthError=0,minimumSole=Infinity,maximumSole=-Infinity,seatPenetratingVertices=0,maxProjection=0;
   const lengths={},samples=[];
   for(let frame=0;frame<report.frames;frame++){
    m.action.enabled=true;m.action.paused=false;m.mixer.setTime(frame/60);m.model.updateMatrixWorld(true);
    const expected=report.samples[frame];
    for(const side of ['L','R']){
     footError=Math.max(footError,Pt(side+' Foot').distanceTo(Convert(expected.footTargets[side])));
     for(const [a,b] of [['Thigh','Calf'],['Calf','Foot'],['Foot','Toe0']]){
      const key=side+a,length=Pt(side+' '+a).distanceTo(Pt(side+' '+b));lengths[key]??=length;
      lengthError=Math.max(lengthError,Math.abs(length-lengths[key]));
     }
    }
    upper.forEach((part,j)=>{const position=Convert(prior.samples[frame].joints[ids[j]]).add(Convert(expected.rootCorrectionMeters));upperError=Math.max(upperError,Pt(part).distanceTo(position))});
    const sole={L:Infinity,R:Infinity};let penetration=0;
    for(const {mesh,foot} of skins){
     const v=new V();
     for(const side of ['L','R'])for(const i of foot[side]){
      mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);sole[side]=Math.min(sole[side],v.y);
     }
     for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);
      // Inspect the complete seat slab, not only the region chosen by the baker.
      if(['x','y','z'].every(axis=>v[axis]>seatBounds.min[axis]+.00001&&v[axis]<seatBounds.max[axis]-.00001))penetration++;
      if(frame%15===0||frame===report.frames-1){v.project(m.camera);maxProjection=Math.max(maxProjection,Math.abs(v.x),Math.abs(v.y))}
     }
    }
    minimumSole=Math.min(minimumSole,sole.L,sole.R);maximumSole=Math.max(maximumSole,sole.L,sole.R);
    seatPenetratingVertices=Math.max(seatPenetratingVertices,penetration);
    samples.push({sourceSeconds:frame/60,sole,seatPenetratingVertices:penetration});
   }
   return {frames:report.frames,footError,upperError,lengthError,minimumSole,maximumSole,seatPenetratingVertices,seatBounds,benchColor,maxProjection,samples};
  },{report,prior});
  assert.ok(data.footError<.00003&&data.upperError<.00003&&data.lengthError<.00003,JSON.stringify(data));
  assert.ok(data.minimumSole>-.0005&&data.maximumSole<.008,'Exported sole support');
  assert.equal(data.seatPenetratingVertices,0,'No skin vertex inside the complete exported bench slab in any frame');
  assert.ok(data.benchColor[0]>.2&&data.benchColor[0]<.4&&data.benchColor[2]<.15,'Exported brown bench material');
  assert.ok(data.maxProjection<1,'Whole model framing');
  results.push({name,bindError,...data});
  for(const [view,seconds] of [['front',0],['side',0],['side',name==='TrainBenchRise'?5.1:3],['side',name==='TrainBenchRise'?7.9:7.5]]){
   await page.locator(`[data-view="${view}"]`).click();
   await page.evaluate(seconds=>{MotionReview.setPlaying(false);MotionReview.setPhase(seconds/MotionReview.model.duration)},seconds);
   await page.waitForFunction(()=>!MotionReview.video.seeking);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.screenshot({path:path.join(output,`Texture_${name}_${view}_${Math.round(seconds*1000)}.png`)});
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'Data_ExportSupportValidation.json'),JSON.stringify({status:'support_verified_visual_review_required',results,errors},null,2));
 console.log(JSON.stringify(results.map(({samples,...result})=>result)));
}finally{await browser.close()}
