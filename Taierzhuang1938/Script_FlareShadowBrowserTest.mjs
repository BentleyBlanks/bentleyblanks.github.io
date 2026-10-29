import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {FLARE_SHADOW} from './Data_Tuning_FlareEffects.mjs';
const root=path.resolve(import.meta.dirname,'..'),server=await ServeRoot(root,0),browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!/fonts\./.test(m.location()?.url||''))errors.push(m.text().slice(0,500));});
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/Probe.html?quality=high&preset=night&scene=street&gi=0`,{timeout:180000});
  await page.waitForFunction(()=>window.Probe?.state.ready,null,{timeout:300000});
  const report=await page.evaluate(async()=>{
    const p=Probe,T=await import('three'),M=await import('./Script_MaterialPatches.mjs');
    p.state.ready=false;p.scene.children.forEach(o=>o.visible=false);p.lights.ClearFires();
    const initialBytes=p.lights.clustered.dataArray.byteLength,metadataBytes=p.lights.clustered.metadataUnits*4,initialTexture=p.lights.clustered.dataTexture;
    const mat=new T.MeshStandardMaterial({color:0xaaaaaa,roughness:1,fog:false});
    M.ApplyPatches(mat,[M.MakeClusteredLightsPatch()]);
    const ground=new T.Mesh(new T.BoxGeometry(18,.2,18),mat);ground.position.y=-.1;ground.castShadow=true;p.scene.add(ground);
    const roof=new T.Mesh(new T.BoxGeometry(4,.2,4),mat);roof.position.y=4;roof.castShadow=true;p.scene.add(roof);
    const Add=x=>p.lights.AddFire({x,y:8,z:0},{color:0xffffff,intensity:350,radius:35,flicker:false,flareShadow:true});
    const first=Add(0);p.camera.position.set(7,3,9);p.camera.lookAt(0,0,0);
    p.post.SetTaaEnabled(false);p.post.SetAutoExposure(false);p.scene.fog=null;
    const Read=()=>[[0,0,0],[6,0,0]].map(v=>{
      const q=new T.Vector3(...v).project(p.camera),a=new Uint16Array(4);
      p.renderer.readRenderTargetPixels(p.post.targets.hdr,Math.round((q.x*.5+.5)*p.post.width),Math.round((q.y*.5+.5)*p.post.height),1,1,a);
      return Array.from(a).slice(0,3).map(T.DataUtils.fromHalfFloat).reduce((s,v)=>s+v,0);
    });
    const Frame=(on,n=3)=>{p.post.preset.flareShadows=on;p.StepFrames(n,0);return Read();};
    const clear=Frame(false),shadow=Frame(true);
    roof.position.x=9;const moved=Frame(true);roof.position.x=0;
    const second=Add(-1),twoClear=Frame(false),twoShadow=Frame(true,4);
    const pass=p.post.flareShadowsPass,updates=pass.stats.updates;
    const stable=[];for(let i=0;i<8;i++)stable.push(Frame(true,1));
    const updateCount=pass.stats.updates-updates;
    // Moving camera changes view-space coordinates without invalidating the other slot's map.
    p.camera.position.x+=.2;p.camera.lookAt(0,0,0);const cameraMoved=Frame(true,1);
    p.lights.RemoveFire(first);const oneRemaining=Frame(true,3);
    const mapsRemaining=pass.stats.maps,gl=p.renderer.getContext();
    const samplerTypes=new Set([gl.SAMPLER_2D,gl.SAMPLER_CUBE,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_2D_ARRAY,gl.SAMPLER_3D,gl.INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_2D]);
    let maxSamplers=0;
    for(const program of p.renderer.info.programs){let count=0;for(let i=0;i<gl.getProgramParameter(program.program,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(program.program,i);if(samplerTypes.has(u.type))count+=u.size;}maxSamplers=Math.max(maxSamplers,count);}
    const cost={...pass.stats},bytes=p.lights.clustered.dataArray.byteLength;
    p.lights.RemoveFire(second);Frame(true);
    return {clear,shadow,moved,twoClear,twoShadow,stable,updateCount,cameraMoved,oneRemaining,mapsRemaining,cost,bytes,initialBytes,metadataBytes,sameTexture:initialTexture===p.lights.clustered.dataTexture,
      resetMaps:pass.stats.maps,resetValid:p.lights.clustered.uniforms.uFlareShadowInfo.value.map(v=>v.w),
      maxSamplers,samplerLimit:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),gl:gl.getError()};
  });
  assert.ok(report.shadow[0]<report.clear[0]*.15,'Roof must block direct light');
  assert.ok(Math.abs(report.shadow[1]/report.clear[1]-1)<.02,'Unblocked ground must preserve the light');
  assert.ok(report.moved[0]>report.clear[0]*.98,'Moved roof must release its former shadow');
  assert.ok(report.twoShadow[0]<report.twoClear[0]*.15,'Both light maps must occlude');
  for(const sample of [...report.stable,report.cameraMoved])assert.ok(sample[0]<report.twoClear[0]*.15,'CPU metadata uploads must preserve the other GPU shadow slot');
  assert.equal(report.updateCount,8,'Two lights must still render only one map per frame');
  assert.equal(report.initialBytes,report.metadataBytes,'No selected flare must allocate no shadow band');
  assert.equal(report.bytes-report.initialBytes,FLARE_SHADOW.slots*FLARE_SHADOW.faces*FLARE_SHADOW.size**2*4);
  assert.equal(report.sameTexture,true,'Lazy GPU storage growth must preserve shared texture identity');
  assert.equal(report.mapsRemaining,1);assert.equal(report.resetMaps,0);assert.deepEqual(report.resetValid,new Array(FLARE_SHADOW.slots*FLARE_SHADOW.faces).fill(0));
  assert.ok(report.maxSamplers<=report.samplerLimit);assert.ok(report.cost.calls>2);assert.equal(report.gl,0);assert.deepEqual(errors,[]);
  await fs.mkdir(path.join(root,'tmp','Flare'),{recursive:true});
  await fs.writeFile(path.join(root,'tmp','Flare','Data_ShadowReport.json'),JSON.stringify(report,null,2));
  console.log('FlareShadowBrowserTest passed',JSON.stringify(report));
} finally {await browser.close();server.close();}
