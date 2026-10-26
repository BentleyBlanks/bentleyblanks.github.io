import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const whitebox=process.argv.includes('--whitebox');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots',whitebox?'ParticleEditorWhitebox':'ParticleEditor');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500))});
 const entry=whitebox?'editor=tools&quality=whitebox':'whitebox=p012&editor=vfx&quality=high';
 await page.goto('http://127.0.0.1:'+server.address().port+'/Taierzhuang1938/?'+entry+'&manual=1&menu=0',{waitUntil:'domcontentloaded',timeout:180000});
 if(whitebox){await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:300000});await page.click('#edRoot .edMenu[data-menu="media"] > .edMenuTitle');await page.click('#edRoot .edMenuItem[data-editor="vfx"]');}
 await page.waitForFunction(()=>window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});
 await page.evaluate(()=>Tengxian.Particles.Ready());
 if(whitebox){
   await page.getByText('扬尘',{exact:true}).click();
   await page.evaluate(()=>Tengxian.Particles.Ready());
   const visible=await page.evaluate(()=>{
     const g=Tengxian,e=g.ParticleEditor;e.Seek(3);
     const gl=g.renderer.getContext(),Pixels=()=>{g.StepFrames(1,0,true);const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
     const on=Pixels();g.vfx.particles.root.visible=false;const off=Pixels();g.vfx.particles.root.visible=true;
     let changed=0;for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>12)changed++;
     const info=g.GraphicsProfile.Inspect();g.StepFrames(1,0,true);return {changed,profile:info.profile,effects:info.config.effects};
   });
   await page.screenshot({path:path.join(out,'Scene_WhiteboxDust.png')});
   assert.equal(visible.profile,'whitebox');assert.equal(visible.effects,false,'preview must not change the saved/game whitebox configuration');
   assert.ok(visible.changed>200,'default tools entry must actually render dust pixels: '+JSON.stringify(visible));
   console.log('Default whitebox dust:',JSON.stringify(visible));
   await fs.writeFile(path.join(out,'Visibility.json'),JSON.stringify(visible,null,2));
   await page.evaluate(()=>Tengxian.ParticleEditor.SelectEffect('FireMedium'));
 }
 const baseline=await page.evaluate(()=>{const e=Tengxian.ParticleEditor;return {particles:JSON.stringify(e.savedParticleEffects.Inspect()),lights:e.savedLighting?.fireSources.size};});
 await page.evaluate(()=>Tengxian.StepFrames(20,1/60,true));
 assert.equal(await page.locator('[data-vfx-editor="modules"]').isVisible(),true);
 await page.click('[data-vfx-action="pause"]');
 const frozen=await page.evaluate(()=>{const e=Tengxian.ParticleEditor;return {time:e.previewTime,lights:Tengxian.lights.GetEffectLightState()};});
 await page.evaluate(()=>Tengxian.StepFrames(12,1/60,true));
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.previewTime),frozen.time);
 await page.click('[data-vfx-action="step"]');
 assert.ok(Math.abs((await page.evaluate(()=>Tengxian.ParticleEditor.previewTime))-frozen.time-1/60)<1e-8);
 await page.locator('[data-vfx-time]').evaluate(input=>{input.value='.6';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>Math.abs(Tengxian.ParticleEditor.previewTime-.6)<1e-6&&Tengxian.ParticleEditor.paused);
 await page.click('[data-vfx-tab="modules"]');
 await page.selectOption('[data-vfx-layer]','preset:FireTongue');
 assert.equal(await page.locator('[data-particle-module]').count(),10);
 await page.locator('[data-particle-module="noise"] > summary').click();
 const frequency=page.locator('[data-particle-field="noise.frequency"]');await frequency.fill('4.2');await frequency.press('Tab');
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.ReadLayer().modules.noise.frequency),4.2);
 await page.locator('[data-particle-module="sizeOverLifetime"] > summary').click();
 const before=await page.evaluate(()=>Tengxian.ParticleEditor.ReadLayer().modules.sizeOverLifetime.curve[2][1]);
 const point=page.locator('[data-particle-module="sizeOverLifetime"] [data-curve-point="2"]');await point.scrollIntoViewIfNeeded();
 const box=await point.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-13,{steps:4});await page.mouse.up();
 const after=await page.evaluate(()=>Tengxian.ParticleEditor.ReadLayer().modules.sizeOverLifetime.curve[2][1]);assert.ok(after>before+.05,'dragging the real curve handle changes the module');
 await page.click('[data-vfx-tab="presets"]');await page.getByRole('button',{name:'生成 JSON',exact:true}).click();
 const exported=JSON.parse(await page.locator('[data-vfx-preset]').inputValue());assert.equal(exported.layers['preset:FireTongue'].noise.frequency,4.2);
 await page.click('[data-vfx-tab="library"]');await page.getByText('枪口焰 · 步枪',{exact:true}).click();
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.effectId),'MuzzleRifle');
 await page.click('[data-vfx-tab="presets"]');await page.getByRole('button',{name:'导入 JSON',exact:true}).click();
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.effectId),'FireMedium');
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.layerPatches.get('preset:FireTongue').noise.frequency),4.2);
 await page.getByRole('textbox',{name:'预设名称',exact:true}).fill('ParticleEditorAcceptance');await page.getByRole('button',{name:'保存到浏览器',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('Tengxian.ParticleEffectPresets.v1')).ParticleEditorAcceptance.kind),'TengxianParticleEffect');
 await page.click('[data-vfx-tab="modules"]');await page.getByRole('button',{name:'添加粒子层',exact:true}).click();
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.customLayers.length),1);await page.getByRole('button',{name:'删除自建层',exact:true}).click();
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.customLayers.length),0);
 await page.evaluate(()=>{Tengxian.ParticleEditor.Seek(.6);Tengxian.ParticleEditor.selectedLayer='preset:FireTongue';Tengxian.ParticleEditor.RefreshLayers(true);Tengxian.StepFrames(3,0,true);});
 await page.locator('[data-particle-module="sizeOverLifetime"] > summary').click();await page.screenshot({path:path.join(out,'Scene_ParticleEditor.png')});
 const smokeFraming=await page.evaluate(async()=>{
   const g=Tengxian,e=g.ParticleEditor;e.SelectEffect('SmokeBlack');await g.Particles.Ready();e.FrameEffect();
   const {system}=[...g.Particles.systems.values()].find(entry=>entry.name.startsWith('SourceSmoke/')),m=system.modules;
   const anchor=g.Particles.renderer.volumes.pools.get(m.renderer.volumeAsset).asset.metadata.anchor;
   const angle=m.main.startRotation+m.renderer.volumeYaw,c=Math.cos(angle),s=Math.sin(angle),point=e.studio.orbit.target.clone(),projections=[];
   for(const yaw of [.9,2.47,4.04]){
     e.studio.orbit.yaw=yaw;e.studio.ApplyCamera();e.studio.camera.updateMatrixWorld(true);
     let maxY=0;for(let corner=0;corner<8;corner++){
       const x=((corner&1?1:0)-anchor[0])*m.renderer.bounds[0],y=((corner&2?1:0)-anchor[1])*m.renderer.bounds[1],z=((corner&4?1:0)-anchor[2])*m.renderer.bounds[2];
       point.set(x*c+z*s+system.position[0],y+system.position[1],-x*s+z*c+system.position[2]).project(e.studio.camera);maxY=Math.max(maxY,Math.abs(point.y));
     }
     projections.push({yaw,maxY});
   }
   return {height:m.renderer.bounds[1],distance:e.studio.orbit.dist,projections};
 });
 assert.ok(smokeFraming.projections.every(view=>view.maxY<.98),'the complete black smoke volume must fit from three directions: '+JSON.stringify(smokeFraming));
 const otherFraming=await page.evaluate(async()=>{
   const g=Tengxian,e=g.ParticleEditor,point=e.studio.orbit.target.clone(),report=[];
   for(const effect of ['FireSmall','FireMedium','GroundFire','BurningWreck','BurningHouse','VolumeFire','VolumeDustImpact','VolumeExplosion','ExplosionTank','BombSmall','BombHeavy']){
     e.SelectEffect(effect);await g.Particles.Ready();
     for(const time of [.05,1.2]){
       e.Seek(time);e.FrameEffect();
       for(const yaw of [.9,2.47,4.04]){
         e.studio.orbit.yaw=yaw;e.studio.ApplyCamera();e.studio.camera.updateMatrixWorld(true);let maxY=0;
         for(const pool of g.Particles.renderer.volumes.pools.values())for(let i=0;i<pool.capacity;i++){
           const owner=pool.owners[i],p=pool.records[i];if(!owner||!p||owner.time<p.birth||owner.time>=p.birth+p.life)continue;
           const sample=g.Particles.GetParticles([...g.Particles.systems].find(([,entry])=>entry.system===owner)[0],{limit:256})[owner.particles.indexOf(p)];
           if(!sample)continue;const a=pool.arrays,anchor=pool.asset.metadata.anchor,size=sample.size,angle=a.iSize[i*4+1]+a.iSize[i*4+2],c=Math.cos(angle),s=Math.sin(angle);
           for(let corner=0;corner<8;corner++){
             const x=((corner&1?1:0)-anchor[0])*a.iBounds[i*4]*size,y=((corner&2?1:0)-anchor[1])*a.iBounds[i*4+1]*size,z=((corner&4?1:0)-anchor[2])*a.iBounds[i*4+2]*size;
             point.set(x*c+z*s+sample.position[0],y+sample.position[1],-x*s+z*c+sample.position[2]).project(e.studio.camera);maxY=Math.max(maxY,Math.abs(point.y));
           }
         }
         report.push({effect,time,yaw,maxY});
       }
     }
   }
   return report;
 });
 assert.ok(otherFraming.every(view=>view.maxY<.98),'fire and transient volume bounds fit the preview: '+JSON.stringify(otherFraming.filter(view=>view.maxY>=.98)));
 const surfaceFraming=await page.evaluate(async()=>{
   const g=Tengxian,e=g.ParticleEditor,point=e.studio.orbit.target.clone(),report=[];
   for(const effect of ['ImpactWater','Incoming']){
     e.SelectEffect(effect);e.Seek(.12);e.FrameEffect();
     for(const yaw of [.9,2.47,4.04]){
       e.studio.orbit.yaw=yaw;e.studio.ApplyCamera();e.studio.camera.updateMatrixWorld(true);let maxY=0;
       for(const entry of g.Particles.systems.values()){
         const stream=g.Particles.renderer.streams.get(entry.system),shape=stream?.config.shape;if(!['ring','marker'].includes(shape))continue;
         for(const p of entry.system.particles){
           const s=p.packed;if(!s)continue;const r=Math.max(s.sizeStart,s.sizeEnd)*(shape==='ring'?1.4:1.04);
           for(let corner=0;corner<4;corner++){point.set(s.x+(corner&1?1:-1)*r,s.y,s.z+(corner&2?1:-1)*r).project(e.studio.camera);maxY=Math.max(maxY,Math.abs(point.y));}
         }
       }
       report.push({effect,yaw,maxY});
     }
   }
   return report;
 });
 assert.ok(surfaceFraming.every(view=>view.maxY<.98),'water and warning rings stay inside the viewport: '+JSON.stringify(surfaceFraming));
 const result=await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor,original=e.savedParticleEffects,worldBefore=JSON.stringify(original.Inspect());
   const result={editor:e.Inspect(),worldBefore,lightingSources:e.savedLighting.fireSources.size,glError:g.renderer.getContext().getError()};
   const savedLimit=e.savedStudioMaxDistance;e.SelectEffect('BombHeavy');result.bombCameraDistance=e.studio.orbit.dist;result.selectedEffect=e.effectList.Value();
   e.SelectEffect('ExplosionMortar');e.Seek(.1);const light=JSON.stringify(g.lights.GetEffectLightState());g.StepFrames(6,1/60,false);result.lightPause=light===JSON.stringify(g.lights.GetEffectLightState());
   g.editor.Close();g.editor.TogglePanel(false);result.restored=JSON.stringify(g.Particles.Inspect())===worldBefore;result.lightRestore=g.lights.fireSources.size===result.lightingSources;
   result.cameraLimitRestored=g.editor.studio.maxDistance===savedLimit;
   if(g.post.whiteboxScene){result.whiteboxRestored=g.post.whiteboxScene.config===g.post.whiteboxConfig;g.StepFrames(1,0,true);result.gameEffectsHidden=!g.vfx.root.visible;}
   return result;});
 await fs.writeFile(path.join(out,'Report.json'),JSON.stringify({result,smokeFraming,otherFraming,surfaceFraming,errors},null,2));
 assert.equal(result.worldBefore,baseline.particles);assert.equal(result.restored,true);assert.equal(result.lightPause,true);assert.equal(result.lightRestore,true);assert.equal(result.glError,0);assert.deepEqual(errors,[]);
 assert.ok(result.bombCameraDistance>80);assert.equal(result.selectedEffect,'BombHeavy');assert.equal(result.cameraLimitRestored,true);
 if(whitebox){assert.equal(result.whiteboxRestored,true);assert.equal(result.gameEffectsHidden,true);}
 console.log('ok particle editor: direct entry, native controls, curves, seek, preset roundtrip, light pause and world restoration');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
