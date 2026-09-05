// Local source / unretargeted recovery / latest model acceptance checks.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2);
function Arg(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1]}
const root=Arg('--root'),url=Arg('--url','http://127.0.0.1:8136/Preview/index.html');
if(!root)throw Error('--root is required');
const project=Arg('--project');
const {LaunchBrowser}=await import((project?pathToFileURL(path.join(project,'PrairieFire1937/Script_BrowserTestKit.mjs')):new URL('../../PrairieFire1937/Script_BrowserTestKit.mjs',import.meta.url)).href);
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[],results=[],controls={};
page.on('pageerror',e=>errors.push(e.message));
async function Ready(id){await page.waitForFunction(id=>window.MotionReview&&!MotionReview.loading&&MotionReview.model.variant?.id===id&&(!MotionReview.range||MotionReview.video.readyState>=2),id)}
async function Snapshot(phase){
 await page.evaluate(t=>MotionReview.setPhase(t),phase);await page.waitForFunction(()=>!MotionReview.video.seeking);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 return page.evaluate(()=>{
  const m=MotionReview,time=m.range?m.range[0]+m.phase*(m.range[1]-m.range[0]):null;let rawError=0;
  for(const track of m.recovery.tracks){
   const frame=Math.min(time*track.data.fps,track.data.positions.length-1),a=Math.floor(frame),b=Math.min(a+1,track.data.positions.length-1),t=frame-a;
   for(let j=0;j<track.joints.length;j++){
    const v=track.data.positions[a][j].map((x,k)=>x+(track.data.positions[b][j][k]-x)*t-track.data.viewerOrigin[k]),c=Math.cos(track.data.viewerYawRadians),s=Math.sin(track.data.viewerYawRadians);
    const expected=[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]].map((x,k)=>x+track.offset.getComponent(k));
    rawError=Math.max(rawError,...expected.map((x,k)=>Math.abs(x-track.joints[j].position.getComponent(k))));
   }
  }
  const nearStockParts=[];m.model.model.traverse(o=>{if(o.isMesh&&o.name.includes('RifleNear'))nearStockParts.push(o.name)});
  return {id:m.variant.id,nearStockParts,phase:m.phase,duration:m.model.duration,bones:m.model.bones.length,matrices:m.model.bones.flatMap(b=>b.matrixWorld.elements),time,videoTime:m.video.currentTime,videoWidth:m.video.videoWidth,videoSource:m.video.currentSrc,range:m.range,trackFrames:m.recovery.tracks.map(t=>t.frame),rawPositions:m.recovery.tracks.flatMap(t=>t.joints.flatMap(j=>j.position.toArray())),rawError,rawTracks:m.recovery.tracks.length,modelTime:m.model.mixer.time,sourceHidden:document.getElementById('sourceEmpty').hidden};
 });
}
function Delta(a,b){assert.equal(a.length,b.length);return Math.max(0,...a.map((v,i)=>Math.abs(v-b[i])))}
function CheckSync(s,v){
 assert.ok(s.matrices.every(Number.isFinite),v.id+' finite matrices');assert.ok(Math.abs(s.modelTime-s.phase*s.duration)<.00001,'Model time');
 if(v.id.startsWith('Ija-v3-'))assert.equal(s.nearStockParts.length,2,'Complete Type 38 stock and receiver exported');
 if(!v.review?.sourceVideo)return;
 assert.ok(s.videoWidth>0&&s.sourceHidden,'Original video decoded and visible');assert.ok(Math.abs(s.time-s.videoTime)<.002,'Video time');
 assert.equal(s.videoSource,new URL('../'+v.review.sourceVideo,url).href);assert.equal(s.rawTracks,v.review.recoveryTracks.length);assert.ok(s.rawError<1e-10,'Raw viewing transform');
 for(const frame of s.trackFrames)assert.ok(Math.abs(frame-s.time*v.review.recoveryFps)<1e-7,'Recovery frame');
}
async function LatestReady(action,faction='Nra'){const id=await page.evaluate(({action,faction})=>MotionReview.catalog.actions.find(e=>e.id===action).latestByFaction[faction],{action,faction});await Ready(id)}
async function Select(action,id){await page.locator('#list details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));await page.locator(`#list button[data-id="${action}"]`).click();await page.locator('#faction').selectOption('Nra');if(id)await Ready(id);else await LatestReady(action)}
try{
 await page.goto(url+'?action=RifleCrouchAdvance');await LatestReady('RifleCrouchAdvance');const actions=await page.evaluate(()=>MotionReview.catalog.actions);
 assert.equal(await page.locator('#paneB').count(),0);assert.equal(await page.locator('#panes > article').count(),3);assert.equal(await page.locator('#history').evaluate(e=>e.open),false);
 assert.equal(await page.locator('#legacyActions').evaluate(e=>e.open),false);assert.equal(await page.locator('#splitActions').evaluate(e=>e.open),false);
 for(const entry of actions){
  await page.locator('#list details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
  await page.locator(`#list button[data-id="${entry.id}"]`).click();
  for(const [faction,id] of Object.entries(entry.latestByFaction)){
   await page.locator('#faction').selectOption(faction);await Ready(id);
   const variant=entry.variants.find(v=>v.id===id),a=await Snapshot(.15),b=await Snapshot(.7);CheckSync(b,variant);
   const movement=Delta(a.matrices,b.matrices),rawMovement=Delta(a.rawPositions,b.rawPositions);let seam=null;
   if(Number(id.match(/-v(\d+)-/)?.[1]||0)>=2)assert.ok(movement>.0001,'Animated latest model '+id);
   if(b.rawTracks)assert.ok(rawMovement>.0001,'Moving raw recovery '+id);
   if(entry.loop&&Number(id.match(/-v(\d+)-/)?.[1]||0)>=2){seam=Delta((await Snapshot(0)).matrices,(await Snapshot(1)).matrices);assert.ok(seam<.001,'Loop endpoints '+id+' '+seam)}
   results.push({id,duration:b.duration,bones:b.bones,movement,seam,range:b.range,rawTracks:b.rawTracks,rawError:b.rawError,rawMovement});
   if(faction==='Nra'&&['RifleCrouchAdvance','KneelHold','KneelSequence','StretcherPair'].includes(entry.id)){await Snapshot(.45);await page.screenshot({path:path.join(root,'Preview',`Texture_SourceRecoveryLatest_${entry.id}.png`)})}
  }
 }
 await Select('RifleCrouchAdvance');await page.locator('#history > summary').click();await page.locator('[data-variant="Nra-v1-RifleCrouchAdvance"]').click();await Ready('Nra-v1-RifleCrouchAdvance');
 const history=await Snapshot(.4);assert.deepEqual(history.range,[.3,3.8]);controls.history={id:history.id,range:history.range,time:history.videoTime};
 await page.locator('#latest').click();await LatestReady('RifleCrouchAdvance');const latest=await Snapshot(.4);assert.deepEqual(latest.range,[1,4.3]);
 await page.locator('#next').click();const step=await Snapshot(await page.evaluate(()=>MotionReview.phase));assert.ok(Math.abs(step.videoTime-latest.videoTime-1/30)<.002);
 await page.locator('#prev').click();assert.ok(Math.abs((await Snapshot(await page.evaluate(()=>MotionReview.phase))).videoTime-latest.videoTime)<.002);controls.frameStep=true;
 await page.locator('#timeline').fill('0.25');assert.ok(Math.abs((await Snapshot(await page.evaluate(()=>MotionReview.phase))).videoTime-1.825)<.002);controls.scrub=true;
 await page.locator('#skeleton').check();await page.locator('[data-view="side"]').click();await page.evaluate(()=>new Promise(requestAnimationFrame));
 controls.view=await page.evaluate(()=>({skeleton:MotionReview.model.skeleton.visible,camera:MotionReview.model.camera.position.toArray()}));assert.ok(controls.view.skeleton&&controls.view.camera[0]<-1);
 await Snapshot(.2);await page.locator('#speed').selectOption('0.5');await page.locator('#play').click();await page.waitForFunction(()=>!MotionReview.video.paused&&MotionReview.video.playbackRate===.5);
 const start=await page.evaluate(()=>MotionReview.video.currentTime);await page.waitForFunction(start=>MotionReview.video.currentTime>start+.18,start);
 await page.locator('#play').click();const paused=await page.evaluate(()=>MotionReview.video.currentTime);await page.evaluate(()=>new Promise(r=>setTimeout(r,150)));
 assert.ok(Math.abs(await page.evaluate(()=>MotionReview.video.currentTime)-paused)<.002);controls.playback={speed:.5,start,paused};
 await page.locator('#speed').selectOption('1');await Snapshot(.995);await page.locator('#play').click();await page.waitForFunction(()=>MotionReview.phase<.25&&MotionReview.playing);controls.loop=true;
 await Select('StandToKneel');await Snapshot(.985);await page.locator('#play').click();await page.waitForFunction(()=>!MotionReview.playing&&MotionReview.phase===1);controls.nonLoopStop=true;
 await Select('CarryStretcherFront');await page.locator('#history > summary').click();await page.locator('[data-variant="Nra-original-CarryStretcherFront"]').click();await Ready('Nra-original-CarryStretcherFront');
 controls.missing=await page.evaluate(()=>({range:MotionReview.range,tracks:MotionReview.recovery.tracks.length,source:document.getElementById('sourceEmpty').textContent,recovery:document.getElementById('recoveryEmpty').textContent}));
 assert.equal(controls.missing.range,null);assert.equal(controls.missing.tracks,0);assert.match(controls.missing.source,/未记录/);assert.match(controls.missing.recovery,/没有关联/);
 await page.route('**/*Animation_Nra_RifleCrouchAdvance*',async route=>{await new Promise(r=>setTimeout(r,350));await route.continue()});
 await page.evaluate(()=>{MotionReview.select(MotionReview.catalog.actions.find(e=>e.id==='RifleCrouchAdvance'));MotionReview.select(MotionReview.catalog.actions.find(e=>e.id==='KneelHold'))});
 await LatestReady('KneelHold');await page.evaluate(()=>new Promise(r=>setTimeout(r,500)));assert.equal(await page.evaluate(()=>MotionReview.model.variant.id),await page.evaluate(()=>MotionReview.selected.latestByFaction.Nra));controls.rapidSwitch=true;
 await page.locator('#faction').selectOption('Ija');await LatestReady('KneelHold','Ija');assert.ok((await Snapshot(.4)).sourceHidden);controls.sameSourceFactionSwitch=true;
 await Select('CrouchIdle','Nra-original-CrouchIdle');controls.legacy=await page.evaluate(()=>({source:document.getElementById('sourceEmpty').textContent,recovery:document.getElementById('recoveryEmpty').textContent}));assert.match(controls.legacy.source,/BIP/);assert.match(controls.legacy.recovery,/未经过 GVHMR/);
 await Select('StretcherPair');assert.match(await page.locator('#status').textContent(),/不符合严格单人/);controls.splitInputLinks=await page.locator('#references a').filter({hasText:'实际裁剪推理输入'}).count();assert.equal(controls.splitInputLinks,2);
 const source=actions.find(e=>e.id==='WoundedLimp').variants.find(v=>v.id==='Nra-v2-WoundedLimp').review.sourceVideo;
 const response=await fetch(new URL('../'+source,url),{headers:{Range:'bytes=0-63'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,64);controls.referenceRangeStatus=206;
 assert.deepEqual(errors,[]);const report={status:'passed',rendering:'Original video + untouched GVHMR joints + latest GLTFLoader/AnimationMixer model',variants:results,controls,errors};
 await fs.writeFile(path.join(root,'Preview','Data_Validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',variants:results.length,rawVariants:results.filter(r=>r.rawTracks).length,maxLoopEndpointMatrixDelta:Math.max(...results.map(r=>r.seam||0)),controls,errors}));
}catch(error){await fs.writeFile(path.join(root,'Preview','Data_Validation.json'),JSON.stringify({status:'failed',failure:error.stack,variants:results,controls,errors},null,2));throw error}finally{await browser.close()}
