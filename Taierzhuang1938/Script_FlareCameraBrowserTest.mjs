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
 const Visible=async(name)=>{
  const result=await page.evaluate(async()=>{
   const T=await import('three'),g=Tengxian,e=g.ParticleEditor;e.Seek(6);g.post.SetTaaEnabled(false);g.StepFrames(3,0,true);
   const f=e.flarePreview.flares[0],v=[...g.vfx.flareVisuals.items][0],point=new T.Vector3(f.pos.x,f.pos.y,f.pos.z),ndc=point.clone().project(g.camera);
   const canvas=g.renderer.domElement.getBoundingClientRect(),panel=e.panel.root.getBoundingClientRect(),bar=document.querySelector('.edMenuBar').getBoundingClientRect();
   const pixel={x:canvas.left+(ndc.x*.5+.5)*canvas.width,y:canvas.top+(.5-ndc.y*.5)*canvas.height};
   const gl=g.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
   const x=Math.max(0,Math.min(w-96,Math.round((ndc.x*.5+.5)*w)-48)),y=Math.max(0,Math.min(h-96,Math.round((ndc.y*.5+.5)*h)-48));
   const frame=g.post.frame;
   const Read=()=>{g.post.frame=frame;g.StepFrames(3,0,true);const a=new Uint8Array(96*96*4);gl.readPixels(x,y,96,96,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
   const on=Read();v.root.visible=false;const off=Read();v.root.visible=true;const again=Read();
   // Stable frame noise plus on/off/on rejects monotonic exposure adaptation.
   let pixels=0;for(let i=0;i<on.length;i+=4){const a=on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2],b=again[i]+again[i+1]+again[i+2]-off[i]-off[i+1]-off[i+2];if(Math.abs(a)>12&&Math.abs(b)>12&&a*b>0)pixels++;}
   return {effect:e.effectId,mode:e.flareCamera,selected:document.querySelector('select[data-flare-camera]').value,
    far:g.camera.far,depth:-point.applyMatrix4(g.camera.matrixWorldInverse).z,ndc:ndc.toArray(),pixels,
    unobscured:pixel.x>canvas.left+48&&pixel.x<panel.left-48&&pixel.y>bar.bottom+48&&pixel.y<canvas.bottom-48,gl:gl.getError()};
  });
  assert.equal(result.mode,'follow');assert.equal(result.selected,'follow');
  assert.ok(result.depth>0&&result.depth<result.far&&Math.abs(result.ndc[0])<1&&Math.abs(result.ndc[1])<1,JSON.stringify(result));
  assert.ok(result.unobscured&&result.pixels>100,'The default camera must show an unobscured, legible effect: '+JSON.stringify(result));assert.equal(result.gl,0);
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
 await Open('quality=high&effect=SignalRed');await Visible('DirectSignalRed');
 await Open('quality=whitebox&effect=Illumination');await Visible('DirectIlluminationWhitebox');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'Data_CameraReport.json'),JSON.stringify({reports,overview,observer,restored,errors},null,2));
 console.log('FlareCameraBrowserTest passed');
}finally{await browser.close();server.close();}
