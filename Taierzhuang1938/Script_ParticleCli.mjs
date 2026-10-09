// Agent particle API, using the actual game and renderer. No alternate preview implementation.
// node Taierzhuang1938/Script_ParticleCli.mjs --command=presets
// node Taierzhuang1938/Script_ParticleCli.mjs --command=inspect --label=Baseline
// node Taierzhuang1938/Script_ParticleCli.mjs --source=0 --distance=10 --label=Near
// node Taierzhuang1938/Script_ParticleCli.mjs --actions=tmp/ParticleActions.json --label=Iteration
// Actions are [{method:'Create',args:[{preset:'FireTongue',position:[0,1,0]}],as:'fire'},
// {method:'Configure',args:['$fire',{emission:{rateOverTime:20}}]},
// {method:'Simulate',args:['$fire',2,{restart:true}]}]. Use double quotes in JSON files.
// --base=http://127.0.0.1:8100 --quality=high --stage=4 --width=1440 --height=900
// --source=N uses the Nth existing burning wreck, --distance=10|28|70 keeps repeatable views.
// --distances=10,28,70 additionally captures several views without rebuilding the level.
// --editor-check opens/closes the real VFX studio and verifies game state restoration.
// --effects=FireMedium,SmokeBlack,ExplosionShell --times=0.05,0.35,1.2,3 captures production effects over time.
// --baseline=<git-ref> serves the changed source files from that revision for a reproducible comparison.
// Outputs: Frame.png, Report.json, Presets.json. Sources/controls are available on Tengxian.Particles.
import path from 'node:path';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const argv=process.argv.slice(2),Arg=(name,fallback)=>argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
if(argv.includes('--help')){console.log((await fs.readFile(import.meta.filename,'utf8')).split('\n').filter(l=>l.startsWith('//')).join('\n'));process.exit(0);}
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots','Particles',Arg('label','Capture'));
await fs.mkdir(out,{recursive:true});
const server=Arg('base','')?null:await ServeRoot(root,0),base=Arg('base','')||`http://127.0.0.1:${server.address().port}`;
const browser=await LaunchBrowser(),errors=[];let page;
try {
 page=await browser.newPage({viewport:{width:Number(Arg('width',1440)),height:Number(Arg('height',900))}});
 if(Arg('baseline','')) {
   const ref=Arg('baseline','');execFileSync('git',['rev-parse','--verify',ref+'^{commit}'],{cwd:root});
   const changed=execFileSync('git',['diff','--name-only',ref,'--','Taierzhuang1938'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/),overrides=new Map();
   for(const file of changed.filter(file=>/\.(mjs|html)$/.test(file))){try{overrides.set('/'+file,execFileSync('git',['show',ref+':'+file],{cwd:root,maxBuffer:20*1024*1024}));}catch{}}
   await page.route('**/Taierzhuang1938/**',route=>{
     const pathname=new URL(route.request().url()).pathname.replace(/\/$/,'/index.html'),body=overrides.get(pathname);
     return body?route.fulfill({contentType:pathname.endsWith('.html')?'text/html':'text/javascript',body}):route.continue();
   });
 }
 page.on('pageerror',e=>{errors.push(String(e));console.error(String(e));});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text().slice(0,500));console.error(m.text().slice(0,500));}});
 await page.goto(`${base}/Taierzhuang1938/?whitebox=p012&manual=1&shot=1&quality=${encodeURIComponent(Arg('quality','high'))}&missionStage=${encodeURIComponent(Arg('stage','4'))}`,{waitUntil:'domcontentloaded',timeout:240000});
 for(let attempt=0;attempt<10;attempt++){
   try{await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:30000});break;}
   catch(error){console.log('Waiting for game:',await page.locator('body').innerText().catch(()=>'(renderer busy)'));if(attempt===9)throw error;}
 }
 const actions=Arg('actions','')?JSON.parse(await fs.readFile(path.resolve(Arg('actions','')),'utf8')):[];
 const report=await page.evaluate(({source,distance,actions,command})=>{
   const g=window.Tengxian;g.state.menu=false;g.player.debug.invincible=true;g.StepFrames(60,1/60,false);
   const sources=[...g.vfx.smokeSources].filter(([id,s])=>s.backdrop&&s.fire>0).map(([id,s])=>({id,position:(s.firePosition||s.position).toArray(),particles:s.particleHandles}));
   if(source!==null) {
     const target=sources[source];if(!target)throw new Error('Unknown burning source '+source);
     const [tx,ty,tz]=target.position,x=tx+distance*.35,z=tz+distance,p=g.player.position;
     p.set(x,g.battlefield.GroundHeight(x,z)+.1,z);g.player.body?.Teleport(p.x,p.y,p.z);
     g.player.yaw=Math.atan2(x-tx,z-tz);g.player.pitch=-.08;g.StepFrames(20,1/60,true);
   }
   const allowed=['Create','Configure','Play','Pause','Stop','Clear','Emit','Simulate','Move','Inspect','GetParticles','Export','Import','Remove'];
   const refs={},results=[];
   for(const action of actions) {
     if(!allowed.includes(action.method))throw new Error('Unknown particle action '+action.method);
     const args=(action.args||[]).map(value=>typeof value==='string'&&value.startsWith('$')?refs[value.slice(1)]:value);
     const result=g.Particles[action.method](...args);if(action.as)refs[action.as]=result.id;results.push({method:action.method,result});
   }
   g.StepFrames(2,0,true);
   return {sources,results,modules:g.Particles.Modules(),presets:g.Particles.Presets(),particles:g.Particles.Inspect(),
     renderer:g.renderer.info.render,quality:g.vfx.quality,command};
 },{source:Arg('source','')===''?null:Number(Arg('source','')),distance:Number(Arg('distance',10)),actions,command:Arg('command','inspect')});
 await page.screenshot({path:path.join(out,'Frame.png')});
 const views=[];
 for(const distance of Arg('distances','').split(',').filter(Boolean).map(Number)){
   if(!Number.isFinite(distance)||distance<=0)throw new Error('distances must be positive metres');
   await page.evaluate(({target,distance})=>{
     const g=window.Tengxian,[tx,ty,tz]=target,x=tx+distance*.35,z=tz+distance;
     g.player.position.set(x,g.battlefield.GroundHeight(x,z)+.1,z);g.player.body?.Teleport(x,g.player.position.y,z);
     g.player.yaw=Math.atan2(x-tx,z-tz);g.player.pitch=-.08;g.StepFrames(4,1/60,true);
   },{target:report.sources[Number(Arg('source',0))].position,distance});
   const file=`View${distance}m.png`;await page.screenshot({path:path.join(out,file)});views.push({distance,file});
 }
 report.views=views;
 if(Arg('effects','')) {
   report.effectFrames=[];
   for(const effect of Arg('effects','').split(','))for(const seconds of Arg('times','0.05,0.35,1.2,3').split(',').map(Number)){
     if(!/^[A-Za-z0-9]+$/.test(effect)||!Number.isFinite(seconds)||seconds<0||seconds>20)throw new Error('Invalid effect capture');
     const state=await page.evaluate(async({effect,seconds})=>{
       const g=window.Tengxian;
       if(g.editor.ActiveId!=='vfx')g.editor.Open('vfx');
       const editor=g.editor.active;
       if(!editor.Effects().some(entry=>entry.id===effect))throw new Error('Unknown editor effect '+effect);
       editor.Stop();editor.loop=false;
       g.vfx.ClearParticles();g.vfx.particles.Resume();
       const {Mulberry32}=await import('./Script_Noise.mjs');g.vfx.random=Mulberry32(1938);g.vfx.bloodEffects.random=g.vfx.random;
       editor.effectId=effect;editor.Play();editor.FrameEffect();
       const frames=Math.round(seconds*60);g.StepFrames(frames,1/60,false);g.post.NotifyCameraCut();g.StepFrames(8,0,true);
       return {effect,seconds,particles:g.Particles.Inspect()};
     },{effect,seconds});
     const file=`${effect}_${Math.round(seconds*1000)}ms.png`;await page.screenshot({path:path.join(out,file)});report.effectFrames.push({...state,file});
   }
   await page.evaluate(()=>{const g=window.Tengxian;g.editor.Close();g.editor.TogglePanel(false);});
 }
 if(argv.includes('--editor-check'))report.editor=await page.evaluate(()=>{
   const g=window.Tengxian,original=g.Particles,sources=g.vfx.smokeSources,before=JSON.stringify(original.Inspect());
   g.editor.Open('vfx');g.StepFrames(30,1/60,true);
   const result={isolated:g.Particles!==original,frozen:before===JSON.stringify(original.Inspect()),
     previewAlive:g.Particles.Inspect().entries.some(e=>e.particleCount>0)};
   g.editor.Close();result.restored=g.Particles===original&&g.vfx.smokeSources===sources&&before===JSON.stringify(original.Inspect());
   g.editor.TogglePanel(false);g.StepFrames(2,1/60,true);result.resumed=before!==JSON.stringify(original.Inspect());return result;
 });
 await fs.writeFile(path.join(out,'Report.json'),JSON.stringify({...report,errors},null,2));
 await fs.writeFile(path.join(out,'Presets.json'),JSON.stringify({presets:report.presets,modules:report.modules},null,2));
 console.log(JSON.stringify({out,errors,...(Arg('command','inspect')==='presets'?{presets:report.presets,modules:report.modules}:{sources:report.sources.length,pools:report.particles.pools,systems:report.particles.entries.length})}));
 if(errors.length||report.editor&&Object.values(report.editor).some(value=>value!==true))process.exitCode=1;
} catch(error) {
 if(page)await page.screenshot({path:path.join(out,'Failure.png'),timeout:10000}).catch(()=>{});
 await fs.writeFile(path.join(out,'Failure.json'),JSON.stringify({error:String(error),errors},null,2));throw error;
} finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
