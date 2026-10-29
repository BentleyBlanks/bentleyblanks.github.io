// Actual production shaders at fixed optics: combustion shape through its
// lifecycle, an obstructed editor launch, and another flare lighting cold smoke.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareLifecycle');
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text().slice(0,500));});
 await page.addInitScript(()=>{
  localStorage.setItem('tengxian1938_audio_v1','{"master":0}');
  localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=Illumination&quality=high&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const report=await page.evaluate(async()=>{
  const T=await import('three'),{FLARE_ART:A}=await import('./Data_Tuning_FlareEffects.mjs');
  const g=Tengxian,e=g.ParticleEditor,r=g.renderer,gl=r.getContext(),images=[];
  const target=new T.WebGLRenderTarget(512,512,{type:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.NearestFilter,magFilter:T.NearestFilter});
  target.texture.colorSpace=T.LinearSRGBColorSpace;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.05,40);
  camera.position.set(0,0,3);camera.lookAt(0,0,0);
  const previousTarget=r.getRenderTarget(),previousColor=r.getClearColor(new T.Color()),previousAlpha=r.getClearAlpha(),previousTone=r.toneMapping;
  const Read=(mesh,{preview=false}={})=>{
   r.setRenderTarget(target);r.setClearColor(0,0);r.toneMapping=T.NoToneMapping;r.clear();r.render(scene,camera);
   const data=new Uint16Array(target.width*target.height*4);r.readRenderTargetPixels(target,0,0,target.width,target.height,data);
   let support=0,brightSupport=0,sum=0,peak=0,finite=true;const rgb=[0,0,0];
   for(let i=0;i<data.length;i+=4){
    const red=T.DataUtils.fromHalfFloat(data[i]),green=T.DataUtils.fromHalfFloat(data[i+1]),blue=T.DataUtils.fromHalfFloat(data[i+2]);
    const y=red*.2126+green*.7152+blue*.0722;
    finite&&=Number.isFinite(y);sum+=y;rgb[0]+=red;rgb[1]+=green;rgb[2]+=blue;peak=Math.max(peak,red,green,blue);
    if(y>1)support++;if(y>100)brightSupport++;
   }
   const result={support,brightSupport,sum,peak,rgb,finite};
   if(preview){
    const canvas=document.createElement('canvas');canvas.width=target.width;canvas.height=target.height;
    const context=canvas.getContext('2d'),image=context.createImageData(target.width,target.height);
    for(let y=0;y<target.height;y++)for(let x=0;x<target.width;x++){
     const from=((target.height-y-1)*target.width+x)*4,to=(y*target.width+x)*4;
     for(let c=0;c<3;c++){const v=Math.max(0,T.DataUtils.fromHalfFloat(data[from+c]));image.data[to+c]=Math.round(255*Math.pow(v/(1+v),1/2.2));}
     image.data[to+3]=255;
    }context.putImageData(image,0,0);result.preview=canvas.toDataURL('image/png').split(',')[1];
   }
   return result;
  };
  const WithMesh=(mesh,callback)=>{scene.add(mesh);try{return callback(mesh);}finally{mesh.removeFromParent();mesh.dispose();}};
  const ShapeAt=(effect,time,label)=>{
   e.Seek(time);const f=e.flarePreview.flares[0],visual=[...g.vfx.flareVisuals.items][0],mesh=visual.head.clone();
   // Translate the source to the same origin at every age. Neither distance,
   // camera tracking, exposure, bloom nor scene geometry can change its area.
   mesh.position.set(-f.pos.x,-f.pos.y,-f.pos.z);mesh.updateMatrixWorld(true);
   const stats=WithMesh(mesh,()=>Read(mesh,{preview:!!label}));
   if(label){images.push({name:effect+'_'+label,png:stats.preview});delete stats.preview;}
   return {time,phase:f.phase,intensity:f.intensity,...stats};
  };
  const shapes=[];
  let blocked,neighbor,launches;
  try{
   for(const effect of ['Illumination','SignalRed']){
    e.SelectEffect(effect);e.SetPreviewEnvironment('night');
    const f=e.flarePreview.flares[0],ignitedAt=f.ignitedAt,igniteS=f.igniteS,fadeAt=f.fadeAt,fadeS=f.fadeS,outAt=f.outAt;
    const early=ShapeAt(effect,ignitedAt+igniteS*.15,'Ignition');
    const steady=ShapeAt(effect,ignitedAt+igniteS+1,'Steady');
    const late=ShapeAt(effect,fadeAt+fadeS*.9,'Burnout');
    const beforeOut=ShapeAt(effect,outAt-.0001),afterOut=ShapeAt(effect,outAt+.0001);
    const ember=ShapeAt(effect,outAt+.05,'Residual'),cold=ShapeAt(effect,outAt+.3);
    shapes.push({effect,early,steady,late,beforeOut,afterOut,ember,cold});
   }
   // Keep the camera at the muzzle, rather than following the unlit carrier.
   // The same two-instance head must show a short birth-position flash and
   // then become entirely dark while the white carrier is still ascending.
   e.SelectEffect('Illumination');e.SetPreviewEnvironment('night');
   const LaunchAt=time=>{
    e.Seek(time);const flare=e.flarePreview.flares[0],visual=[...g.vfx.flareVisuals.items][0],clone=visual.head.clone(),matrix=new T.Matrix4();
    visual.head.getMatrixAt(1,matrix);
    clone.position.set(-flare.from.x,-flare.groundY-A.launchHeight,-flare.from.z);clone.updateMatrixWorld(true);
    const stats=WithMesh(clone,()=>Read(clone));
    return {time:flare.t,phase:flare.phase,intensity:flare.intensity,birth:[flare.from.x,flare.groundY+A.launchHeight,flare.from.z],
     instancePosition:new T.Vector3().setFromMatrixPosition(matrix).toArray(),instances:visual.head.count,...stats};
   };
   launches={initial:LaunchAt(.03),darkAscent:LaunchAt(.2),raster:[]};
   const sourceFar=camera.far;camera.far=500;camera.updateProjectionMatrix();
   // The real launch jet is narrower than one pixel in a full-flight view.
   // Move the sampling phase over a pixel without changing physical cards or
   // radiance; inverse-square-corrected mean energy must match a resolved jet.
   for(const effect of ['Illumination','SignalRed']){
    e.SelectEffect(effect);e.SetPreviewEnvironment('night');e.Seek(.03);
    const flare=e.flarePreview.flares[0],visual=[...g.vfx.flareVisuals.items][0],clone=visual.head.clone();
    clone.position.set(-flare.from.x,-flare.groundY-A.launchHeight,-flare.from.z);clone.updateMatrixWorld(true);
    const physical=Array.from(clone.instanceMatrix.array),profiles=[];
    WithMesh(clone,()=>{
     for(const distance of [3,100,130,200]){
      camera.position.set(0,0,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
      const rows=[];
      for(let phase=0;phase<32;phase++){
       camera.updateProjectionMatrix();camera.projectionMatrix.elements[8]+=2*((phase%8+.5)/8-.5)/target.width;
       camera.projectionMatrix.elements[9]+=2*((Math.floor(phase/8)+.5)/4-.5)/target.height;
       r.setRenderTarget(target);r.setClearColor(0,0);r.toneMapping=T.NoToneMapping;r.clear();r.render(scene,camera);
       const pixels=new Uint16Array(64*64*4);r.readRenderTargetPixels(target,224,224,64,64,pixels);
       let sum=0,peak=0,support=0;
       for(let i=0;i<pixels.length;i+=4){const red=T.DataUtils.fromHalfFloat(pixels[i]),green=T.DataUtils.fromHalfFloat(pixels[i+1]),blue=T.DataUtils.fromHalfFloat(pixels[i+2]);const y=red*.2126+green*.7152+blue*.0722;sum+=y;peak=Math.max(peak,red,green,blue);if(y>.00001)support++;}
       rows.push({phase,sum,peak,support});
      }
      const mean=rows.reduce((s,row)=>s+row.sum,0)/rows.length;
      profiles.push({distance,mean,correctedEnergy:mean*distance*distance,blankFrames:rows.filter(row=>row.sum<=.00001).length,rows});
     }
    });
    const reference=profiles[0].correctedEnergy;
    for(const profile of profiles)profile.referenceRatio=profile.correctedEnergy/reference;
    launches.raster.push({effect,profiles,unchangedPhysicalMatrices:physical.every((value,i)=>value===clone.instanceMatrix.array[i])});
   }
   camera.far=sourceFar;camera.position.set(0,0,3);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
   e.SelectEffect('Illumination');e.SetPreviewEnvironment('night');e.Play();e.flarePreview.Reset();e.previewTime=0;
   e.flarePreview.LaunchFlare({preset:'Illumination',from:{x:24,z:0},at:{x:24,z:0},driftMS:0,opticalMotion:false});
   e.Advance(.03);
   const blockedFlare=e.flarePreview.flares[0],blockedVisual=[...g.vfx.flareVisuals.items][0],launchMesh=blockedVisual.head.clone();
   launchMesh.position.set(-blockedFlare.from.x,-blockedFlare.groundY-A.launchHeight,-blockedFlare.from.z);launchMesh.updateMatrixWorld(true);
   const initialFlash=WithMesh(launchMesh,()=>Read(launchMesh)),initialLamp=g.lights.fireSources.get(blockedFlare.lightHandle)?.currentIntensity;
   // Advance real displayed frames, not a 4.97-second shutter exposure that
   // would legitimately integrate the original launch flash into this sample.
   while(blockedFlare.t<5-1e-8)e.Advance(Math.min(1/60,5-blockedFlare.t));e.paused=true;
   const f=e.flarePreview.flares[0],v=[...g.vfx.flareVisuals.items][0],ages=Array.from(v.smoke.geometry.attributes.age.array).filter(age=>age>=0);
   const mesh=v.head.clone();mesh.position.set(-f.pos.x,-f.pos.y,-f.pos.z);mesh.updateMatrixWorld(true);
   blocked={launchObstructed:f.launchObstructed,phase:f.phase,intensity:f.intensity,time:f.t,ignitedAt:f.ignitedAt,initialFlash,initialLamp,
    sparks:Array.from(v.sparks.geometry.attributes.age.array).filter(age=>age>=0).length,
    smokeBirths:ages.map(age=>f.t-age*A.smokeLife),head:WithMesh(mesh,()=>Read(mesh)),landing:f.landing};

   e.SelectEffect('Illumination');e.SetPreviewEnvironment('night');
   e.Seek(e.flarePreview.flares[0].outAt+.06);
   const a=e.flarePreview.flares[0],aVisual=[...g.vfx.flareVisuals.items][0];
   e.flarePreview.LaunchFlare({preset:'SignalRed',from:{x:a.pos.x-12,z:a.pos.z+1},at:{x:a.pos.x+.2,z:a.pos.z+1},apexM:a.pos.y-A.launchHeight,driftMS:0});
   const b=e.flarePreview.flares.find(f=>f!==a);b.t=b.ascendS;e.flarePreview.StepPhase(b);e.flarePreview.Place(b,0);e.flarePreview.StepLight(b);
   g.lights.Update(0,e.previewTime,g.camera.position);g.vfx.flareVisuals.Update(aVisual,a);
   const smoke=aVisual.smoke.clone();scene.add(smoke);
   camera.position.set(a.pos.x+6,a.pos.y+2,a.pos.z-6);camera.lookAt(a.pos.x,a.pos.y+2,a.pos.z);
   const geometry=Array.from(smoke.instanceMatrix.array),ageBytes=Array.from(smoke.geometry.attributes.age.array),ownLight=aVisual.smoke.material.uniforms.candle.value;
   const on=Read(smoke);
   g.lights.UpdateFire(b.lightHandle,{intensity:0});g.lights.Update(0,e.previewTime,g.camera.position);g.vfx.flareVisuals.Update(aVisual,a);
   const off=Read(smoke);
   e.flarePreview.StepLight(b);g.lights.Update(0,e.previewTime,g.camera.position);g.vfx.flareVisuals.Update(aVisual,a);
   const again=Read(smoke);
   const sameGeometry=geometry.every((value,i)=>value===smoke.instanceMatrix.array[i])&&ageBytes.every((value,i)=>value===smoke.geometry.attributes.age.array[i]);
   neighbor={ownIntensity:a.intensity,ownLightHandle:a.lightHandle,ownSmokeLight:ownLight,otherIntensity:b.intensity,
    distance:Math.hypot(a.pos.x-b.pos.x,a.pos.y-b.pos.y,a.pos.z-b.pos.z),liveSmoke:ageBytes.filter(age=>age>=0).length,
    sameGeometry,on,off,again};
   smoke.removeFromParent();smoke.dispose();
  }finally{
   r.setRenderTarget(previousTarget);r.setClearColor(previousColor,previousAlpha);r.toneMapping=previousTone;target.dispose();scene.clear();
  }
  return {shapes,launches,blocked,neighbor,images,gl:gl.getError()};
 });
 const images=report.images;delete report.images;
 await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify({...report,errors},null,2));
 for(const item of images)await fs.writeFile(path.join(out,item.name+'.png'),Buffer.from(item.png,'base64'));
 const cells=[];
 for(let i=0;i<images.length;i++){
  const thumb=await sharp(Buffer.from(images[i].png,'base64')).resize(160,160).png().toBuffer();
  cells.push({input:thumb,left:(i%4)*160,top:Math.floor(i/4)*184});
  const label=Buffer.from(`<svg width="160" height="24"><text x="4" y="17" fill="white" font-size="11">${images[i].name}</text></svg>`);
  cells.push({input:label,left:(i%4)*160,top:Math.floor(i/4)*184+160});
 }
 await sharp({create:{width:640,height:368,channels:3,background:'#000'}}).composite(cells).jpeg({quality:83}).toFile(path.join(out,'LifecyclePreview.jpg'));
 for(const shape of report.shapes){
  for(const stats of Object.values(shape).filter(value=>value&&typeof value==='object'))assert.ok(stats.finite&&stats.peak<65504,'Finite HDR source samples: '+JSON.stringify(stats));
  assert.ok(shape.steady.support>shape.early.support*1.8,'Actual ignition pixels must grow beyond a dimmed fixed-size lamp: '+JSON.stringify(shape));
  assert.ok(shape.late.support<shape.steady.support*.65,'Actual burnout pixels must contract before extinction: '+JSON.stringify(shape));
  assert.ok(shape.beforeOut.sum>0&&shape.afterOut.sum>0&&Math.abs(shape.beforeOut.sum-shape.afterOut.sum)/Math.max(shape.beforeOut.sum,shape.afterOut.sum)<.06,'Residual GPU light must cross extinction continuously: '+JSON.stringify(shape));
  assert.ok(shape.ember.sum>0,'Short-lived hot remnant remains visible');assert.equal(shape.cold.sum,0,'Actual head pixels are zero after the residual cools');
 }
 assert.ok(report.launches.initial.finite&&report.launches.initial.sum>0&&report.launches.initial.peak<65504,'Actual GPU launch flash is visible at 0.03 seconds');
 assert.ok(report.launches.initial.instancePosition.every((value,i)=>Math.abs(value-report.launches.initial.birth[i])<1e-5),'The flash belongs to the birth position within float32 matrix precision, not the moving carrier');
 assert.equal(report.launches.initial.instances,2,'The launch and main emitter share the same instanced head');
 assert.ok(report.launches.initial.intensity===0&&report.launches.darkAscent.phase==='ascend'&&report.launches.darkAscent.intensity===0,'The launch flash never starts the white illuminating candle early');
 assert.equal(report.launches.darkAscent.sum,0,'Actual white head pixels are zero at 0.2 seconds after the launch flash');
 for(const sample of report.launches.raster){
  assert.ok(sample.unchangedPhysicalMatrices,'Pixel filtering must not enlarge the actual muzzle card');
  for(const profile of sample.profiles){
   assert.equal(profile.blankFrames,0,'A visible launch cannot disappear with subpixel phase: '+JSON.stringify({effect:sample.effect,...profile}));
   assert.ok(profile.referenceRatio>.97&&profile.referenceRatio<1.03,'Unresolved jet must conserve the resolved source energy: '+JSON.stringify({effect:sample.effect,distance:profile.distance,ratio:profile.referenceRatio}));
   assert.ok(profile.rows.every(row=>row.peak<65504&&Number.isFinite(row.sum)),'Launch filtering stays finite at every phase');
  }
 }
 assert.ok(report.blocked.launchObstructed&&report.blocked.phase==='spent'&&report.blocked.intensity===0,'Actual editor shelter obstructs deployment: '+JSON.stringify(report.blocked));
 assert.ok(report.blocked.initialFlash.sum>0&&report.blocked.initialLamp>0,'A genuinely emitted launch flash remains visible before the later roof obstruction');
 assert.equal(report.blocked.sparks,0);assert.equal(report.blocked.head.sum,0);
 assert.ok(report.blocked.smokeBirths.every(born=>born>=-.00001&&born<.16001),'Only original launch smoke may survive a blocked unignited carrier: '+JSON.stringify(report.blocked));
 const n=report.neighbor,red=n.on.rgb[0]-n.off.rgb[0],green=n.on.rgb[1]-n.off.rgb[1];
 assert.ok(n.ownIntensity===0&&n.ownLightHandle===null&&n.ownSmokeLight===0&&n.liveSmoke>0&&n.sameGeometry,'The same extinguished source smoke is the only rendered geometry: '+JSON.stringify(n));
 assert.ok(red>1&&red>green*5&&n.on.rgb[0]>n.off.rgb[0]*2&&n.on.sum>n.off.sum*1.1,'A neighboring actual red signal must visibly tint and illuminate the cold white-flare smoke on the GPU: '+JSON.stringify(n));
 assert.ok(Math.abs(n.on.sum-n.again.sum)<Math.max(.001,n.on.sum*.001),'Neighbor on/off/on is stable with the same geometry');
 assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 console.log('FlareLifecycleBrowserTest passed',JSON.stringify({
  shapes:report.shapes.map(s=>({effect:s.effect,support:[s.early.support,s.steady.support,s.late.support,s.cold.support],
   extinctionDifference:Math.abs(s.beforeOut.sum-s.afterOut.sum)/Math.max(s.beforeOut.sum,s.afterOut.sum)})),
  blocked:{phase:report.blocked.phase,sparks:report.blocked.sparks,smokeBirths:report.blocked.smokeBirths},
  launches:{initialEnergy:report.launches.initial.sum,darkAscentEnergy:report.launches.darkAscent.sum,blockedInitialEnergy:report.blocked.initialFlash.sum},
  neighbor:{redOn:n.on.rgb[0],redOff:n.off.rgb[0],redAgain:n.again.rgb[0],sameGeometry:n.sameGeometry},gl:report.gl}));
}finally{await browser.close();server.close();}
