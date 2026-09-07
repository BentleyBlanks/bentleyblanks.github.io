// Check actual exported V3 skin against the thigh surface and immutable V2 body.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {LoadGlb,ReadAccessor} from './Script_LugouGlbPose.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];assert.ok(root);
const group='FirstLevelBenchV3',output=path.join(root,'Preview',group);
await fs.mkdir(output,{recursive:true});
const Read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const catalog=await Read('Preview/Data_Catalog.json'),entry=catalog.actions.find(a=>a.id==='TrainBenchRise');
const source=entry.variants.find(v=>v.id==='Nra-v2-TrainBenchRise'),target=entry.variants.find(v=>v.id==='Nra-v3-TrainBenchRise');
const original=LoadGlb(path.join(root,source.path)),current=LoadGlb(path.join(root,target.path));
const Skin=g=>{const s=g.json.skins[0];return {names:s.joints.map(i=>g.json.nodes[i].name),bind:Array.from(ReadAccessor(g,s.inverseBindMatrices).data),parents:s.joints.map(i=>g.json.nodes.find(n=>n.children?.includes(i))?.name)}};
assert.deepEqual(Skin(current),Skin(original),'Original bind, bones and hierarchy');
const report=await Read(target.review.retargetReport),browser=await LaunchBrowser(),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8136/Preview/index.html?action=TrainBenchRise');
 await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading);
 await page.evaluate(source=>MotionReview.loadVariant(source),source);
 await page.waitForFunction(()=>!MotionReview.loading&&MotionReview.variant.id==='Nra-v2-TrainBenchRise');
 await page.evaluate(frames=>{
  MotionReview.setPlaying(false);const m=MotionReview.model;
  window.benchBaseline=[];
  for(let frame=0;frame<frames;frame++){
   m.action.enabled=true;m.action.paused=false;m.mixer.setTime(frame/60);m.model.updateMatrixWorld(true);
   benchBaseline.push(Object.fromEntries(m.bones.filter(b=>!/(UpperArm|Forearm|Hand|Finger)/.test(b.name)).map(b=>[b.name,b.matrixWorld.toArray()])));
  }
 },report.frames);
 await page.evaluate(target=>MotionReview.loadVariant(target),target);
 await page.waitForFunction(()=>!MotionReview.loading&&MotionReview.variant.id==='Nra-v3-TrainBenchRise'&&MotionReview.video.readyState>=2);
 const data=await page.evaluate(async report=>{
  const THREE=await import('three'),V=THREE.Vector3,m=MotionReview.model;
  const Find=p=>m.bones.find(b=>b.name.replaceAll('_',' ').endsWith(' '+p)),Pt=p=>Find(p).getWorldPosition(new V());
  const Convert=p=>new V(p[0],p[2],-p[1]);
  const meshes=[];m.model.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
  const prepared=meshes.map(mesh=>{
   const g=mesh.geometry,skin={};
   for(const side of ['L','R']){
    const hand=[],thigh=new Set();
    for(let i=0;i<g.attributes.position.count;i++){
     let hw=0,tw=0;
     for(let j=0;j<4;j++){
      const name=mesh.skeleton.bones[g.attributes.skinIndex.getComponent(i,j)]?.name.replaceAll('_',' ')||'';
      const w=g.attributes.skinWeight.getComponent(i,j);
      if(name.includes(' '+side+' Hand')||name.includes(' '+side+' Finger'))hw+=w;
      if(name.endsWith(' '+side+' Thigh'))tw+=w;
     }
     if(hw>.8)hand.push(i);if(tw>.65)thigh.add(i);
    }
    const triangles=[],index=g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i);
    for(let i=0;i<index.length;i+=3){const t=Array.from(index.slice(i,i+3));if(t.every(v=>thigh.has(v)))triangles.push(t)}
    skin[side]={hand,triangles};
   }
   return {mesh,skin};
  });
  let bodyError=0,lengthError=0,minGap=Infinity,maxGap=-Infinity,maxProjection=0;
  const lengths={},samples=[];
  for(let frame=0;frame<report.frames;frame++){
   m.action.enabled=true;m.action.paused=false;m.mixer.setTime(frame/60);m.model.updateMatrixWorld(true);
   for(const b of m.bones)if(benchBaseline[frame][b.name])for(let i=0;i<16;i++)bodyError=Math.max(bodyError,Math.abs(b.matrixWorld.elements[i]-benchBaseline[frame][b.name][i]));
   for(const side of ['L','R'])for(const [a,b] of [['UpperArm','Forearm'],['Forearm','Hand']]){
    const l=Pt(side+' '+a).distanceTo(Pt(side+' '+b)),key=side+a;lengths[key]??=l;lengthError=Math.max(lengthError,Math.abs(l-lengths[key]));
   }
   const expected=report.samples[frame],gaps={};
   if(frame%6===0&&expected.contactWeight===1){
    const allHands={L:[],R:[]},allTriangles={L:[],R:[]};
    for(const {mesh,skin} of prepared){
     const points=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld));
     for(const side of ['L','R']){
      allHands[side].push(...skin[side].hand.map(i=>points[i]));
      allTriangles[side].push(...skin[side].triangles.map(t=>new THREE.Triangle(...t.map(i=>points[i]))));
     }
    }
    for(const side of ['L','R']){
     let minimum=Infinity;const wanted=Convert(expected.contacts[side].normal),nearest=new V(),normal=new V();
     for(const p of allHands[side]){
      let best=Infinity,signed=Infinity;
      for(const t of allTriangles[side]){
       t.closestPointToPoint(p,nearest);const d=p.distanceToSquared(nearest);if(d>=best)continue;
       best=d;t.getNormal(normal);if(normal.dot(wanted)<0)normal.negate();signed=p.clone().sub(nearest).dot(normal);
      }
      if(best<.16*.16)minimum=Math.min(minimum,signed);
     }
     gaps[side]=minimum;minGap=Math.min(minGap,minimum);maxGap=Math.max(maxGap,minimum);
    }
    samples.push({sourceSeconds:frame/60,gaps});
   }
   if(frame%15===0)for(const {mesh} of prepared)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    const p=mesh.getVertexPosition(i,new V()).applyMatrix4(mesh.matrixWorld).project(m.camera);maxProjection=Math.max(maxProjection,Math.abs(p.x),Math.abs(p.y));
   }
  }
  return {frames:report.frames,bodyError,lengthError,minGap,maxGap,contactSampleCount:samples.length,maxProjection,samples};
 },report);
 await fs.writeFile(path.join(output,'Data_ExportPalmValidation.json'),JSON.stringify({status:'export_measured_pending_visual_review',...data,errors},null,2));
 assert.ok(data.bodyError<.00003&&data.lengthError<.00003,'V2 body and original arm lengths');
 assert.ok(data.minGap>=-.001&&data.maxGap<.012,'Actual exported hand/thigh skin contact '+JSON.stringify({min:data.minGap,max:data.maxGap}));
 assert.ok(data.maxProjection<1,'Whole model in view');
 for(const [view,seconds] of [['front',0],['side',0],['side',4.5],['side',5.2],['side',5.5],['side',7.9]]){
  await page.locator(`[data-view="${view}"]`).click();
  await page.evaluate(seconds=>{MotionReview.setPlaying(false);MotionReview.setPhase(seconds/MotionReview.model.duration)},seconds);
  await page.waitForFunction(()=>!MotionReview.video.seeking);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:path.join(output,`Texture_TrainBenchRise_${view}_${Math.round(seconds*1000)}.png`)});
 }
 for(const [view,seconds] of [['front',0],['three',0],['side',5.2]]){
  await page.locator(`[data-view="${view}"]`).click();
  await page.evaluate(seconds=>{
   const r=MotionReview,m=r.model,V=m.bones[0].position.constructor;
   r.setPhase(seconds/m.duration);
   m.action.enabled=true;m.action.paused=false;m.mixer.setTime(seconds);m.model.updateMatrixWorld(true);
   const hands=m.bones.filter(b=>/[LR] Hand$/.test(b.name.replaceAll('_',' ')));
   if(hands.length!==2)throw Error('Two original hand bones required');
   const center=hands.reduce((v,b)=>v.add(b.getWorldPosition(new V())),new V()).multiplyScalar(1/hands.length);
   r.selected.cameraCenter=center.toArray();
   m.host.dispatchEvent(new WheelEvent('wheel',{deltaY:Math.log(1.4/5)*1000,cancelable:true}));
  },seconds);
  await page.waitForFunction(()=>!MotionReview.video.seeking);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:path.join(output,`Texture_HandClose_${view}_${Math.round(seconds*1000)}.png`)});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({...data,samples:undefined,errors}));
}finally{await browser.close()}
