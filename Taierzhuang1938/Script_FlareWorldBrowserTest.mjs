// Actual city geometry and audio engine. No new fixture roof or mock audio nodes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'_shots','FlareWorld');
await fs.mkdir(out,{recursive:true});const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,500));});
 await page.addInitScript(()=>{localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?phase=4&quality=high&manual=1&menu=0`,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>!!window.Tengxian?.state?.ready,null,{timeout:600000});
 await page.locator('#bootStart').click();
 await page.evaluate(()=>{Tengxian.audio.Unlock();Tengxian.editor.Open('shotCamera');Tengxian.camera.far=2000;Tengxian.camera.fov=55;Tengxian.camera.updateProjectionMatrix();Tengxian.Debug.ApplySky('firstLevelNight');Tengxian.graphics.autoQuality=false;Tengxian.ApplyGraphics();});
 await page.waitForFunction(()=>window.Tengxian.audio.sfxReady,null,{timeout:90000});
 assert.equal(await page.locator('#boot').evaluate(e=>e.classList.contains('gone')),true,'Screenshots must be the world, not the boot overlay');
 await page.addStyleTag({content:'#edRoot,.hud{visibility:hidden!important}'});
 const Capture=async name=>{const bytes=await page.screenshot();await fs.writeFile(path.join(out,name+'.png'),bytes);await sharp(bytes).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:80}).toFile(path.join(out,name+'Preview.jpg'));};
 const setup=await page.evaluate(async()=>{
  const T=await import('three'),g=Tengxian,s=g.vfx.flareSurfaces;s.Refresh();
  const from={x:210,z:-62},d=s.data;let best=null;
  for(let i=0;i<d.length;i+=15){const x=(d[i]+d[i+3]+d[i+6])/3,y=(d[i+1]+d[i+4]+d[i+7])/3,z=(d[i+2]+d[i+5]+d[i+8])/3,dist=Math.hypot(x-from.x,z-from.z);
   if(y<2||y>10||best&&dist>=best.dist)continue;
   const h=s.TraceSegment({x,y:30,z},{x,y:-1,z});if(!h||h.normal[1]<.7)continue;
   if(![[.55,0],[-.55,0],[0,.55],[0,-.55]].every(([dx,dz])=>{const p=s.TraceSegment({x:x+dx,y:30,z:z+dz},{x:x+dx,y:-1,z:z+dz});return p&&p.point.y>2;}))continue;
   best={dist,...h};
  }
  if(!best)throw new Error('No supported roof patch in the real night scene');
  window.FlareWorldPose=(eye,target)=>{g.camera.position.set(...eye);g.camera.lookAt(...target);const e=new T.Euler().setFromQuaternion(g.camera.quaternion,'YXZ');g.editor.flycam.yaw=e.y;g.editor.flycam.pitch=e.x;g.post.NotifyCameraCut();g.StepFrames(3,0,true);g.audio.SetListener(g.camera);};
  FlareWorldPose([210,1.8,-62],[235,3,-65]);
  const k=.45/4.515,at={x:(best.point.x+k*from.x)/(1+k),z:(best.point.z+k*from.z)/(1+k)};
  window.flareWorldVoices=[];const original=g.audio.Play.bind(g.audio);
  g.audio.Play=(name,options)=>{const v=original(name,options);if(name.startsWith('flare')&&v)flareWorldVoices.push(v);return v;};
  g.flare.Reset();const id=g.flare.LaunchFlare({preset:'Illumination',from,at,driftMS:0,swayM:0});
  window.flareWorldData={id,from,at,roof:best.point,originalPlay:original};
  const f=g.flare.flares[0];return {id,index:s.Inspect(),landing:f.landing,obstructed:f.launchObstructed,quality:g.GraphicsProfile.Inspect().profile,environment:g.editor.host.game.GetEnvironmentState()};
 });
 assert.equal(setup.quality,'high');assert.equal(setup.environment.name,'firstLevelNight');assert.ok(!setup.obstructed&&setup.landing.position.y>2&&setup.landing.surface==='solid');
 console.log('ok actual roof plan',JSON.stringify(setup));
 await Capture('Launch');
 await page.evaluate(()=>{for(let i=0;i<60;i++)Tengxian.flare.Update(.1);Tengxian.StepFrames(4,0,true);});
 await Capture('StreetLit');
 const occlusion=await page.evaluate(async()=>{
  const g=Tengxian,T=await import('three'),r=g.renderer,gl=r.getContext(),target=g.post.targets.hdr;
  const Read=on=>{g.post.preset.flareShadows=on;g.StepFrames(3,0,true);const a=new Uint16Array(target.width*target.height*4);r.readRenderTargetPixels(target,0,0,target.width,target.height,a);return a;};
  const on=Read(true),off=Read(false);let blocked=0,unchanged=0,peak=0;
  for(let i=0;i<on.length;i+=4){const a=T.DataUtils.fromHalfFloat(on[i])+T.DataUtils.fromHalfFloat(on[i+1])+T.DataUtils.fromHalfFloat(on[i+2]);
   const b=T.DataUtils.fromHalfFloat(off[i])+T.DataUtils.fromHalfFloat(off[i+1])+T.DataUtils.fromHalfFloat(off[i+2]);
   if(b>.04&&b-a>b*.2){blocked++;peak=Math.max(peak,b-a);}else if(b>.04&&Math.abs(a-b)<.002)unchanged++;
  }
  g.post.preset.flareShadows=true;g.StepFrames(3,0,true);
  const exposure=g.post.exposurePass.ReadState(r),cost={...g.post.flareShadowsPass.stats};
  const times={on:[],off:[]};
  for(let i=0;i<6;i++)for(const enabled of (i%2?[true,false]:[false,true])){
   g.post.preset.flareShadows=enabled;gl.finish();const start=performance.now();g.StepFrames(1,0,true);gl.finish();
   times[enabled?'on':'off'].push(performance.now()-start);
  }
  const Median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
  g.post.preset.flareShadows=true;g.StepFrames(1,0,true);
  return {blocked,unchanged,peak,exposure,cost,frameMs:{with:Median(times.on),without:Median(times.off)},gl:gl.getError()};
 });
 assert.ok(occlusion.blocked>50&&occlusion.unchanged>100,'Real city must contain both occluded and unblocked illuminated receivers: '+JSON.stringify(occlusion));
 assert.ok(occlusion.exposure.gain>0&&occlusion.exposure.gain<1,'Bright flare meters the scene without lifting the night');
 assert.equal(occlusion.gl,0);console.log('ok real city light occlusion',JSON.stringify(occlusion));
 // Wait for the real audio automation target to settle, then inspect its panner.
 await new Promise(r=>setTimeout(r,400));
 const sound=await page.evaluate(()=>{const g=Tengxian;g.flare.Update(0);const f=g.flare.flares[0],v=[...flareWorldVoices].reverse().find(v=>v.name==='flareBurn'&&v.nodes.length);
  return {ready:g.audio.sfxReady,state:g.audio.ctx.state,voices:flareWorldVoices.map(v=>({name:v.name,nodes:v.nodes.length})),
   position:v?.panner?{x:v.panner.positionX.value,y:v.panner.positionY.value,z:v.panner.positionZ.value}:null,target:{...f.pos},sampled:!!v?.nodes.some(n=>n.buffer?.duration>0)};});
 assert.ok(sound.sampled&&sound.state==='running'&&sound.position,'Actual recorded burn voice and spatial panner must exist');
 assert.ok(Math.hypot(sound.position.x-sound.target.x,sound.position.y-sound.target.y,sound.position.z-sound.target.z)<.15,JSON.stringify(sound));
 console.log('ok spatial burn sound',JSON.stringify(sound));
 await page.evaluate(()=>Tengxian.StepFrames(60,1/30,true));
 await Capture('StreetAdapted');
 await page.evaluate(()=>{const f=Tengxian.flare.flares[0];while(f.t<f.outAt+.2)Tengxian.flare.Update(.05);Tengxian.StepFrames(4,0,true);});
 await new Promise(r=>setTimeout(r,100));
 assert.ok(await page.evaluate(()=>flareWorldVoices.filter(v=>v.name==='flareBurn').every(v=>v.nodes.length===0)),'Burn voices must stop at extinction');
 await Capture('StreetDark');
 const roof=await page.evaluate(async()=>{const g=Tengxian,f=g.flare.flares[0],T=await import('three');while(f.t<f.landing.t+1.2)g.flare.Update(.05);
  FlareWorldPose([f.pos.x+4,f.pos.y+2.5,f.pos.z+5],[f.pos.x,f.pos.y,f.pos.z]);
  const hit=g.vfx.flareSurfaces.TraceSegment({x:f.pos.x,y:f.pos.y+.2,z:f.pos.z},{x:f.pos.x,y:f.pos.y-.5,z:f.pos.z});
  const v=[...g.vfx.flareVisuals.items][0],n=f.landing.normal;
  const ray=new T.Raycaster(),meshes=g.vfx.flareSurfaces.meshes.filter(m=>g.vfx.flareSurfaces.Visible(m));
  const Height=p=>{ray.set(new T.Vector3(p.x,p.y+.4,p.z),new T.Vector3(0,-1,0));ray.far=1;return ray.intersectObjects(meshes,false)[0]?.point.y;};
  v.cloth.updateWorldMatrix(true,false);const p=v.cloth.geometry.attributes.position,gaps=[];
  for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/24))){const q=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(v.cloth.matrixWorld),y=Height(q);if(y!=null)gaps.push(q.y-y);}
  return {landed:f.landed,position:{...f.pos},visibleRoof:hit?.point,nativeRoofY:Height(f.pos),clothGaps:gaps,normal:n,canopyVisible:v.canopy.visible};});
 assert.ok(roof.landed&&roof.visibleRoof&&roof.canopyVisible);
 await fs.writeFile(path.join(out,'Data_ContactProbe.json'),JSON.stringify(roof,null,2));
 assert.ok(roof.position.y-roof.visibleRoof.y>=0&&roof.position.y-roof.visibleRoof.y<.02,'Candle is within 2 cm of the rendered roof, not only an approximate collider');
 assert.ok(Math.abs(roof.position.y-roof.nativeRoofY)<.02,'Full rendered roof, including raised tiles, agrees with candle contact: '+JSON.stringify(roof));
 assert.ok(roof.clothGaps.length>12&&Math.min(...roof.clothGaps)>-.005,'Collapsed cloth vertices must remain above the actual tile rows: '+JSON.stringify(roof.clothGaps));
 await Capture('RoofContact');console.log('ok real roof contact',JSON.stringify(roof));
 await page.evaluate(()=>{const g=Tengxian,f=g.flare.flares[0];g.Debug.ApplySky('overcast');g.post.exposurePass.transientWeight=0;g.post.exposurePass.RequestReset();g.flare.Update(0);FlareWorldPose([f.pos.x+1.3,f.pos.y+1.2,f.pos.z+1.5],[f.pos.x,f.pos.y,f.pos.z]);});
 await Capture('RoofContactDay');
 // Actual street receivers, including a weak red source and simultaneous
 // sources. Keep nominal cd separate from environment renderer units.
 const signals=await page.evaluate(async()=>{
  const g=Tengxian,T=await import('three');g.flare.Reset();g.Debug.ApplySky('firstLevelNight');g.post.SetTaaEnabled(false);
  FlareWorldPose([210,1.8,-62],[235,3,-65]);
  g.flare.LaunchFlare({preset:'SignalRed',from:{x:210,z:-62},at:{x:235,z:-65},driftMS:0});
  for(let i=0;i<25;i++)g.flare.Update(.1);
  const f=g.flare.flares[0],rt=g.post.targets.hdr;
  const Read=()=>{g.StepFrames(4,0,true);const a=new Uint16Array(rt.width*Math.floor(rt.height/2)*4);g.renderer.readRenderTargetPixels(rt,0,0,rt.width,Math.floor(rt.height/2),a);return a;};
  const on=Read(),move=g.flare.host.MoveLight;g.flare.host.MoveLight=()=>{};g.lights.UpdateFire(f.lightHandle,{intensity:0});g.lights.Update(0,0,g.camera.position);const off=Read();g.flare.host.MoveLight=move;g.flare.StepLight(f);
  let redReceivers=0,redSum=0;for(let i=0;i<on.length;i+=4){const r=T.DataUtils.fromHalfFloat(on[i])-T.DataUtils.fromHalfFloat(off[i]),green=T.DataUtils.fromHalfFloat(on[i+1])-T.DataUtils.fromHalfFloat(off[i+1]);if(r>.001&&r>green*4){redReceivers++;redSum+=r;}}
  const signalHeight=f.pos.y;
  g.flare.LaunchFlare({preset:'Illumination',from:{x:210,z:-62},at:{x:245,z:-65},driftMS:0});
  const excess=g.flare.LaunchFlare({preset:'SignalRed',from:{x:210,z:-62},at:{x:225,z:-74},driftMS:0});
  for(const [i,flare] of g.flare.flares.entries()){flare.t=[3,7,5][i];g.flare.StepPhase(flare);g.flare.Place(flare,0);g.flare.StepLight(flare);}
  g.post.SetTaaEnabled(true);g.StepFrames(30,0,true);
  return {redReceivers,redSum,signalHeight,active:g.flare.flares.length,visuals:g.vfx.flareVisuals.items.size,excess,
   phases:g.flare.flares.map(f=>f.flickerPhase),maps:g.post.flareShadowsPass.stats.maps,gl:g.renderer.getContext().getError()};
 });
 assert.ok(signals.redReceivers>100&&signals.redSum>1,'A high red signal must illuminate actual street surfaces: '+JSON.stringify(signals));
 assert.equal(signals.active,2);assert.equal(signals.visuals,2);assert.equal(new Set(signals.phases).size,2);
 assert.equal(signals.excess,null,'The existing two-active-flare budget must reject a third launch');
 assert.ok(signals.maps<=2,'Multiple sources stay inside the bounded shadow atlas');assert.equal(signals.gl,0);
 await Capture('StreetMultiple');console.log('ok street red and simultaneous sources',JSON.stringify(signals));
 const cleared=await page.evaluate(()=>{const g=Tengxian;g.flare.Reset();g.audio.Play=flareWorldData.originalPlay;return {visuals:g.vfx.flareVisuals.items.size,voices:flareWorldVoices.filter(v=>v.nodes.length>0).length,sight:g.flare.SightScale};});
 assert.deepEqual(cleared,{visuals:0,voices:0,sight:1});assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'Data_WorldReport.json'),JSON.stringify({setup,sound,roof,occlusion,signals,cleared,errors},null,2));console.log('FlareWorldBrowserTest passed');
}finally{await browser.close();server.close();}
