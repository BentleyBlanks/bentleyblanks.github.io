// Same camera/receiver/source age, HDR before exposure. Compare actual rendered
// light and emitter independently across authored day/night scene units.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareOpticalScale');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],report=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=Illumination&flareCamera=observer&quality=high&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 for(const effect of ['Illumination','SignalRed'])for(const environment of ['day','night']){
  const r=await page.evaluate(async({effect,environment})=>{
   const T=await import('three'),M=await import('./Script_MaterialPatches.mjs'),g=Tengxian,e=g.ParticleEditor;
   e.SelectEffect(effect);e.SetPreviewEnvironment(environment);e.Seek(effect==='Illumination'?8:4.5);e.paused=true;g.post.SetTaaEnabled(false);
   const f=e.flarePreview.flares[0],v=[...g.vfx.flareVisuals.items][0],material=new T.MeshStandardMaterial({color:0x808080,roughness:1});M.ApplyPatches(material,[M.MakeClusteredLightsPatch()]);
   const card=new T.Mesh(new T.PlaneGeometry(10,10).rotateX(-Math.PI/2),material);card.position.set(f.pos.x+5,.03,f.pos.z+8);e.studio.root.add(card);card.updateMatrixWorld();
   const o=e.studio.orbit;o.target.copy(card.position);o.dist=60;o.pitch=.4;o.yaw=Math.PI;e.studio.ApplyCamera();e.studio.grid.visible=false;
   const Read=(point,size=5)=>{g.StepFrames(5,0,true);const q=point.clone().project(g.camera),rt=g.post.targets.hdr,a=new Uint16Array(size*size*4);
    g.renderer.readRenderTargetPixels(rt,Math.round((q.x*.5+.5)*rt.width)-(size>>1),Math.round((q.y*.5+.5)*rt.height)-(size>>1),size,size,a);
    let y=0,peak=0;for(let i=0;i<a.length;i+=4){const r=T.DataUtils.fromHalfFloat(a[i]),b=T.DataUtils.fromHalfFloat(a[i+2]),green=T.DataUtils.fromHalfFloat(a[i+1]);y+=(r*.2126+green*.7152+b*.0722)/(size*size);peak=Math.max(peak,r,green,b);}return {y,peak};};
   const on=Read(card.position),move=e.flarePreview.host.MoveLight;e.flarePreview.host.MoveLight=()=>{};g.lights.UpdateFire(f.lightHandle,{intensity:0});g.lights.Update(0,e.previewTime,g.camera.position);const off=Read(card.position);
   e.flarePreview.host.MoveLight=move;e.flarePreview.StepLight(f);g.lights.Update(0,e.previewTime,g.camera.position);
   card.removeFromParent();card.geometry.dispose();material.dispose();
   e.flareCamera='observer';e.FrameEffect();const point=new T.Vector3(f.pos.x,f.pos.y,f.pos.z),headOn=Read(point,21);v.head.visible=false;const headOff=Read(point,21);v.head.visible=true;
   const scale=f.sceneScale,power=v.head.material.uniforms.power.value;
   const duplicate=v.head.clone();v.root.add(duplicate);const overlapping=Read(point,21);duplicate.removeFromParent();duplicate.dispose();
   // A solid object in front of the emitter must remove its core and bloom.
   const block=new T.Mesh(new T.PlaneGeometry(16,16),new T.MeshBasicMaterial({color:0x101010}));block.position.lerpVectors(g.camera.position,point,.6);block.quaternion.copy(g.camera.quaternion);e.studio.root.add(block);block.updateMatrixWorld();
   const blockedOn=Read(point,21);v.head.visible=false;const blockedOff=Read(point,21);v.head.visible=true;block.removeFromParent();block.geometry.dispose();block.material.dispose();
   g.post.SetTaaEnabled(true);g.StepFrames(30,0,true);
   return {effect,environment,intensity:f.intensity,scale,power,on,off,headOn,headOff,overlapping,blockedOn,blockedOff,gl:g.renderer.getContext().getError()};
  },{effect,environment});report.push(r);
  assert.ok(Number.isFinite(r.headOn.y)&&r.headOn.peak<65504,'No half-float overflow');assert.equal(r.gl,0);
  assert.ok(Number.isFinite(r.overlapping.y)&&r.overlapping.peak<65504,'Coincident emitters within the two-flare budget must not overflow');
  assert.ok(r.headOn.y-r.headOff.y>1e-5,'The source remains visible against its actual background');
  assert.ok(Math.abs(r.blockedOn.y-r.blockedOff.y)<.001,'The emitter must not shine through a solid occluder');
  if(environment==='day')assert.ok((r.on.y-r.off.y)/r.off.y<.003,'High aerial flare cannot double daylight ground luminance');
  else assert.ok(r.on.y>r.off.y*1.5,'Both colors still illuminate the night receiver');
  const shot=await page.screenshot();await fs.writeFile(path.join(out,`${effect}_${environment}.png`),shot);await sharp(shot).resize({width:640}).jpeg({quality:82}).toFile(path.join(out,`${effect}_${environment}Preview.jpg`));
 }
 for(const effect of ['Illumination','SignalRed']){
  const [day,night]=report.filter(r=>r.effect===effect);assert.equal(day.intensity,night.intensity);
  assert.ok(Math.abs(day.power/night.power-day.scale/night.scale)<1e-9,'Source and receiver use the same environment unit conversion');
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify(report,null,2));console.log('FlareOpticalScaleBrowserTest passed',JSON.stringify(report));
}finally{await browser.close();server.close();}
