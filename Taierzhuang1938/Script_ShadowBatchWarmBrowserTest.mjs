// Real legacy boot must warm native batch depth before admitting static casters.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','ShadowBatchWarm');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!/fonts\./.test(m.location()?.url||''))errors.push(m.text().slice(0,700));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 const Open=async query=>{await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?quality=high&menu=0&audio=0&${query}`,{waitUntil:'domcontentloaded',timeout:180000});await page.waitForFunction(()=>!!window.Tengxian?.state?.ready,null,{timeout:600000});};
 const ReadLegacy=()=>page.evaluate(async()=>{
  const g=Tengxian,T=await import('three'),M=await import('./Script_MaterialPatches.mjs'),{ShadowDepthFor}=await import('./Script_ShadowDepth.mjs');
  const b=g.shadowCasterBatch,r=g.renderer,gl=r.getContext();
  const boot={warm:g.state.shadowBatchWarm,fullMissionWarm:!!g.state.levelWarm,manual:g.state.manualStep,members:b.stats.members,warmedDepth:b.warmedDepth.size,
   warmProxyPresent:!!g.scene.getObjectByName('ShadowBatchBootWarmProxy')};
  const DepthPrograms=()=>{
   const materials=new Set([...b.depthClones.values(),ShadowDepthFor({isMesh:true,isBatchedMesh:true})]);
   return [...new Set([...materials].flatMap(material=>[...(r.properties.get(material)?.programs?.values()||[])].map(program=>program.cacheKey)))].sort();
  };
  const beforePrograms=DepthPrograms();
  g.editor.Open('shotCamera');g.camera.far=2000;g.camera.fov=55;g.camera.updateProjectionMatrix();g.graphics.autoQuality=false;g.ApplyGraphics();g.Debug.ApplySky('firstLevelNight');
  g.post.SetTaaEnabled(false);g.post.SetAutoExposure(false);g.lights.ClearFires();
  g.scene.children.forEach(object=>{if(object.name==='SkyDome')object.visible=false;});
  const mat=new T.MeshStandardMaterial({color:0xaaaaaa,roughness:1,fog:false});M.ApplyPatches(mat,[M.MakeClusteredLightsPatch()]);
  const ground=new T.Mesh(new T.BoxGeometry(18,.2,18),mat);ground.position.set(2100,-.1,0);ground.castShadow=true;ground.receiveShadow=true;ground.name='BatchWarmReceiver';g.scene.add(ground);
  const roof=new T.Mesh(new T.BoxGeometry(4,.2,4),mat);roof.position.set(2100,4,0);roof.castShadow=true;roof.receiveShadow=true;roof.name='BatchWarmBlocker';g.scene.add(roof);
  g.camera.position.set(2107,3,9);g.camera.lookAt(2100,0,0);const e=new T.Euler().setFromQuaternion(g.camera.quaternion,'YXZ');g.editor.flycam.yaw=e.y;g.editor.flycam.pitch=e.x;
  g.scene.updateMatrixWorld();const joined=b.Prime();
  const id=g.lights.AddFire({x:2100,y:8,z:0},{color:0xffffff,intensity:350,radius:35,flicker:false,flareShadow:true,autoSmoke:false});
  const Read=()=>[[2100,0,0],[2106,0,0]].map(v=>{const q=new T.Vector3(...v).project(g.camera),a=new Uint16Array(4),rt=g.post.targets.hdr;
   r.readRenderTargetPixels(rt,Math.round((q.x*.5+.5)*rt.width),Math.round((q.y*.5+.5)*rt.height),1,1,a);return Array.from(a).slice(0,3);});
  const Frame=(shadows,bypass)=>{g.post.preset.flareShadows=shadows;b.bypass=bypass;g.StepFrames(3,0,true);return Read();};
  const clear=Frame(false,false),batched=Frame(true,false),independent=Frame(true,true),batchedAgain=Frame(true,false);
  const roofMember=!!b.records.get(roof)?.group;
  const warmPrograms=DepthPrograms();
  for(let i=0;i<12;i++)g.StepFrames(1,0,true);
  const latePrograms=DepthPrograms();
  const Y=rgb=>rgb.map(T.DataUtils.fromHalfFloat).reduce((sum,value)=>sum+value,0);
  const result={boot,joined,roofMember,clear,batched,independent,batchedAgain,clearY:clear.map(Y),shadowY:batched.map(Y),
   newDepthPrograms:warmPrograms.filter(key=>!beforePrograms.includes(key)),lateDepthPrograms:latePrograms.filter(key=>!warmPrograms.includes(key)),programCounts:[beforePrograms.length,warmPrograms.length,latePrograms.length],gl:gl.getError()};
  g.lights.RemoveFire(id);roof.removeFromParent();ground.removeFromParent();b.Update();mat.dispose();roof.geometry.dispose();ground.geometry.dispose();return result;
 });
 const CheckLegacy=legacy=>{
  assert.equal(legacy.boot.manual,false);assert.equal(legacy.boot.fullMissionWarm,false);
  assert.ok(legacy.boot.warm&&legacy.boot.warm.primed>0&&legacy.boot.members>0&&legacy.boot.warmedDepth>0,'Normal legacy boot must admit warmed static batches');
  assert.equal(legacy.boot.warm.proxyMeshes,legacy.boot.warm.renderedProxyMeshes);assert.ok(legacy.boot.warm.depthDraws>0,'Every declared proxy must have submitted actual native depth triangles');
  assert.equal(legacy.boot.warm.elapsedAfter,legacy.boot.warm.elapsedBefore);assert.equal(legacy.boot.warm.phaseTimeAfter,legacy.boot.warm.phaseTimeBefore);
  assert.equal(legacy.boot.warm.csmEnabledAfter,legacy.boot.warm.csmEnabledBefore);assert.equal(legacy.boot.warm.csmUserEnabledAfter,legacy.boot.warm.csmUserEnabledBefore);
  assert.equal(legacy.boot.warmProxyPresent,false);assert.ok(legacy.roofMember&&legacy.joined>0);
  assert.deepEqual(legacy.batched,legacy.independent,'Native PCF pixels must match independent casters exactly');assert.deepEqual(legacy.batchedAgain,legacy.independent);
  assert.ok(legacy.shadowY[0]<legacy.clearY[0]*.15,'The batched roof must actually block the flare');assert.ok(Math.abs(legacy.shadowY[1]/legacy.clearY[1]-1)<.02,'Unblocked light must remain');
  assert.deepEqual(legacy.newDepthPrograms,[],'First real flare cannot compile missing batch depth variants');assert.deepEqual(legacy.lateDepthPrograms,[]);assert.equal(legacy.gl,0);
 };
 // No manual/shot/warm override: this is the actual legacy chapter boot route.
 const inactiveOnly=process.argv.includes('--inactive-only'),fullOnly=process.argv.includes('--full-mission-only');
 let legacy=null,inactive=null;
 if(!fullOnly){
  if(inactiveOnly)await page.addInitScript(()=>localStorage.setItem('tengxian1938_graphics_v1',JSON.stringify({shadows:false})));
  await Open('phase=4');
  if(!inactiveOnly){
   legacy=await ReadLegacy();CheckLegacy(legacy);console.log('legacy boot/native shadow batch passed',JSON.stringify(legacy));
   await page.evaluate(()=>localStorage.setItem('tengxian1938_graphics_v1',JSON.stringify({shadows:false})));
   await Open('phase=4');
  }
  inactive=await ReadLegacy();CheckLegacy(inactive);
  assert.equal(inactive.boot.warm.csmUserEnabledBefore,false);assert.equal(inactive.boot.warm.temporaryShadow,true);
  assert.deepEqual(inactive.boot.warm.csmMapsAfter,inactive.boot.warm.csmMapsBefore,'Inactive CSM targets must retain their original identities');
  assert.ok(inactive.boot.warm.temporaryTextureHandles>0&&inactive.boot.warm.temporaryTexturesReleased,'Temporary native textures must actually be deleted');
  console.log('inactive solar-shadow boot passed',JSON.stringify(inactive));
  await page.evaluate(()=>localStorage.removeItem('tengxian1938_graphics_v1'));
 }
 let firstLevel=null;
 if(fullOnly||!process.argv.includes('--legacy-only')&&!inactiveOnly){
  await Open('whitebox=p012&missionStage=4');
  firstLevel=await page.evaluate(()=>{const g=Tengxian;return {manual:g.state.manualStep,legacyWarm:!!g.state.shadowBatchWarm,fullWarmPrimed:g.state.levelWarm?.shadowBatchPrimed,
   members:g.shadowCasterBatch.stats.members,warmedDepth:g.shadowCasterBatch.warmedDepth.size,proxyPresent:!!g.scene.getObjectByName('ShadowBatchBootWarmProxy'),gl:g.renderer.getContext().getError()};});
  assert.equal(firstLevel.manual,false);assert.equal(firstLevel.legacyWarm,false);assert.ok(firstLevel.fullWarmPrimed>0&&firstLevel.members>0&&firstLevel.warmedDepth>0,'Existing fullMission WarmLevel must still own its boot');assert.equal(firstLevel.proxyPresent,false);assert.equal(firstLevel.gl,0);
 }
 const reportFile=inactiveOnly?'Data_InactiveReport.json':fullOnly?'Data_FullMissionReport.json':'Data_Report.json';
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,reportFile),JSON.stringify({legacy,inactive,firstLevel,errors},null,2));console.log('ShadowBatchWarmBrowserTest passed',JSON.stringify({legacy:legacy?.boot,inactive:inactive?.boot,firstLevel}));
}finally{await browser.close();server.close();}
