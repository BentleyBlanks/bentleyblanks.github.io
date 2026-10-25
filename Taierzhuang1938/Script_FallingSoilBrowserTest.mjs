import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots','FallingSoil');
const baseArg=process.argv.find(arg=>arg.startsWith('--base='))?.slice(7),online=process.argv.includes('--online');
await fs.mkdir(out,{recursive:true});const server=baseArg?null:await ServeRoot(root,0),browser=await LaunchBrowser({extraArgs:['--mute-audio']});
const base=baseArg||'http://127.0.0.1:'+server.address().port;
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],report={base,online};
 page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text().slice(0,700));console.log('CONSOLE ERROR',m.text().slice(0,700));}});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));});
 const Open=async quality=>{
   await page.goto(base+'/Taierzhuang1938/?editor=tools&tool=vfx&effect=SoilCeilingShake&manual=1&menu=0&audio=0'+(quality?'&quality='+quality:''),{waitUntil:'domcontentloaded',timeout:300000});
   try{await page.waitForFunction(()=>!!window.Tengxian?.ParticleEditor?.panel,null,{timeout:300000});}
   catch(error){console.log('STARTUP',await page.locator('body').innerText());await Capture('StartupFailure');throw error;}
   console.log('editor ready',quality||'whitebox');
   await page.evaluate(()=>{const e=Tengxian.ParticleEditor;e.loop=false;e.SelectEffect('SoilCeilingShake');});
 };
 const Capture=async label=>{const bytes=await page.screenshot();await fs.writeFile(path.join(out,label+'.png'),bytes);
   await sharp(bytes).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toFile(path.join(out,label+'Preview.jpg'));};
 const Pixels=(part='all')=>page.evaluate(async part=>{
   const THREE=await import('three'),g=Tengxian,e=g.ParticleEditor,r=g.renderer,size=r.getDrawingBufferSize(new THREE.Vector2());
   // Compare authored scene materials at one frozen time without temporal post
   // jitter or exposure changes being mistaken for particle pixels.
   const target=new THREE.WebGLRenderTarget(size.x,size.y),previous=r.getRenderTarget(),autoClear=r.autoClear;
   const Read=()=>{r.setRenderTarget(target);r.autoClear=true;r.clear();r.render(g.scene,g.camera);const data=new Uint8Array(size.x*size.y*4);r.readRenderTargetPixels(target,0,0,size.x,size.y,data);return data;};
   const object=part==='clods'?g.Particles.FallingSoil.Get(e.soil.id).root:g.vfx.particles.root;
   const solids=g.Particles.FallingSoil.Get(e.soil.id).root;
   const on=Read();object.visible=false;if(part==='all')solids.visible=false;const off=Read();object.visible=true;solids.visible=true;r.setRenderTarget(previous);r.autoClear=autoClear;target.dispose();g.StepFrames(1,0,true);
   let changed=0;for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-off[i])+Math.abs(on[i+1]-off[i+1])+Math.abs(on[i+2]-off[i+2])>15)changed++;
   return {changed,soil:e.soil.Inspect(),quality:g.GraphicsProfile.Inspect().profile};
 },part);
 await Open('high');
 const baseline=await page.evaluate(()=>JSON.stringify(Tengxian.ParticleEditor.savedParticleEffects.Inspect()));
 const baselineSolidRoots=await page.evaluate(()=>Tengxian.scene.children.filter(o=>o.name==='FallingSoilSolidRoot').length);
 report.presets=[];
 for(const preset of ['SoilCeilingShake','SoilPlankLeak','SoilBrokenEdge']){
   await page.evaluate(preset=>{const e=Tengxian.ParticleEditor;e.SelectEffect(preset);e.Seek(preset==='SoilPlankLeak'?2.65:1.2);Tengxian.StepFrames(2,0,true);},preset);
   const result=await Pixels();assert.ok(result.changed>35,'real sand/clod/dust pixels: '+JSON.stringify(result));
   await Capture(preset);console.log('preset pixels',preset,JSON.stringify(result));
   assert.ok(result.soil.live.grains>0&&result.soil.live.clods>0&&result.soil.live.dust>0,'all three layers are alive in '+preset+': '+JSON.stringify(result.soil));
   assert.ok(result.soil.impacts>0,'clods hit ground or beam');report.presets.push({preset,...result});
 }
 await page.evaluate(()=>{const e=Tengxian.ParticleEditor;e.SelectEffect('SoilCeilingShake');e.Seek(1.1);e.soil.Frame(true);Tengxian.StepFrames(3,0,true);});await Capture('NearGrainsClods');
 report.nearClods=await Pixels('clods');console.log('near clod pixels',JSON.stringify(report.nearClods));assert.ok(report.nearClods.changed>100,'close camera exposes real faceted clod geometry, clear of the beam');
 report.clodPrepass=await page.evaluate(()=>{const g=Tengxian,e=g.ParticleEditor,entry=g.Particles.FallingSoil.Get(e.soil.id);g.StepFrames(2,0,true);
   return {registered:[...entry.meshes.values()].filter(mesh=>g.post.prepassPass._objectHistory.has(mesh)).length,solidRootOutsideVfx:entry.root.parent.parent!==g.vfx.root};});
 assert.ok(report.clodPrepass.registered>0&&report.clodPrepass.solidRootOutsideVfx,'real opaque clods participate in automatic world motion history');
 report.replay=await page.evaluate(()=>{
   const g=Tengxian,e=g.ParticleEditor,api=g.Particles.FallingSoil;
   const Samples=()=>JSON.stringify(['grains','clods','dust'].map(layer=>api.Samples(e.soil.id,layer,256)));
   e.Seek(1.3);const first=Samples(),impacts=e.soil.Inspect().grainImpacts;e.Seek(.3);e.Seek(1.3);
   const repeated=Samples(),t=e.previewTime;g.StepFrames(12,1/60,true);const frozen=e.previewTime===t;
   e.Step();return {same:first===repeated,impactsSame:impacts===e.soil.Inspect().grainImpacts||e.previewTime>t,paused:frozen,step:e.previewTime-t};
 });
 assert.ok(report.replay.same&&report.replay.paused);assert.ok(Math.abs(report.replay.step-1/60)<1e-8);
 report.framePartition=await page.evaluate(()=>{
   const e=Tengxian.ParticleEditor,particles=Tengxian.Particles,api=particles.FallingSoil,id=e.soil.id;
   const Samples=()=>JSON.stringify(['grains','clods','dust'].map(layer=>api.Samples(id,layer,256)));
   api.Seek(id,0);api.Play(id);for(let i=0;i<12;i++)particles.Update(.1);const coarse=Samples();
   api.Seek(id,0);api.Play(id);for(let i=0;i<120;i++)particles.Update(.01);const fine=Samples();
   e.Seek(1.3);return coarse===fine;
 });assert.equal(report.framePartition,true,'shared collision budgets are invariant to render frame rate');
 await page.click('[data-vfx-tab="soil"]');
 const height=page.locator('[data-soil-field="emitter.position.1"]');await height.fill('4.25');await height.press('Tab');
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.soil.Config().emitter.position[1]),4.25);
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.soil.source.position.y),4.25,'numeric input moves the actual emission reference');
 await page.locator('[data-soil-group="grains"] > summary').click();
 await page.locator('[data-soil-field="grains.enabled"]').click();
 assert.equal(await page.evaluate(()=>Tengxian.ParticleEditor.soil.Inspect().live.grains),0,'layer switches affect the true simulation immediately');
 await page.locator('[data-soil-field="grains.enabled"]').click();
 await page.click('[data-vfx-tab="presets"]');await page.getByRole('button',{name:'生成 JSON',exact:true}).click();
 const exported=JSON.parse(await page.locator('[data-vfx-preset]').inputValue());assert.equal(exported.soil.config.emitter.position[1],4.25);
 await page.evaluate(()=>Tengxian.ParticleEditor.SelectEffect('MuzzleRifle'));
 await page.click('[data-vfx-tab="presets"]');await page.getByRole('button',{name:'导入 JSON',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(Tengxian.ParticleEditor.Export()))),exported,'complete preset survives another effect and JSON import');
 await page.click('[data-vfx-tab="presets"]');await page.getByRole('textbox',{name:'预设名称',exact:true}).fill('FallingSoilAcceptance');
 await page.getByRole('button',{name:'保存到浏览器',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('Tengxian.ParticleEffectPresets.v1')).FallingSoilAcceptance.soil.config.emitter.position[1]),4.25);
 report.lifecycle=await page.evaluate(()=>{
   const g=Tengxian,e=g.ParticleEditor;e.SelectEffect('SoilCeilingShake');e.Seek(1);g.StepFrames(3,0,true);
   const before={geometry:g.renderer.info.memory.geometries,systems:g.Particles.systems.size};
   for(let i=0;i<8;i++){e.Seek(1);g.StepFrames(1,0,true);}
   const after={geometry:g.renderer.info.memory.geometries,systems:g.Particles.systems.size};
   const model=g.Particles.FallingSoil.Get(e.soil.id).simulation;e.loop=false;e.paused=false;g.Particles.FallingSoil.Stop(e.soil.id);g.StepFrames(420,1/60,false);
   const drained=e.soil.Inspect();e.loop=true;e.Seek(12);e.paused=false;e.Update(1/60);const loopTime=e.previewTime;
   return {before,after,drained,loopTime};
 });
 assert.deepEqual(report.lifecycle.after,report.lifecycle.before,'replay releases sample meshes and particle streams');
 assert.equal(report.lifecycle.drained.active,false);assert.ok(report.lifecycle.loopTime<.1,'loop waits for natural tail, then restarts');
 report.performance=await page.evaluate(()=>{
   const g=Tengxian,e=g.ParticleEditor;e.loop=false;e.SelectEffect('SoilCeilingShake');e.Seek(.6);e.paused=false;
   const start=performance.now();g.StepFrames(36,1/60,true);const elapsed=performance.now()-start;
   return {millisecondsPerFrame:elapsed/36,renderer:{...g.renderer.info.render},soil:e.soil.Inspect()};
 });
 assert.ok(report.performance.soil.live.clods<=48&&report.performance.soil.live.grains<=6000);
 const originalUnchanged=await page.evaluate(baseline=>JSON.stringify(Tengxian.ParticleEditor.savedParticleEffects.Inspect())===baseline,baseline);assert.equal(originalUnchanged,true,'the gameplay particle manager is frozen during preview');
 report.restored=await page.evaluate(()=>{const g=Tengxian,original=g.ParticleEditor.savedParticleEffects;g.editor.Close();return {same:g.vfx.particles===original,soil:g.Particles.FallingSoil.entries.size,solidRoots:g.scene.children.filter(o=>o.name==='FallingSoilSolidRoot').length,references:g.scene.getObjectByName('FallingSoilPreviewReferences')!==undefined};});
 assert.ok(report.restored.same&&!report.restored.references);
 assert.equal(report.restored.solidRoots,baselineSolidRoots-1,'the preview solid root is released alongside its particle fork');
 if(!online){
   await Open();await page.evaluate(()=>{Tengxian.ParticleEditor.Seek(1.2);Tengxian.StepFrames(2,0,true);});
   report.whitebox=await Pixels();assert.equal(report.whitebox.quality,'whitebox');assert.ok(report.whitebox.changed>35,'default whitebox preview keeps falling soil visible');await Capture('DefaultWhitebox');
   const quality=await page.evaluate(()=>{Tengxian.editor.Close();return Tengxian.GraphicsProfile.Inspect();});assert.equal(quality.config.effects,false,'exit restores hidden-VFX preference');
 }
 assert.deepEqual(errors,[],'no runtime/WebGL errors');report.errors=errors;
 await fs.writeFile(path.join(out,online?'Report_Online.json':'Report.json'),JSON.stringify(report,null,2));console.log('ok falling soil browser:',JSON.stringify(report));
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
