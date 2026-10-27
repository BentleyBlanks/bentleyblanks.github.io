import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'tmp','FlarePhotometry');
const quality=process.argv.includes('--whitebox')?'whitebox':'high';
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1','{"master":0}');localStorage.setItem('tengxian1938_tools_volume_v1','{"volume":0,"muted":true}');});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?editor=vfx&effect=SignalRed&flareCamera=ground&quality=${quality}&manual=1&menu=0&audio=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const report=await page.evaluate(async quality=>{
  const T=await import('three'),M=await import('./Script_MaterialPatches.mjs'),g=Tengxian,e=g.ParticleEditor;
  g.post.SetTaaEnabled(false); // Static HDR photometry: remove subpixel camera jitter, not lighting.
  const material=new T.MeshStandardMaterial({color:0x808080,roughness:1});M.ApplyPatches(material,[M.MakeClusteredLightsPatch()]);
  const card=new T.Mesh(new T.PlaneGeometry(4,4).rotateX(-Math.PI/2),material);e.studio.root.add(card);
  const o=e.studio.orbit;o.target.set(0,0,10);o.dist=80;o.pitch=.5;o.yaw=Math.PI;e.studio.ApplyCamera();e.studio.grid.visible=false;
  const results=[];
  for(const time of [.2,.5,2,4.5,6.5]){
   e.Seek(time);const f=e.flarePreview.flares[0];card.position.set(f.pos.x+4,.02,f.pos.z+7.37);card.updateMatrixWorld();
   g.StepFrames(4,0,true);const q=card.position.clone().project(g.camera),rt=g.post.targets.hdr;
   const Read=()=>{g.StepFrames(4,0,true);
    if(quality==='whitebox'){const gl=g.renderer.getContext(),b=new Uint8Array(36);gl.readPixels(Math.round((q.x*.5+.5)*gl.drawingBufferWidth)-1,Math.round((q.y*.5+.5)*gl.drawingBufferHeight)-1,3,3,gl.RGBA,gl.UNSIGNED_BYTE,b);return [0,1,2].map(c=>{let s=0;for(let i=c;i<b.length;i+=4)s+=b[i]/255;return s/9;});}
    const a=new Uint16Array(3*3*4);g.renderer.readRenderTargetPixels(rt,Math.round((q.x*.5+.5)*rt.width)-1,Math.round((q.y*.5+.5)*rt.height)-1,3,3,a);
    return [0,1,2].map(c=>{let s=0;for(let i=c;i<a.length;i+=4)s+=T.DataUtils.fromHalfFloat(a[i]);return s/9;});};
   const red=Read(),move=e.flarePreview.host.MoveLight;e.flarePreview.host.MoveLight=()=>{};
   g.lights.UpdateFire(f.lightHandle,{intensity:0});g.lights.Update(0,e.previewTime,g.camera.position);const dark=Read();
   const lamp=g.lights.AddFire(f.pos,{intensity:f.intensity,radius:f.lightRadiusM,color:0xffffff,flicker:false,autoSmoke:false});g.lights.Update(0,e.previewTime,g.camera.position);const white=Read();g.lights.RemoveFire(lamp);
   e.flarePreview.host.MoveLight=move;e.flarePreview.StepLight(f);g.lights.Update(0,e.previewTime,g.camera.position);const again=Read();
   const delta=red.map((v,i)=>v-dark[i]),whiteDelta=white.map((v,i)=>v-dark[i]),Y=a=>a[0]*.2126+a[1]*.7152+a[2]*.0722;
   results.push({time,height:f.pos.y,cd:f.intensity,red,dark,again,delta,whiteDelta,luminanceRatio:Y(delta)/Y(whiteDelta)});
  }
  card.removeFromParent();card.geometry.dispose();material.dispose();
  e.Seek(4.5);o.target.set(24,.025,-2);o.dist=60;o.pitch=.3;e.studio.ApplyCamera();
  const ReadRoof=on=>{g.post.preset.flareShadows=on;g.StepFrames(4,0,true);const rt=g.post.targets.hdr,a=new Uint16Array(4);g.renderer.readRenderTargetPixels(rt,Math.floor(rt.width/2),Math.floor(rt.height/2),1,1,a);return T.DataUtils.fromHalfFloat(a[0]);};
  const roofShadow=ReadRoof(true),roofUnshadowed=ReadRoof(false);g.post.preset.flareShadows=true;
  e.Seek(.3);e.FrameEffect();g.StepFrames(30,1/60,true);
  return {results,roofShadow,roofUnshadowed,gl:g.renderer.getContext().getError()};
 },quality);
 await fs.writeFile(path.join(out,'Data_Report'+quality+'.json'),JSON.stringify(report,null,2));
 for(const r of report.results){
  assert.ok(r.delta[0]>.001&&r.delta[0]>r.delta[1]*8,'Signal must visibly cast red light throughout ascent/apex: '+JSON.stringify(r));
  if(quality==='high')assert.ok(Math.abs(r.luminanceRatio-1)<.04,'Equal candela red and white must have equal photopic response on a neutral receiver: '+JSON.stringify(r));
  assert.ok(r.red.every((v,i)=>Math.abs(v-r.again[i])<Math.max(quality==='high'?.0001:.008,v*.01)),'On/off/on only changes the lamp: '+JSON.stringify(r));
 }
 assert.equal(report.gl,0);assert.deepEqual(errors,[]);
 if(quality==='high')assert.ok(report.roofShadow<report.roofUnshadowed*.4,'Signal illumination must also respect overhead shelter occlusion');
 const shot=await page.screenshot(),name=quality==='high'?'SignalGroundHigh':'SignalGroundWhitebox';await fs.writeFile(path.join(out,name+'.png'),shot);await sharp(shot).resize({width:640}).jpeg({quality:80}).toFile(path.join(out,name+'Preview.jpg'));
 if(quality==='whitebox'){
  const restored=await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor,original=e.savedWhiteboxConfig,cluster=e.savedClusteredEnabled;e.SelectEffect('FireMedium');const ordinary=g.post.whiteboxScene.config.sceneLighting===original.sceneLighting&&(g.lights.clustered?.enabled===cluster);g.editor.Close();return {ordinary,config:g.post.whiteboxScene.config===original,cluster:g.lights.clustered?.enabled===cluster};});
  assert.ok(restored.ordinary&&restored.config&&restored.cluster,'Flare preview must restore the whitebox lighting and user configuration');report.restored=restored;
 }
 await fs.writeFile(path.join(out,'Data_Report.json'),JSON.stringify(report,null,2));console.log('FlarePhotometryBrowserTest passed',JSON.stringify(report));
}finally{await browser.close();server.close();}
