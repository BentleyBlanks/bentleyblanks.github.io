// Inspect real exported skinning and shared-prop contacts, never a model video.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root)throw Error('--root required');
const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):9;
const group=`FirstLevelCarryV${revision}`,output=path.join(root,'Preview',group);
await fs.mkdir(output,{recursive:true});
const report=JSON.parse(await fs.readFile(path.join(root,'Models',group,'Data_ContactValidation.json'),'utf8'));
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 for(const name of ['CarryStretcherFront','CarryStretcherRear','StretcherPair']){
  await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
  await page.waitForFunction(({name,revision})=>window.MotionReview&&!MotionReview.loading&&MotionReview.variant.id===`Nra-v${revision}-`+name&&MotionReview.video.readyState>=2,{name,revision});
  await page.evaluate(()=>MotionReview.setPhase(.5));
  await page.waitForFunction(()=>!MotionReview.video.seeking);
  const data=await page.evaluate(({name,report})=>{
   const m=MotionReview.model;
   const Belongs=(bone,role)=>{for(let p=bone;p;p=p.parent)if(p.name.startsWith(role+'_'))return true;return false;};
   const Find=(role,suffix)=>m.bones.find(b=>b.name.replace(/[_.]\d+$/,'').replaceAll('_',' ').endsWith(' '+suffix)&&Belongs(b,role));
   const roles=name==='StretcherPair'?['Front','Rear']:[name.endsWith('Front')?'Front':'Rear'];
   const bone=m.bones[0],V=bone.position.constructor;
   let maxPalmError=0,maxLengthDelta=0,minHeight=Infinity,maxProjection=0;
   const firstLengths={},endpoints=[];let movement=0,last=null;
   for(let frame=0;frame<=120;frame++){
    m.action.enabled=true;m.action.paused=false;m.mixer.setTime(frame/60);m.model.updateMatrixWorld(true);
    const matrices=m.bones.flatMap(b=>b.matrixWorld.elements);
    if(frame===0||frame===120)endpoints.push(matrices);
    if(last)movement=Math.max(movement,...matrices.map((x,i)=>Math.abs(x-last[i])));last=matrices;
    for(const role of roles)for(const side of ['L','R']){
     const cfg=report.calibration[role][side],hand=Find(role,side+' Hand');
     const palm=new V(...cfg.palmLocal).applyMatrix4(hand.matrixWorld);
     const goal=new V(cfg.sign*.29,report.bedHeightMeters+.12,role==='Front'?1:-1);
     maxPalmError=Math.max(maxPalmError,palm.distanceTo(goal));
     for(const [a,b] of [['UpperArm','Forearm'],['Forearm','Hand'],['Thigh','Calf'],['Calf','Foot']]){
      const key=role+side+a,length=Find(role,side+' '+a).getWorldPosition(new V()).distanceTo(Find(role,side+' '+b).getWorldPosition(new V()));
      firstLengths[key]??=length;maxLengthDelta=Math.max(maxLengthDelta,Math.abs(length-firstLengths[key]));
     }
    }
    if(frame%15===0)m.model.traverse(o=>{if(o.isMesh&&o.geometry?.attributes.position){const v=new V();for(let i=0;i<o.geometry.attributes.position.count;i+=5){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);minHeight=Math.min(minHeight,v.y);v.project(m.camera);maxProjection=Math.max(maxProjection,Math.abs(v.x),Math.abs(v.y))}}});
   }
   return {name,frames:121,maxPalmError,maxLengthDelta,minHeight,maxProjection,movement,
    loopDelta:Math.max(...endpoints[0].map((x,i)=>Math.abs(x-endpoints[1][i]))),bones:m.bones.length,
    decodedVideo:MotionReview.video.videoWidth,rawTracks:MotionReview.recovery.tracks.length,
    range:MotionReview.range,videoTime:MotionReview.video.currentTime};
  },{name,report});
  assert.ok(data.maxPalmError<.00003,'exported palm grip '+JSON.stringify(data));
  assert.ok(data.maxLengthDelta<.00003,'original bone lengths');
  assert.ok(data.loopDelta<.001,'full loop');
  assert.ok(data.movement>.0001,'live bone movement');
  assert.ok(data.maxProjection<1,'complete skin and prop framing');
  assert.ok(data.decodedVideo>0&&data.rawTracks>0,'source and raw recovery');
  assert.ok(Math.abs(data.videoTime-(data.range[0]+1))<.002,'source seconds map');
  results.push(data);
  for(const [view,phase] of [['side',.12],['three',.5],['front',.75]]){
   await page.locator(`[data-view="${view}"]`).click();
   await page.evaluate(t=>MotionReview.setPhase(t),phase);await page.waitForFunction(()=>!MotionReview.video.seeking);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.screenshot({path:path.join(output,`Texture_${name}_${view}.png`)});
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'Data_ExportValidation.json'),JSON.stringify({status:'passed_numeric_requires_visual_review',results,errors},null,2));
 console.log(JSON.stringify({results,errors}));
}finally{await browser.close()}
