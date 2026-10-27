// Read actual surface + displayed pixels through time, then isolate angular
// redistribution at fixed source position and intensity. Camera never moves.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlareFlicker');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,600));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=Illumination&flareCamera=ground&quality=high&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const report=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,e=g.ParticleEditor;e.Seek(6);g.post.SetTaaEnabled(false);
  // Wide oblique ground view for unobstructed points on opposite sides.
  const o=e.studio.orbit;o.target.set(0,0,10);o.dist=190;o.pitch=.4;o.yaw=Math.PI;e.studio.ApplyCamera();g.StepFrames(4,0,true);
  const points=[[-55,.005,15],[55,.005,15],[0,.005,15]],gl=g.renderer.getContext(),frame=g.post.frame;
  const Read=()=>points.map(v=>{
   const q=new T.Vector3(...v).project(g.camera),rt=g.post.targets.hdr,x=Math.round((q.x*.5+.5)*rt.width),y=Math.round((q.y*.5+.5)*rt.height),a=new Uint16Array(4);
   g.renderer.readRenderTargetPixels(rt,x,y,1,1,a);
   const b=new Uint8Array(4),sx=Math.round((q.x*.5+.5)*gl.drawingBufferWidth),sy=Math.round((q.y*.5+.5)*gl.drawingBufferHeight);
   gl.readPixels(sx,sy,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);
   return {hdr:T.DataUtils.fromHalfFloat(a[0])*.2126+T.DataUtils.fromHalfFloat(a[1])*.7152+T.DataUtils.fromHalfFloat(a[2])*.0722,display:b[0]*.2126+b[1]*.7152+b[2]*.0722};
  });
  const series=[];
  for(let i=0;i<181;i++){
   e.Advance(1/30);g.post.frame=frame;g.StepFrames(1,1/30,true);
   const f=e.flarePreview.flares[0];series.push({t:e.previewTime,intensity:f.intensity,brightness:f.brightness,direction:f.emission.direction,pixels:Read()});
  }
  const f=e.flarePreview.flares[0],source=g.lights.fireSources.get(f.lightHandle),position=source.position.clone(),power=source.base,emission=source.emission;
  // Paused editor frames still refresh the light at dt=0. Isolate that adapter
  // while testing chosen directions, then put the production adapter back.
  const moveLight=e.flarePreview.host.MoveLight;e.flarePreview.host.MoveLight=()=>{};
  const Set=(intensity,d)=>{g.lights.UpdateFire(f.lightHandle,{position:{x:0,y:70,z:0},intensity,emission:{direction:d,floor:.35,power:1.5}});g.lights.Update(0,e.previewTime,g.camera.position);g.post.frame=frame;g.StepFrames(3,0,true);return Read();};
  const dark=Set(0,{x:0,y:-1,z:0}),left=Set(60000,{x:-Math.sin(.35),y:-Math.cos(.35),z:0}),right=Set(60000,{x:Math.sin(.35),y:-Math.cos(.35),z:0});
  const originalShadow=g.post.preset.flareShadows;g.post.preset.flareShadows=false;
  const noShadow=Set(60000,{x:Math.sin(.35),y:-Math.cos(.35),z:0});g.post.preset.flareShadows=originalShadow;
  g.lights.UpdateFire(f.lightHandle,{position,intensity:power,emission});
  e.flarePreview.host.MoveLight=moveLight;
  e.Seek(8.731);const first=JSON.stringify({p:e.flarePreview.flares[0].pos,light:e.flarePreview.flares[0].intensity,emission:e.flarePreview.flares[0].emission});
  e.Seek(12);e.Seek(8.731);const replay=JSON.stringify({p:e.flarePreview.flares[0].pos,light:e.flarePreview.flares[0].intensity,emission:e.flarePreview.flares[0].emission});
  return {series,left,right,dark,noShadow,deterministic:first===replay,gl:gl.getError()};
 });
 const Span=a=>Math.max(...a)-Math.min(...a),center=report.series.map(s=>s.pixels[2]);
 assert.ok(Span(report.series.map(s=>s.brightness))>.25,'Visible-scale irregular modulation');
 assert.ok(Span(center.map(p=>p.hdr))>Math.max(...center.map(p=>p.hdr))*.18,'Ground HDR really fluctuates');
 assert.ok(Span(center.map(p=>p.display))>7,'The final tone-mapped image must retain perceivable fluctuations');
 const shortChanges=center.slice(6).map((p,i)=>p.display-center[i].display);
 assert.ok(Math.min(...shortChanges)<-6&&Math.max(...shortChanges)>6,'Subsecond dimming and brightening cannot be explained by a slowly descending source');
 await fs.writeFile(path.join(out,'Data_FlickerReport.json'),JSON.stringify(report,null,2));
 assert.ok(report.left[0].hdr>report.right[0].hdr*1.2&&report.right[1].hdr>report.left[1].hdr*1.2,'Swing must redistribute light across the ground, not simply dim the entire image: '+JSON.stringify({left:report.left,right:report.right}));
 assert.ok(report.noShadow[1].hdr>report.left[1].hdr*1.2,'Angular emission survives disabled/unavailable shadow maps');
 assert.ok(report.deterministic);assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 const sorted=[...report.series].sort((a,b)=>a.pixels[2].display-b.pixels[2].display);
 for(const [name,t]of [['Dim',sorted[0].t],['Bright',sorted.at(-1).t]]){
  await page.evaluate(t=>{const g=Tengxian,e=g.ParticleEditor;e.Seek(t);e.flareCamera='ground';e.FrameEffect();g.StepFrames(5,1/60,true);},t);
  const bytes=await page.screenshot();await fs.writeFile(path.join(out,name+'.png'),bytes);await sharp(bytes).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toFile(path.join(out,name+'Preview.jpg'));
 }
 if(process.argv.includes('--record')){
  const frames=path.join(out,'Frames');await fs.mkdir(frames,{recursive:true});
  await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor;e.flareCamera='field';e.Seek(6);e.FrameEffect();g.post.SetTaaEnabled(true);g.StepFrames(30,1/60,true);});
  for(let i=0;i<144;i++){await page.evaluate(()=>{Tengxian.ParticleEditor.Advance(1/24);Tengxian.StepFrames(1,1/24,true);});await page.screenshot({path:path.join(frames,String(i).padStart(4,'0')+'.png')});}
 }
 await fs.writeFile(path.join(out,'Data_FlickerReport.json'),JSON.stringify(report,null,2));
 console.log('FlareFlickerBrowserTest passed',JSON.stringify({brightnessSpan:Span(report.series.map(s=>s.brightness)),displaySpan:Span(center.map(p=>p.display)),left:report.left,right:report.right,deterministic:report.deterministic,gl:report.gl}));
}finally{await browser.close();server.close();}
