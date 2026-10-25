import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots','FlareEffects');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 // Read-only static fixture has no blockout save service.
 await page.route('**/__blockout/status',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:false})}));
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,600)+' '+m.location().url);});
 page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));});
 const url=`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
 await page.goto(url+'?editor=vfx&quality=high&manual=1&menu=0&audio=0',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 const Capture=async name=>{const bytes=await page.screenshot();await fs.writeFile(path.join(out,name+'.png'),bytes);
   await sharp(bytes).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toFile(path.join(out,name+'Preview.jpg'));};
 for(const [kind,label]of [['SignalRed','红色信号弹'],['Illumination','白光伞降照明弹']]){
  await page.getByText(label,{exact:true}).click();
  const result=await page.evaluate(kind=>{
   const g=Tengxian,e=g.ParticleEditor;e.flareCamera='follow';e.Seek(7);e.FrameEffect();g.StepFrames(2,0,true);
   const f=e.flarePreview.flares[0],visual=[...g.vfx.flareVisuals.items][0];
   const first=JSON.stringify({pos:f.pos,smoke:Array.from(visual.smoke.instanceMatrix.array)});
   e.Seek(3);e.Seek(7);const current=[...g.vfx.flareVisuals.items][0];
   const replay=JSON.stringify({pos:e.flarePreview.flares[0].pos,smoke:Array.from(current.smoke.instanceMatrix.array)});
   const t=e.previewTime;g.StepFrames(12,1/60,true);
   return {kind:e.effectId,phase:e.flarePreview.flares[0].phase,canopy:current.canopy.visible,
    deterministic:first===replay,paused:e.previewTime===t,items:g.vfx.flareVisuals.items.size,
    lights:g.lights.fireSources.size,smoke:current.smoke.geometry.attributes.age.array.filter(x=>x>=0).length};
  },kind);
  assert.equal(result.kind,kind);assert.equal(result.phase,'burn');assert.equal(result.canopy,kind==='Illumination');
  assert.ok(result.deterministic&&result.paused);assert.equal(result.items,1);assert.ok(result.lights>0&&result.smoke>0);
  await Capture(kind);console.log('ok',JSON.stringify(result));
 }
 await page.evaluate(()=>{Tengxian.ParticleEditor.SetNightPreview(true);Tengxian.StepFrames(3,0,true);});
 await Capture('IlluminationNight');
 await page.evaluate(()=>Tengxian.ParticleEditor.SetNightPreview(false));
 // Real PBR ground gets brighter under the candle. Hold the camera/exposure and
 // compare actual rendered pixels with only that light's intensity changed.
 const lighting=await page.evaluate(()=>{
  const g=Tengxian,e=g.ParticleEditor;e.flareCamera='ground';e.FrameEffect();
  const sun=g.lights.sun.intensity,ambient=g.lights.ambient.intensity,probe=g.lights.globalProbe.intensity;
  g.lights.sun.intensity=0;g.lights.ambient.intensity=.01;g.lights.globalProbe.intensity=0;
  const gl=g.renderer.getContext(),Read=()=>{g.StepFrames(2,0,true);const a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
  const f=e.flarePreview.flares[0];e.flarePreview.StepLight(f);g.lights.Update(0,e.previewTime,g.camera.position);const on=Read();
  // Disable only the shared director's lamp, not meshes or environment.
  g.lights.UpdateFire(f.lightHandle,{intensity:0});g.lights.Update(0,e.previewTime,g.camera.position);
  const old=f.intensity;f.intensity=0;const original=e.flarePreview.host.MoveLight;e.flarePreview.host.MoveLight=()=>{};
  const off=Read();e.flarePreview.host.MoveLight=original;f.intensity=old;e.flarePreview.StepLight(f);
  let brighter=0,sum=0;for(let i=0;i<on.length;i+=4){const d=on[i]+on[i+1]+on[i+2]-off[i]-off[i+1]-off[i+2];if(d>12){brighter++;sum+=d;}}
  g.lights.sun.intensity=sun;g.lights.ambient.intensity=ambient;g.lights.globalProbe.intensity=probe;
  return {brighter,sum};
 });
 assert.ok(lighting.brighter>200,'Flare must illuminate real ground pixels: '+JSON.stringify(lighting));console.log('ok ground illumination',lighting);
 const cleanup=await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor;e.Seek(28);const done=g.vfx.flareVisuals.items.size===0&&e.flarePreview.Count===0;
  e.paused=false;e.loop=true;e.Update(1/60);const replayed=e.flarePreview.Count===1&&e.previewTime<.1;
  e.Play();e.Stop();const stopped=g.vfx.flareVisuals.items.size===0;
  const original=e.savedFlareVisuals,sky=g.scene.getObjectByName('SkyDome'),visible=sky.visible,sun=g.lights.sun.intensity;
  e.SetNightPreview(true);g.editor.Close();return {done,replayed,stopped,restored:g.vfx.flareVisuals===original,nightRestored:sky.visible===visible&&g.lights.sun.intensity===sun};});
 assert.ok(cleanup.done&&cleanup.replayed&&cleanup.stopped&&cleanup.restored&&cleanup.nightRestored);console.log('ok cleanup',cleanup);
 // Same renderer in real blockout playback (including whitebox effects disabled).
 await page.goto(url+'?editor=blockout&level=FirstLevel1218&kf=13-2&quality=whitebox&scale=small&audio=0',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.Debug?.Blockout?.State().ready,null,{timeout:300000});
 await page.evaluate(async()=>{await Tengxian.Debug.Blockout.Previz.Reload();await Tengxian.Debug.Blockout.Previz.Seek(5.35);});
 const previz=await page.evaluate(()=>{const objects=[];for(const root of Tengxian.post.debugOverlays)root.traverse(o=>{if(o.name?.startsWith('Flare/'))objects.push({name:o.name,visible:root.visible,children:o.children.length})});
  return {state:Tengxian.Debug.Blockout.Previz.State(),objects};});
 assert.ok(previz.state.active||previz.state.playing||previz.state.keyframe==='13-2',JSON.stringify(previz.state));
 assert.ok(previz.objects.some(o=>o.visible&&o.children===4),'Real flare must be attached to visible blockout render layer');
 await Capture('BlockoutSignal');await page.evaluate(()=>Tengxian.Debug.Blockout.Previz.Stop());
 // Actual campaign assembly launches the same signal at AirFirst, without editor state.
 await page.goto(url+'?whitebox=p012&missionStage=13&manual=1&menu=0&quality=high&audio=0',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!(window.Tengxian?.state?.ready&&window.Tengxian?.Debug?.FirstLevelMissionRuntime?.()),null,{timeout:300000});
 const campaign=await page.evaluate(async()=>{const g=Tengxian;g.StepFrames(330,1/60,false);const state=g.Debug.Flare.State();
  const result={stage:g.Debug.FirstLevelMission().stage,launched:state.stats.launched,view:state.view,visuals:g.vfx.flareVisuals.items.size};
  await g.Debug.FirstLevelJump(11);result.cleared=g.Debug.Flare.State().view===null&&g.vfx.flareVisuals.items.size===0;return result;});
 assert.ok(campaign.launched>=1&&campaign.visuals===1&&campaign.view.flares[0].presetId==='SignalRed',JSON.stringify(campaign));
 assert.ok(campaign.cleared);console.log('ok campaign signal',JSON.stringify(campaign));
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'Data_FlareReport.json'),JSON.stringify({lighting,cleanup,previz,campaign,errors},null,2));
 console.log('FlareEffectsBrowserTest passed');
}finally{await browser.close();server.close();}
