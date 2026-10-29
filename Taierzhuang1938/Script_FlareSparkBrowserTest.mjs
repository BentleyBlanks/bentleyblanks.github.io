// Preserve unresolved physical sparks through rasterization and actual high Post.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareSpark');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,400));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=SignalRed&flareCamera=observer&quality=high&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const report=await page.evaluate(async()=>{
  const {FLARE_ART:A}=await import('./Data_Tuning_FlareEffects.mjs');
  const {SampleFlarePosition}=await import('./Script_Flare.mjs');
  const T=await import('three'),{TAA_JITTER}=await import('./Script_PostTaa.mjs'),g=Tengxian,e=g.ParticleEditor,r=g.renderer,gl=r.getContext();
  e.SelectEffect('SignalRed');e.SetPreviewEnvironment('night');e.flareCamera='observer';e.FrameEffect();e.Seek(.3);
  const v=[...g.vfx.flareVisuals.items][0],mesh=v.sparks.clone(),scene=new T.Scene();scene.add(mesh);
  const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,target=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType,format:T.RGBAFormat,minFilter:T.NearestFilter,magFilter:T.NearestFilter});target.texture.colorSpace=T.LinearSRGBColorSpace;
  const camera=new T.PerspectiveCamera(g.camera.fov,w/h,.05,500),point=new T.Vector3();
  const original={target:r.getRenderTarget(),color:r.getClearColor(new T.Color()),alpha:r.getClearAlpha(),tone:r.toneMapping,infoAuto:r.info.autoReset};
  const profiles=[];
  for(const distance of [100,130])for(const jitter of [false,true])profiles.push({distance,jitter,rows:[],totalEnergy:0,expectedEnergy:0,blankFrames:0,liveFrames:0,totalActive:0,totalCoveredPixels:0,projectedSizes:[]});
  try{
   r.setRenderTarget(target);r.setClearColor(0,0);r.toneMapping=T.NoToneMapping;
   for(let frame=0;frame<=162;frame++){
    if(frame)e.Advance(1/60);
    const f=e.flarePreview.flares[0],source=[...g.vfx.flareVisuals.items][0].sparks;
    mesh.instanceMatrix.copy(source.instanceMatrix);mesh.instanceMatrix.needsUpdate=true;
    const matrices=source.instanceMatrix.array,ages=source.geometry.attributes.age.array;
    for(const profile of profiles){
     camera.position.set(f.pos.x,f.pos.y,f.pos.z+profile.distance);camera.lookAt(f.pos.x,f.pos.y,f.pos.z);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
     if(profile.jitter){const j=TAA_JITTER[frame%TAA_JITTER.length];camera.projectionMatrix.elements[8]+=2*j[0]/g.post.width;camera.projectionMatrix.elements[9]+=2*j[1]/g.post.height;}
     let minX=w,minY=h,maxX=0,maxY=0,active=0,expected=0,minSize=Infinity,maxSize=0;
     const before=Array.from(matrices),beforeAges=Array.from(ages);
     for(let i=0;i<ages.length;i++){
      if(ages[i]<0)continue;active++;
      const m=i*16,x=matrices[m+12],y=matrices[m+13],z=matrices[m+14];
      const sx=Math.hypot(matrices[m],matrices[m+1],matrices[m+2]),sy=Math.hypot(matrices[m+4],matrices[m+5],matrices[m+6]);
      const depth=profile.distance+f.pos.z-z,px=h*.5*camera.projectionMatrix.elements[5]*sx/depth,py=h*.5*camera.projectionMatrix.elements[5]*sy/depth;
      minSize=Math.min(minSize,px,py);maxSize=Math.max(maxSize,px,py);
      const heat=Math.pow(Math.max(0,1-ages[i]),1.8),green=.14+(.8-.14)*heat,blue=.01+(.35-.01)*heat;
      // Integral of the existing exp(-12*r²) card before point-sampling loss.
      const luma=.2126+.7152*green+.0722*blue;
      expected+=source.material.uniforms.power.value*heat*luma*px*py*Math.PI/48*(1-Math.exp(-12));
      for(const dx of [-.5,.5])for(const dy of [-.5,.5]){
       point.set(x+dx*Math.max(sx,depth*A.sparkRasterSupportRad),y+dy*Math.max(sy,depth*A.sparkRasterSupportRad),z).project(camera);const qx=(point.x*.5+.5)*w,qy=(point.y*.5+.5)*h;
       minX=Math.min(minX,qx);maxX=Math.max(maxX,qx);minY=Math.min(minY,qy);maxY=Math.max(maxY,qy);
      }
     }
     // Every rendered quad is inside this analytically projected box; read only
     // that ROI to avoid transferring the otherwise black full-size HDR target.
     const x=Math.max(0,Math.floor(minX)-2),y=Math.max(0,Math.floor(minY)-2),rw=Math.max(1,Math.min(w,Math.ceil(maxX)+2)-x),rh=Math.max(1,Math.min(h,Math.ceil(maxY)+2)-y);
     r.clear();r.info.autoReset=true;r.render(scene,camera);
     if(r.info.render.calls!==1)throw new Error("A spark source must remain one instanced draw");
     if(!before.every((value,i)=>value===matrices[i])||!beforeAges.every((value,i)=>value===ages[i]))throw new Error("Raster support cannot alter physical particles");
     const pixels=new Uint16Array(rw*rh*4);r.readRenderTargetPixels(target,x,y,rw,rh,pixels);
     let energy=0,covered=0,peak=0;for(let i=0;i<pixels.length;i+=4){const red=T.DataUtils.fromHalfFloat(pixels[i]),green=T.DataUtils.fromHalfFloat(pixels[i+1]),blue=T.DataUtils.fromHalfFloat(pixels[i+2]);const value=red*.2126+green*.7152+blue*.0722;energy+=value;if(value>0)covered++;peak=Math.max(peak,value);}
     profile.rows.push({t:f.t,active,covered,energy,expected,peak,minProjectedSizePx:minSize,maxProjectedSizePx:maxSize,roi:[x,y,rw,rh]});
     profile.totalEnergy+=energy;profile.expectedEnergy+=expected;profile.totalActive+=active;profile.totalCoveredPixels+=covered;
     if(active){profile.liveFrames++;if(!covered)profile.blankFrames++;}
     if(active)profile.projectedSizes.push(minSize,maxSize);
    }
   }
  }finally{r.setRenderTarget(original.target);r.setClearColor(original.color,original.alpha);r.toneMapping=original.tone;r.info.autoReset=original.infoAuto;target.dispose();mesh.removeFromParent();mesh.dispose();scene.clear();}
  for(const profile of profiles){profile.blankFraction=profile.blankFrames/profile.liveFrames;profile.meanActive=profile.totalActive/profile.rows.length;profile.energyFraction=profile.totalEnergy/profile.expectedEnergy;profile.projectedRangePx=[Math.min(...profile.projectedSizes),Math.max(...profile.projectedSizes)];delete profile.projectedSizes;}

  // Matched production-Post replay. Hide unrelated meshes and the lamp's
  // environment lighting; the actual SparkShader, default high TAA, bloom,
  // exposure and final composite remain in use. Two off replays measure noise.
  const epochs=[],defaultTaa=g.post.taaEnabled;
  for(const visible of [true,false,false]){
   e.Seek(.3);e.paused=true;e.flareCamera='observer';e.FrameEffect();
   g.scene.traverse(object=>{if(object.isMesh||object.isLine||object.isPoints||object.isSprite)object.visible=false;});
   g.scene.background=new T.Color(0);
   const flare=e.flarePreview.flares[0],sparks=[...g.vfx.flareVisuals.items][0].sparks;
   const move=e.flarePreview.host.MoveLight;e.flarePreview.host.MoveLight=(id,spec)=>move(id,{...spec,intensity:0});
   e.flarePreview.StepLight(flare);g.lights.Update(0,e.previewTime,g.camera.position);
   const base=g.camera.clone();base.updateProjectionMatrix();base.updateMatrixWorld(true);
   let minX=w,minY=h,maxX=0,maxY=0;
   for(let i=0;i<=180;i++){
    const p=SampleFlarePosition(flare,i/60);point.set(p.x,p.y,p.z).project(base);
    minX=Math.min(minX,(point.x*.5+.5)*w);maxX=Math.max(maxX,(point.x*.5+.5)*w);
    minY=Math.min(minY,(point.y*.5+.5)*h);maxY=Math.max(maxY,(point.y*.5+.5)*h);
   }
   const x=Math.max(0,Math.floor(minX)-48),y=Math.max(0,Math.floor(minY)-48),rw=Math.min(w,Math.ceil(maxX)+48)-x,rh=Math.min(h,Math.ceil(maxY)+48)-y;
   sparks.visible=false;g.post.frame=1000;g.post.exposurePass.RequestReset();g.post.NotifyCameraCut();
   g.StepFrames(32,1/60,true);
   const frames=[],signatures=[];
   for(let frame=0;frame<=162;frame++){
    if(frame)e.Advance(1/60);sparks.visible=visible;g.StepFrames(1,1/60,true);
    const data=new Uint8Array(rw*rh*4);gl.readPixels(x,y,rw,rh,gl.RGBA,gl.UNSIGNED_BYTE,data);frames.push(data);
    let hash=2166136261;for(const values of [sparks.instanceMatrix.array,sparks.geometry.attributes.age.array]){
     const bits=new Uint32Array(values.buffer,values.byteOffset,values.length);for(const value of bits)hash=Math.imul(hash^value,16777619);
    }signatures.push(hash>>>0);
   }
   e.flarePreview.host.MoveLight=move;epochs.push({visible,roi:[x,y,rw,rh],frames,signatures});
  }
  let signal=0,noise=0,positivePixels=0,negativePixels=0,visibleFrames=0,peak=0;
  const frames=[];
  for(let i=0;i<epochs[0].frames.length;i++){
   const on=epochs[0].frames[i],off=epochs[1].frames[i],control=epochs[2].frames[i];let changed=0,frameSignal=0,frameNoise=0;
   for(let p=0;p<on.length;p+=4){
    const d=(on[p]-off[p])*.2126+(on[p+1]-off[p+1])*.7152+(on[p+2]-off[p+2])*.0722;
    const n=(off[p]-control[p])*.2126+(off[p+1]-control[p+1])*.7152+(off[p+2]-control[p+2])*.0722;
    frameNoise+=Math.abs(n);frameSignal+=Math.max(0,d);peak=Math.max(peak,d);
    if(d>1){changed++;positivePixels++;}else if(d< -1)negativePixels++;
   }
   if(changed)visibleFrames++;signal+=frameSignal;noise+=frameNoise;frames.push({t:.3+i/60,changed,signal:frameSignal,noise:frameNoise});
  }
  const paired={defaultTaa,quality:g.GraphicsProfile.Inspect().profile,signal,noise,positivePixels,negativePixels,visibleFrames,frames:163,peak,
   matchingPhysics:epochs[0].signatures.every((value,i)=>value===epochs[1].signatures[i]&&value===epochs[2].signatures[i]),
   matchingRoi:JSON.stringify(epochs[0].roi)===JSON.stringify(epochs[1].roi)&&JSON.stringify(epochs[1].roi)===JSON.stringify(epochs[2].roi),roi:epochs[0].roi,series:frames};
  return {viewport:[w,h],internal:[g.post.width,g.post.height],fov:camera.fov,frames:163,fps:60,seed:e.seed,rangeS:[.3,3],profiles,paired,gl:gl.getError()};
 });
 await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify({report,errors},null,2));
 for(const profile of report.profiles){
  assert.ok(profile.liveFrames===163&&profile.meanActive>3,'Actual burning signal produces live hot particles');
  assert.ok(profile.blankFraction<.01,'Live subpixel particles cannot disappear between raster samples: '+JSON.stringify(profile));
  assert.ok(profile.energyFraction>.9&&profile.energyFraction<1.1,'Raster carrier must preserve the original physical Gaussian integral: '+JSON.stringify(profile));
  assert.ok(profile.projectedRangePx[1]<.1,'The particle remains physically unresolved, not enlarged in world space');
 }
 const p=report.paired;
 assert.ok(p.defaultTaa&&p.quality==='high'&&p.matchingPhysics&&p.matchingRoi,'High Post replay uses default TAA and identical physical trajectories/ROI');
 assert.ok(p.signal>p.noise*5+100&&p.positivePixels>200&&p.visibleFrames>p.frames*.8,'Actual final pixels retain the hot-particle trail beyond matched control noise: '+JSON.stringify(p));
 assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 console.log('FlareSparkBrowserTest passed',JSON.stringify({profiles:report.profiles.map(({rows,...summary})=>summary),paired:{...p,series:undefined},gl:report.gl}));
}finally{await browser.close();server.close();}
