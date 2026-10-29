// Actual post-TAA optical target, isolated from physical core clipping and bloom.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareGlare');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const reports=[];
 for(const quality of ['high','medium']){
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500)+' '+m.location().url);});
  await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=Illumination&flareCamera=observer&quality=${quality}&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
  const report=await page.evaluate(async quality=>{
   const T=await import('three'),g=Tengxian,e=g.ParticleEditor,p=g.post.lensFlarePass,gl=g.renderer.getContext();
   e.Seek(8);e.paused=true;e.flareCamera='observer';g.graphics.autoQuality=false;g.ApplyGraphics();
   const taaDefault=g.post.taaEnabled,sourcePoint=new T.Vector3(0,90,-100),o=e.studio.orbit;
   o.target.copy(sourcePoint);o.dist=Math.hypot(90-1.7,100);o.pitch=Math.atan2(1.7-90,100);o.yaw=0;e.studio.ApplyCamera();
   e.studio.grid.visible=false;p.SetUserScale(0,0);g.post.NotifyCameraCut();
   const d=e.flarePreview,originalPlace=d.Place,originalMove=d.host.MoveLight;
   let multiplier=1,constantCandela=null;
   // Freeze the carrier/physical emitter and its angular emission, retaining the
   // real director's combustion clock and the actual LightRig intensity.
   d.Place=f=>{f.pos.x=f.presetId==='SignalRed'?8:0;f.pos.y=90;f.pos.z=-100;f.agl=90;f.landed=false;};
   d.host.MoveLight=(id,spec)=>originalMove(id,{...spec,intensity:(constantCandela??spec.intensity)*multiplier,
    emission:{direction:{x:0,y:-1,z:0},floor:.7,power:1.2}});
   d.Update(0);g.lights.Update(0,e.previewTime,g.camera.position);g.StepFrames(8,0,true);
   const f=d.flares[0],v=f.visualHandle,rt=p.target;
   const projected=sourcePoint.clone().project(g.camera);
   const center={x:Math.floor((projected.x*.5+.5)*rt.width),y:Math.floor((projected.y*.5+.5)*rt.height)};
   const pixelAngle=2/(g.post.context.projScale.y*rt.height),offset=Math.max(2,Math.round(1.2*Math.PI/180/pixelAngle));
   const sample={x:center.x+offset,y:center.y};
   const Read=()=>{const a=new Uint16Array(4);g.renderer.readRenderTargetPixels(rt,sample.x,sample.y,1,1,a);const rgb=Array.from(a).slice(0,3).map(T.DataUtils.fromHalfFloat);return {rgb,y:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};};
   const State=()=>({active:p.active,emitter:p.emitterActive,executed:g.post.lastRenderedPasses.includes('lensFlare'),
    strength:p.strength,solarScale:p.uniforms.uLegacyScale.value,dirt:p.dirtStrength,taa:g.post.context.taaActive});
   const Frame=()=>{g.StepFrames(3,0,true);return Read();};
   const one=Frame(),initial=State(),lamp=g.lights.fireSources.get(f.lightHandle),intensityOne=lamp.currentIntensity;
   multiplier=2;const two=Frame(),intensityTwo=lamp.currentIntensity;multiplier=1;const repeat=Frame();
   const series=[];
   for(let i=0;i<240;i++){
    e.Advance(1/60);g.StepFrames(1,0,true);series.push({time:f.t,intensity:lamp.currentIntensity,halo:Read().y});
   }
   let finalLdr=null;
   if(quality==='high'){
    const originalMoveVisual=d.host.MoveVisual;
    d.host.MoveVisual=(handle,flare)=>{
     originalMoveVisual(handle,flare);
     handle.head.visible=true;handle.head.material.uniforms.power.value=0;
     handle.smoke.visible=false;handle.sparks.visible=false;
    };
    const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,
     screenCenter={x:(projected.x*.5+.5)*width,y:(projected.y*.5+.5)*height},size=32,
     startX=Math.floor(screenCenter.x)-size/2,startY=Math.floor(screenCenter.y)-size/2;
    const mask=[];for(let y=0;y<size;y++)for(let x=0;x<size;x++){
     const radius2=(startX+x+.5-screenCenter.x)**2+(startY+y+.5-screenCenter.y)**2;
     if(radius2>=8**2&&radius2<=14**2)mask.push((y*size+x)*4);
    }
    const ReadLdr=()=>{
     const pixels=new Uint8Array(size*size*4);gl.readPixels(startX,startY,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
     let sum=0,min=255,max=0;for(const i of mask){const y=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;sum+=y;min=Math.min(min,y);max=Math.max(max,y);}
     return {value:sum/mask.length,min,max};
    };
    const replays=[];
    try{
     for(const control of [false,true]){
      constantCandela=control?f.candleCd:null;f.t=8;e.previewTime=8;d.StepPhase(f);d.Place(f,0);d.StepLight(f);
      g.post.frame=2000;g.post.NotifyCameraCut();g.post.exposurePass.RequestReset();
      g.StepFrames(60,0,true);
      const rows=[];
      for(let i=0;i<240;i++){
       e.Advance(1/60);g.StepFrames(1,0,true);
       rows.push({time:f.t,frame:g.post.frame,intensity:lamp.currentIntensity,...ReadLdr()});
      }
      replays.push({control,rows,exposure:g.post.exposurePass.ReadState(g.renderer)});
     }
     finalLdr={size,maskPixels:mask.length,roi:[startX,startY,size,size],annulusPx:[8,14],replays,
      headVisible:v.head.visible,headPower:v.head.material.uniforms.power.value,smokeVisible:v.smoke.visible,sparksVisible:v.sparks.visible};
    }finally{constantCandela=null;d.host.MoveVisual=originalMoveVisual;d.StepLight(f);}
   }
   const visible=Frame();
   const block=new T.Mesh(new T.PlaneGeometry(.9,.9),new T.MeshBasicMaterial({color:0x101010}));
   block.name='FlareGlareSourceOccluder';block.position.lerpVectors(g.camera.position,sourcePoint,.55);block.quaternion.copy(g.camera.quaternion);e.studio.root.add(block);block.updateMatrixWorld();
   const blocked=[];for(let i=0;i<8;i++){g.StepFrames(1,0,true);blocked.push(Read().y);}
   const nd=g.post.prepassPass.target,depthPixel=new Uint16Array(4);
   g.renderer.readRenderTargetPixels(nd,Math.floor((sample.x+.5)/rt.width*nd.width),Math.floor((sample.y+.5)/rt.height*nd.height),1,1,depthPixel);
   const haloBackgroundDepth=T.DataUtils.fromHalfFloat(depthPixel[3]);
   block.removeFromParent();block.geometry.dispose();block.material.dispose();const uncovered=Frame();
   const OpticalCleared=()=>!p.emitterActive&&p.uniforms.uEmitterSource.value.every(s=>s.w===0)
    &&g.post.uniformsComposite.uFlareStrength.value===0&&g.post.uniformsComposite.uFlare.value===p.blackPixel;
   v.head.visible=false;g.StepFrames(4,0,true);const hiddenHead={cleared:OpticalCleared(),intensity:lamp.currentIntensity,emitterVisible:lamp.emitterVisible};
   v.head.visible=true;v.root.visible=false;g.StepFrames(4,0,true);const hiddenRoot={cleared:OpticalCleared(),intensity:lamp.currentIntensity,emitterVisible:lamp.emitterVisible};
   v.root.visible=true;g.StepFrames(4,0,true);const restored=State();
   const secondId=d.LaunchFlare({preset:'SignalRed',from:{x:0,z:0},at:{x:8,z:-100},driftMS:0});
   const second=d.flares.find(item=>item.id===secondId);second.t=4.5;d.StepPhase(second);d.Place(second,0);d.StepLight(second);g.lights.Update(0,e.previewTime,g.camera.position);g.StepFrames(4,0,true);
   const slots=p.uniforms.uEmitterSource.value.filter(s=>s.w>0).length,third=d.LaunchFlare({preset:'SignalRed',from:{x:0,z:0},at:{x:0,z:-100}});
   const secondPoint=new T.Vector3(8,90,-100).project(g.camera),secondPixel=new Uint16Array(4);
   g.renderer.readRenderTargetPixels(rt,Math.floor((secondPoint.x*.5+.5)*rt.width),Math.floor((secondPoint.y*.5+.5)*rt.height),1,1,secondPixel);
   const secondPeak=Math.max(...Array.from(secondPixel).slice(0,3).map(T.DataUtils.fromHalfFloat));
   const image=g.renderer.domElement.toDataURL('image/png');
   let samplers=0,linked=true,programs=0;
   for(const program of g.renderer.info.programs){
    const shader=gl.getAttachedShaders(program.program).map(s=>gl.getShaderSource(s)).join('\n');if(!shader.includes('uEmitterSource'))continue;
    programs++;linked&&=gl.getProgramParameter(program.program,gl.LINK_STATUS);let count=0;
    for(let i=0;i<gl.getProgramParameter(program.program,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(program.program,i);if([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_3D,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_2D_ARRAY,gl.INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_2D].includes(u.type))count+=u.size;}
    samplers=Math.max(samplers,count);
   }
   e.Stop();g.StepFrames(4,0,true);const stopped={cleared:OpticalCleared(),lights:g.lights.fireSources.size,visuals:g.vfx.flareVisuals.items.size,flares:d.flares.length};
   d.Place=originalPlace;d.host.MoveLight=originalMove;
   return {quality:g.GraphicsProfile.Inspect().profile,taaDefault,initial,one,two,repeat,intensityOne,intensityTwo,series,finalLdr,visible,blocked,haloBackgroundDepth,uncovered,hiddenHead,hiddenRoot,restored,slots,third,secondPeak,programs,linked,samplers,samplerLimit:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),stopped,gl:gl.getError(),sample,target:[rt.width,rt.height],image};
  },quality);
  const image=Buffer.from(report.image.split(',')[1],'base64');delete report.image;
  await sharp(image).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toFile(path.join(out,`${quality}Preview.jpg`));
  const Stats=a=>{const mean=a.reduce((s,v)=>s+v,0)/a.length;return {mean,rms:Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length)};};
  const input=report.series.map(s=>s.intensity),output=report.series.map(s=>s.halo),inputStats=Stats(input),outputStats=Stats(output);
  let covariance=0,inputVariance=0,outputVariance=0;for(let i=0;i<input.length;i++){const x=input[i]-inputStats.mean,y=output[i]-outputStats.mean;covariance+=x*y;inputVariance+=x*x;outputVariance+=y*y;}
  const correlation=covariance/Math.sqrt(inputVariance*outputVariance),gain=(outputStats.rms/outputStats.mean)/(inputStats.rms/inputStats.mean);
  let total=0,fast=0;for(let k=1;k<=input.length/2;k++){let re=0,im=0;for(let i=0;i<input.length;i++){const value=(input[i]-inputStats.mean)*(.5-.5*Math.cos(2*Math.PI*i/(input.length-1))),angle=2*Math.PI*k*i/input.length;re+=value*Math.cos(angle);im+=value*Math.sin(angle);}const energy=re*re+im*im;total+=energy;const hz=k*60/input.length;if(hz>=5&&hz<=25)fast+=energy;}
  Object.assign(report,{inputStats,outputStats,correlation,gain,fastFraction:fast/total,errors});
  if(report.finalLdr){
   const [modulated,control]=report.finalLdr.replays,signal=modulated.rows.map((row,i)=>row.value-control.rows[i].value),power=modulated.rows.map(row=>row.intensity),signalStats=Stats(signal),powerStats=Stats(power);
   let xy=0,xx=0,yy=0;for(let i=0;i<signal.length;i++){const x=power[i]-powerStats.mean,y=signal[i]-signalStats.mean;xy+=x*y;xx+=x*x;yy+=y*y;}
   const ldrMean=Stats(modulated.rows.map(row=>row.value)).mean;
   Object.assign(report.finalLdr,{signalStats,powerStats,correlation:xy/Math.sqrt(xx*yy),
    displayedMean:ldrMean,relativeRms:signalStats.rms/ldrMean,
    normalizedGain:(signalStats.rms/ldrMean)/(powerStats.rms/powerStats.mean),
    deltaMin:Math.min(...signal),deltaMax:Math.max(...signal),signal});
  }
  await fs.writeFile(path.join(out,`Data_Report${quality}.json`),JSON.stringify(report,null,2));
  assert.equal(report.quality,quality);assert.ok(report.taaDefault&&report.initial.taa,'Default TAA remains active');
  assert.ok(report.initial.active&&report.initial.emitter&&report.initial.executed&&report.initial.strength===1&&report.initial.solarScale===0&&report.initial.dirt===0,'PSF must actually execute independently of solar lens artifacts');
  assert.ok(report.one.y>1e-5&&Math.max(...report.two.rgb)<10,'Read the unsaturated outer optical halo');
  assert.ok(Math.abs(report.intensityTwo/report.intensityOne-2)<1e-6&&Math.abs(report.two.y/report.one.y-2)<.015,'Actual target follows 1x/2x incident light linearly');
  assert.ok(Math.abs(report.repeat.y/report.one.y-1)<.005,'On/2x/on is stable');
  assert.ok(report.fastFraction>.9&&inputStats.rms/inputStats.mean>.005,'The actual director input contains fast, mild combustion variation');
  assert.ok(correlation>.995&&gain>.97&&gain<1.03,'Post-TAA optical pixels follow real source flutter: '+JSON.stringify({quality,correlation,gain}));
  assert.ok(report.haloBackgroundDepth<.001&&report.blocked.every(v=>v===0),'A small centre occluder extinguishes the whole halo even where its background is still sky');
  assert.ok(Math.abs(report.uncovered.y/report.visible.y-1)<.005,'Removing the centre blocker restores glare');
  assert.ok(report.hiddenHead.cleared&&report.hiddenRoot.cleared&&report.hiddenHead.emitterVisible===false&&report.hiddenRoot.emitterVisible===false&&report.hiddenHead.intensity>0&&report.hiddenRoot.intensity>0,'Emitter visibility clears optics without deleting independent light');
  assert.ok(report.restored.emitter&&report.slots===2&&report.third===null&&report.secondPeak>0,'Two actual optical sources fit the existing budget, a third is rejected');
  assert.ok(report.stopped.cleared&&report.stopped.lights===0&&report.stopped.visuals===0&&report.stopped.flares===0,'Stop clears all optical and physical sources');
  assert.ok(report.programs>0&&report.linked&&report.samplers>0&&report.samplers<=2&&report.samplers<=report.samplerLimit,'Real GPU sampler budget remains at two');assert.equal(report.gl,0);assert.deepEqual(errors,[]);
  if(report.finalLdr){
   const ldr=report.finalLdr,[modulated,control]=ldr.replays;
   assert.ok(ldr.headVisible&&ldr.headPower===0&&!ldr.smokeVisible&&!ldr.sparksVisible,'Final pixel test isolates optics without suppressing emitter visibility');
   assert.ok(modulated.rows.every((row,i)=>row.frame===control.rows[i].frame&&row.time===control.rows[i].time),'Matched replays use identical phase clock, TAA jitter and grain frame');
   assert.ok(control.rows.every(row=>row.intensity===control.rows[0].intensity),'The matched control uses an actually constant LightRig output');
   assert.ok(modulated.rows.every(row=>row.max<254),'Final halo annulus is not display-saturated');
   assert.ok(ldr.correlation>.9&&ldr.signalStats.rms>.1,'Final 8-bit pixels must retain measurable source-correlated fine flutter after matched-control subtraction: '+JSON.stringify({correlation:ldr.correlation,rms:ldr.signalStats.rms,relativeRms:ldr.relativeRms}));
  }
  reports.push({quality,correlation,gain,fastFraction:report.fastFraction,linearRatio:report.two.y/report.one.y,slots:report.slots,samplers:report.samplers,target:report.target,
   finalLdr:report.finalLdr?{correlation:report.finalLdr.correlation,rms:report.finalLdr.signalStats.rms,relativeRms:report.finalLdr.relativeRms,normalizedGain:report.finalLdr.normalizedGain,deltaMin:report.finalLdr.deltaMin,deltaMax:report.finalLdr.deltaMax}:null});
  await page.close();
 }
 console.log('FlareGlareBrowserTest passed',JSON.stringify(reports));
}finally{await browser.close();server.close();}
