// Actual editor entry, photometric footprint and reference-caster shadows.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareNight');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=Illumination&flareCamera=field&quality=high&manual=1&audio=0&menu=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const Capture=async name=>{const bytes=await page.screenshot();await fs.writeFile(path.join(out,name+'.png'),bytes);await sharp(bytes).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toFile(path.join(out,name+'Preview.jpg'));};
 assert.equal(await page.locator('[data-vfx-environment]').inputValue(),'night','Flare direct entry defaults to night');
 assert.equal(await page.locator('[data-flare-camera]').inputValue(),'field','Wide-night deep link frames the complete effect');
 const deployment=await page.evaluate(()=>{
  const g=Tengxian,e=g.ParticleEditor,result=[];
  for(const t of [4.516,4.7,4.9,5.17]){e.Seek(t);const v=[...g.vfx.flareVisuals.items][0],p=v.cloth.geometry.attributes.position;let top=0,width=0;
   for(let i=0;i<p.count;i++){top=Math.max(top,p.getY(i));width=Math.max(width,Math.hypot(p.getX(i),p.getZ(i)));}result.push({t,top,width});}
  return result;
 });assert.ok(deployment.every((v,i)=>i===0||(v.top>deployment[i-1].top&&v.width>deployment[i-1].width)),'Canopy and cords deploy together, without appearing at full length');
 await page.locator('[data-flare-camera]').selectOption('follow');
 await page.evaluate(()=>{Tengxian.ParticleEditor.Seek(7);Tengxian.StepFrames(30,1/60,true);});await Capture('NightNear');
 await page.locator('[data-flare-camera]').selectOption('field');
 const field=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,e=g.ParticleEditor;g.StepFrames(30,1/60,true);
  const f=e.flarePreview.flares[0],p=new T.Vector3(f.pos.x,f.pos.y,f.pos.z).project(g.camera),w=innerWidth,h=innerHeight;
  const x=(p.x*.5+.5)*w,y=(.5-p.y*.5)*h,panel=e.panel.root.getBoundingClientRect(),bar=document.querySelector('.edMenuBar').getBoundingClientRect();
  return {ndc:p.toArray(),unobscured:x>40&&x<panel.left-40&&y>bar.bottom+40&&y<h-40,environment:e.previewEnvironment};
 });assert.ok(field.unobscured,JSON.stringify(field));await Capture('NightField');
 await page.locator('[data-flare-camera]').selectOption('ground');
 const lighting=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,e=g.ParticleEditor,f=e.flarePreview.flares[0];g.post.SetTaaEnabled(false);
  // Keep camera, world, light age and material fixed. HDR is upstream of
  // exposure/tonemapping: neither can manufacture these lighting differences.
  const orbit=e.studio.orbit;orbit.target.set(28,0,10);orbit.dist=Math.hypot(70,170);orbit.yaw=Math.PI;orbit.pitch=Math.atan2(70,170);e.studio.ApplyCamera();
  const points=[[0,.005,15],[50,.005,15],[95,.005,15],[24,.005,0]];
  const Read=()=>points.map(v=>{const q=new T.Vector3(...v).project(g.camera),a=new Uint16Array(5*5*4),rt=g.post.targets.hdr;
   const x=Math.round((q.x*.5+.5)*rt.width)-2,y=Math.round((q.y*.5+.5)*rt.height)-2;
   if(x<0||y<0||x+5>=rt.width||y+5>=rt.height)throw new Error('Photometric point outside render target');
   g.renderer.readRenderTargetPixels(rt,x,y,5,5,a);let sum=0;for(let i=0;i<a.length;i+=4)sum+=T.DataUtils.fromHalfFloat(a[i])*.2126+T.DataUtils.fromHalfFloat(a[i+1])*.7152+T.DataUtils.fromHalfFloat(a[i+2])*.0722;return sum/25;});
  const Frame=()=>{g.StepFrames(3,0,true);return Read();};
  const lit=Frame(),move=e.flarePreview.host.MoveLight,original=f.intensity;
  e.flarePreview.host.MoveLight=()=>{};g.lights.UpdateFire(f.lightHandle,{intensity:0});g.lights.Update(0,e.previewTime,g.camera.position);const dark=Frame();
  e.flarePreview.host.MoveLight=move;f.intensity=original;e.flarePreview.StepLight(f);g.lights.Update(0,e.previewTime,g.camera.position);
  const repeat=Frame();g.post.preset.flareShadows=false;const unshadowed=Frame();g.post.preset.flareShadows=true;
  e.FrameEffect();g.StepFrames(30,1/60,true);
  const autoFog=()=>[...g.post.volumetricsPass.fogVolumes.values()].filter(v=>v.auto).length;
  const flareFog=autoFog(),camp=g.lights.AddFire({x:0,y:.5,z:0},{intensity:6,radius:12});g.StepFrames(3,0,true);
  const campFog=autoFog();g.lights.RemoveFire(camp);g.StepFrames(3,0,true);const cleanedFog=autoFog();
  return {points,lit,dark,repeat,unshadowed,flareFog,campFog,cleanedFog,shadowMaps:g.post.flareShadowsPass.stats.maps,gl:g.renderer.getContext().getError()};
 });
 assert.ok(lighting.lit.slice(0,3).every((v,i)=>v>lighting.dark[i]*2),'Light must illuminate surfaces through 95 m, not just its sprite: '+JSON.stringify(lighting));
 assert.ok(lighting.lit.every((v,i)=>Math.abs(v-lighting.repeat[i])<Math.max(.02,v*.02)),'On/off/on must be stable');
 assert.ok(lighting.lit[3]<lighting.unshadowed[3]*.4,'Roof must occlude the flare light: '+JSON.stringify(lighting));
 assert.equal(lighting.gl,0);await Capture('NightGround');
 assert.equal(lighting.flareFog,0,'Flare light radius must not generate a world-sized smoke volume');
 assert.equal(lighting.campFog,1,'Ordinary fires keep their automatic smoke');assert.equal(lighting.cleanedFog,0);
 await page.locator('[data-vfx-environment]').selectOption('day');await page.locator('[data-flare-camera]').selectOption('follow');
 await page.evaluate(()=>Tengxian.StepFrames(30,1/60,true));await Capture('DayStructure');
 const restore=await page.evaluate(()=>{
  const g=Tengxian,e=g.ParticleEditor,snapshot=e.nightSnapshot.environment;
  const before=JSON.stringify(e.flarePreview.flares[0].pos);e.SetPreviewEnvironment('night');e.SetPreviewEnvironment('day');
  const samePose=before===JSON.stringify(e.flarePreview.flares[0].pos);e.SetPreviewEnvironment('original');
  const restored=JSON.stringify(e.host.game.GetEnvironmentState())===JSON.stringify(snapshot);
  e.SetPreviewEnvironment('night');e.Seek(28);return {samePose,restored,light:e.flarePreview.flares[0].intensity};
 });assert.ok(restore.samePose&&restore.restored);assert.equal(restore.light,0);
 await page.locator('[data-flare-camera]').selectOption('field');await page.evaluate(()=>Tengxian.StepFrames(120,1/60,true));await Capture('Extinguished');
 const cleanup=await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor,field=e.flareField.root,original=e.nightSnapshot.environment;e.SelectEffect('SignalRed');e.Seek(3);g.StepFrames(10,1/60,true);return {field:field.name,original};});
 await page.locator('[data-flare-camera]').selectOption('follow');await page.evaluate(()=>Tengxian.StepFrames(20,1/60,true));await Capture('SignalNight');
 const exit=await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor,host=e.host.game;g.editor.Close();return {field:g.scene.getObjectByName('FlarePreviewField')?.name??null,environment:host.GetEnvironmentState()};});
 assert.equal(exit.field,null);assert.deepEqual(exit.environment,cleanup.original);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_NightReport.json'),JSON.stringify({deployment,field,lighting,restore,exit,errors},null,2));
 console.log('FlareNightBrowserTest passed',JSON.stringify({field,lighting,restore,exit}));
}finally{await browser.close();server.close();}
