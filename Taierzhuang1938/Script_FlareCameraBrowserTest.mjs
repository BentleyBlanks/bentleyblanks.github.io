// Regress the user's default path, without forcing a follow camera in the test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareCamera');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],reports=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,400));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 const Open=async(query)=>{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&manual=1&menu=0&audio=0&${query}`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:240000});
 };
 const Visible=async(name,{time=6,muzzle=false,mode='observer'}={})=>{
  const result=await page.evaluate(async({time,muzzle})=>{
   const T=await import('three'),{FLARE_ART:A}=await import('./Data_Tuning_FlareEffects.mjs'),g=Tengxian,e=g.ParticleEditor;e.Seek(time);g.post.SetTaaEnabled(false);g.StepFrames(3,0,true);
   const f=e.flarePreview.flares[0],v=[...g.vfx.flareVisuals.items][0],point=muzzle?new T.Vector3(f.from.x,f.groundY+A.launchHeight,f.from.z):new T.Vector3(f.pos.x,f.pos.y,f.pos.z),ndc=point.clone().project(g.camera);
   const canvas=g.renderer.domElement.getBoundingClientRect(),panel=e.panel.root.getBoundingClientRect(),bar=document.querySelector('.edMenuBar').getBoundingClientRect();
   const pixel={x:canvas.left+(ndc.x*.5+.5)*canvas.width,y:canvas.top+(.5-ndc.y*.5)*canvas.height};
   const gl=g.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
   const x=Math.max(0,Math.min(w-96,Math.round((ndc.x*.5+.5)*w)-48)),y=Math.max(0,Math.min(h-96,Math.round((ndc.y*.5+.5)*h)-48));
   const frame=g.post.frame;
   const Read=()=>{g.post.frame=frame;g.StepFrames(3,0,true);const a=new Uint8Array(96*96*4);gl.readPixels(x,y,96,96,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
   const on=Read();v.root.visible=false;const off=Read();v.root.visible=true;const again=Read();
   // Stable frame noise plus on/off/on rejects monotonic exposure adaptation.
   let pixels=0;for(let i=0;i<on.length;i+=4){const a=on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2],b=again[i]+again[i+1]+again[i+2]-off[i]-off[i+1]-off[i+2];if(muzzle?a>12&&b>12:Math.abs(a)>12&&Math.abs(b)>12&&a*b>0)pixels++;}
   return {effect:e.effectId,time,muzzle,mode:e.flareCamera,selected:document.querySelector('select[data-flare-camera]').value,eyeHeight:g.camera.position.y,
    far:g.camera.far,depth:-point.applyMatrix4(g.camera.matrixWorldInverse).z,ndc:ndc.toArray(),pixels,pixel,panelLeft:panel.left,canvasWidth:canvas.width,
    unobscured:pixel.x>canvas.left+48&&pixel.x<panel.left-48&&pixel.y>bar.bottom+48&&pixel.y<canvas.bottom-48,gl:gl.getError()};
  },{time,muzzle});
  assert.equal(result.mode,mode);assert.equal(result.selected,mode);assert.ok(Math.abs(result.eyeHeight-(mode==='flight'?110:1.7))<1e-6);
  assert.ok(result.depth>0&&result.depth<result.far&&Math.abs(result.ndc[0])<1&&Math.abs(result.ndc[1])<1,JSON.stringify(result));
  // A metre-scale source at ~100 m is a bright point, unlike the former 9 m
  // tracking close-up. Require an actual multi-pixel source, plus unobscured
  // framing and a fixed eye height; the close-up retains its separate checks.
  assert.ok(result.unobscured&&result.pixels>=4,'The selected camera must show a visible, unobscured point source: '+JSON.stringify(result));assert.equal(result.gl,0);
  const bytes=await page.screenshot();await fs.writeFile(path.join(out,name+'.png'),bytes);
  await sharp(bytes).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toFile(path.join(out,name+'Preview.jpg'));
  reports.push({name,...result});console.log('ok',name,JSON.stringify(result));
 };
 await Open('quality=high');
 for(const [id,label]of [['SignalRed','红色信号弹'],['Illumination','白光伞降照明弹']]){
  await page.getByText(label,{exact:true}).click();await Visible('Selected'+id);
 }
 // Inherit a deliberately short map camera through the normal close/open path.
 await page.evaluate(()=>{const g=Tengxian;g.editor.Close();g.camera.far=60;g.camera.updateProjectionMatrix();g.editor.Open('vfx');g.ParticleEditor.SelectEffect('Illumination');});
 await page.locator('select[data-flare-camera]').selectOption('flight');
 const overview=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,e=g.ParticleEditor,result=[];
  for(const t of [.2,2,4.5,6,20,40]){e.Seek(t);g.StepFrames(2,0,true);const f=e.flarePreview.flares[0],p=new T.Vector3(f.pos.x,f.pos.y,f.pos.z);result.push({t,far:g.camera.far,depth:-p.clone().applyMatrix4(g.camera.matrixWorldInverse).z,ndc:p.project(g.camera).toArray()});}
  return result;
 });
 assert.ok(overview.every(p=>p.depth>0&&p.depth<p.far&&Math.abs(p.ndc[0])<1&&Math.abs(p.ndc[1])<1),JSON.stringify(overview));
 await page.locator('select[data-flare-camera]').selectOption('observer');
 const observer=await page.evaluate(async()=>{const T=await import('three'),g=Tengxian,e=g.ParticleEditor;e.Seek(6);g.StepFrames(3,0,true);const f=e.flarePreview.flares[0],p=new T.Vector3(f.pos.x,f.pos.y,f.pos.z).project(g.camera);return {height:g.camera.position.y,fov:g.camera.fov,ndc:p.toArray(),studioFov:e.savedStudioFov,gameFov:e.studio.saved.fov};});
 assert.ok(Math.abs(observer.height-1.7)<1e-6&&observer.fov===70&&Math.abs(observer.ndc[0])<.8&&Math.abs(observer.ndc[1])<.8,'Human-height observer must show the overhead flare: '+JSON.stringify(observer));
 const restored=await page.evaluate(()=>{const g=Tengxian;g.ParticleEditor.SelectEffect('FireMedium');const ordinary=g.camera.far,ordinaryFov=g.camera.fov;g.editor.Close();return {ordinary,exit:g.camera.far,ordinaryFov,exitFov:g.camera.fov};});
 assert.deepEqual({ordinary:restored.ordinary,exit:restored.exit},{ordinary:60,exit:60});
 assert.equal(restored.ordinaryFov,observer.studioFov);assert.equal(restored.exitFov,observer.gameFov);
 // Keep the user's low close-up orbit through descent, but never put the eye
 // below the floor. Check the actual folded cloth against on/off/on pixels,
 // then seek back aloft to prove the requested orbit was not overwritten.
 await Open('quality=high&effect=Illumination');
 await page.locator('select[data-flare-camera]').selectOption('follow');
 const follow=await page.evaluate(async()=>{
  const T=await import('three'),{FLARE_PREVIEW:A}=await import('./Data_Tuning_FlareEffects.mjs'),{SampleFlarePosition}=await import('./Script_Flare.mjs');
  const g=Tengxian,e=g.ParticleEditor,gl=g.renderer.getContext();
  e.SetPreviewEnvironment('day');e.Seek(6);g.post.SetTaaEnabled(false);g.StepFrames(3,0,true);
  const orbit=e.studio.orbit,start={pitch:orbit.pitch,yaw:orbit.yaw,dist:orbit.dist,position:g.camera.position.toArray()};
  const landingT=e.flarePreview.flares[0].landing.t,samples=[];let image=null;
  for(const t of [6,landingT-8,landingT-2,landingT-.25,landingT+.5,landingT+2]){
   e.Seek(t);g.StepFrames(3,0,true);
   const f=e.flarePreview.flares[0],v=[...g.vfx.flareVisuals.items][0],floor=e.flarePreview.Ground(g.camera.position.x,g.camera.position.z);
   const source=SampleFlarePosition(f,t),rawEye=orbit.target.y+Math.sin(orbit.pitch)*orbit.dist;
   const sample={t,landed:f.landed,eye:g.camera.position.y,floor,minimumEye:floor+A.observerEyeM,rawEye,
    requestedPitch:orbit.pitch,sourceError:Math.hypot(f.pos.x-source.x,f.pos.y-source.y,f.pos.z-source.z),canopyVisible:v.canopy.visible,clothPixels:null};
   if(f.landed){
    const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,box=new T.Box3().setFromObject(v.cloth);
    let minX=w,maxX=0,minY=h,maxY=0;
    for(let corner=0;corner<8;corner++){
     const point=new T.Vector3(corner&1?box.max.x:box.min.x,corner&2?box.max.y:box.min.y,corner&4?box.max.z:box.min.z).project(g.camera);
     const px=(point.x*.5+.5)*w,py=(point.y*.5+.5)*h;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    }
    const x=Math.max(0,Math.floor(minX)-8),y=Math.max(0,Math.floor(minY)-8),rw=Math.min(w,Math.ceil(maxX)+8)-x,rh=Math.min(h,Math.ceil(maxY)+8)-y;
    const frame=g.post.frame,Read=()=>{g.post.frame=frame;g.StepFrames(3,0,true);const pixels=new Uint8Array(rw*rh*4);gl.readPixels(x,y,rw,rh,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const on=Read();v.cloth.visible=false;const off=Read();v.cloth.visible=true;const again=Read();let count=0,maxDelta=0;
    for(let i=0;i<on.length;i+=4){
     const a=on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2],b=again[i]+again[i+1]+again[i+2]-off[i]-off[i+1]-off[i+2];
     if(Math.abs(a)>12&&Math.abs(b)>12&&a*b>0)count++;maxDelta=Math.max(maxDelta,Math.abs(a));
    }
    sample.clothPixels=count;sample.maxDelta=maxDelta;sample.roi=[x,y,rw,rh];
    if(!image)image=g.renderer.domElement.toDataURL('image/png');
   }
   samples.push(sample);
  }
  e.Seek(6);g.StepFrames(3,0,true);
  return {start,landingT,samples,restored:g.camera.position.toArray(),orbit:{pitch:orbit.pitch,yaw:orbit.yaw,dist:orbit.dist},environment:e.previewEnvironment,image,gl:gl.getError()};
 });
 assert.equal(follow.environment,'day');assert.ok(follow.start.pitch<0,'Regression must exercise the low orbit which previously went underground');
 assert.ok(follow.samples.every(p=>p.eye>=p.minimumEye-1e-6&&Math.abs(p.eye-Math.max(p.rawEye,p.minimumEye))<1e-6&&p.requestedPitch===follow.start.pitch&&p.sourceError<1e-7),'Follow camera stays above the sampled preview floor without moving the flare or changing requested pitch: '+JSON.stringify(follow.samples));
 assert.ok(follow.samples.some(p=>p.rawEye<p.minimumEye)&&follow.samples.some(p=>p.rawEye>p.minimumEye),'Descent must exercise both the original airborne orbit and its floor clamp');
 assert.ok(follow.samples.filter(p=>p.landed).length===2&&follow.samples.filter(p=>p.landed).every(p=>p.canopyVisible&&p.clothPixels>=12),'Actual folded daytime canopy must remain visibly rendered after landing: '+JSON.stringify(follow.samples));
 assert.deepEqual(follow.orbit,{pitch:follow.start.pitch,yaw:follow.start.yaw,dist:follow.start.dist});
 assert.ok(follow.restored.every((v,i)=>Math.abs(v-follow.start.position[i])<1e-8),'Seeking back aloft restores the same close-up camera pose');assert.equal(follow.gl,0);
 const landingBytes=Buffer.from(follow.image.split(',')[1],'base64');delete follow.image;
 await fs.writeFile(path.join(out,'FollowDayLanding.png'),landingBytes);
 await sharp(landingBytes).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toFile(path.join(out,'FollowDayLandingPreview.jpg'));
 console.log('ok FollowDayLanding',JSON.stringify(follow));
 // The white launch is90m to the left in world space. Its brief muzzle flash
 // used to fall behind the right inspector even though the6s star was visible.
 // Check actual on/off/on pixels at both ends of the launch-to-apex range, then
 // verify fixed eye and an ordinary symmetric projection through the flight.
 const defaultFraming=[];
 for(const width of [1280,1024]){
  await page.setViewportSize({width,height:720});await Open('quality=high&effect=Illumination');
  for(const mode of ['observer','flight']){
   if(mode==='flight')await page.locator('select[data-flare-camera]').selectOption('flight');
   const label=mode==='observer'?'Observer':'Flight';
   await Visible(label+'WhiteMuzzle'+width,{time:.03,muzzle:true,mode});
   await Visible(label+'WhiteApex'+width,{mode});
   if(mode==='flight')await Visible(label+'WhiteLate'+width,{time:20,mode});
   const framing=await page.evaluate(async()=>{
   const T=await import('three'),{SampleFlarePosition}=await import('./Script_Flare.mjs'),g=Tengxian,e=g.ParticleEditor;
   const f=e.flarePreview.flares[0],canvas=g.renderer.domElement.getBoundingClientRect(),panel=e.panel.root.getBoundingClientRect(),bar=document.querySelector('.edMenuBar').getBoundingClientRect();
   const eye=g.camera.position.toArray(),path=[],poses=[];
   for(let i=0;i<=192;i++){
    const t=f.landing.t*i/192,p=SampleFlarePosition(f,t),q=new T.Vector3(p.x,p.y,p.z).project(g.camera);
    path.push({t,x:canvas.left+(q.x*.5+.5)*canvas.width,y:canvas.top+(.5-q.y*.5)*canvas.height,depth:-new T.Vector3(p.x,p.y,p.z).applyMatrix4(g.camera.matrixWorldInverse).z});
   }
   for(const t of [.03,.2,2,4.5,6,25,47]){e.Seek(t);g.StepFrames(2,0,true);poses.push({t,eye:g.camera.position.toArray()});}
   return {mode:e.flareCamera,width:canvas.width,height:canvas.height,eye,horizontalDistance:-eye[2],path,poses,
    uncovered:{left:canvas.left,right:panel.left,top:bar.bottom,bottom:canvas.bottom},
    viewOffset:!!g.camera.view?.enabled,projectionCenter:[g.camera.projectionMatrix.elements[8],g.camera.projectionMatrix.elements[9]],gl:g.renderer.getContext().getError()};
   });
   assert.ok(framing.path.every(p=>p.x>framing.uncovered.left+48&&p.x<framing.uncovered.right-48&&p.y>framing.uncovered.top+48&&p.y<framing.uncovered.bottom-48&&p.depth>0),'The entire main white trajectory must fit outside the inspector: '+JSON.stringify(framing));
   assert.ok(framing.poses.every(p=>p.eye.every((v,i)=>Math.abs(v-framing.eye[i])<1e-8)),'Fitted eye must stay fixed while seeking across the flight');
   assert.ok(Math.abs(framing.eye[1]-(mode==='flight'?110:1.7))<1e-8&&!framing.viewOffset&&framing.projectionCenter.every(v=>Math.abs(v)<1e-9),'Fit with a physical fixed eye and symmetric projection');
   assert.equal(framing.gl,0);defaultFraming.push(framing);
   console.log('ok '+label+'WholePath'+width,JSON.stringify({eye:framing.eye,horizontalDistance:framing.horizontalDistance,panelLeft:framing.uncovered.right,minX:Math.min(...framing.path.map(p=>p.x)),maxX:Math.max(...framing.path.map(p=>p.x))}));
  }
 }
 const groundObservers=defaultFraming.filter(f=>f.mode==='observer');
 assert.ok(Math.abs(groundObservers[0].horizontalDistance-95)<1e-6&&groundObservers[1].horizontalDistance>95,'Only the narrower desktop needs a longer observation distance');
 await page.setViewportSize({width:1280,height:720});
 await Open('quality=high&effect=SignalRed');await Visible('DirectSignalRed');
 const fixed=await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor,poses=[];for(const t of [.2,2,4.5,7]){e.Seek(t);g.StepFrames(2,0,true);poses.push(g.camera.position.toArray());}return poses;});
 assert.ok(fixed.every(p=>p.every((v,i)=>Math.abs(v-fixed[0][i])<1e-8)),'Default observation must preserve the carrier flight instead of tracking it');
 await Open('quality=whitebox&effect=Illumination');await Visible('DirectIlluminationWhitebox');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'Data_CameraReport.json'),JSON.stringify({reports,overview,observer,restored,follow,defaultFraming,errors},null,2));
 console.log('FlareCameraBrowserTest passed');
}finally{await browser.close();server.close();}
