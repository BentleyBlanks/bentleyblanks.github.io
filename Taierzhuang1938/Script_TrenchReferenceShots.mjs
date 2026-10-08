// Whole-network material evidence. Images stay in an ignored or external output directory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { LaunchBrowser } from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import { CompileTrenchNetwork } from './Script_TrenchPlan.mjs';
import { MISSION_TRENCH_NETWORK } from './Data_FirstLevelMissionTrenches.mjs';
const Arg=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.split('=').slice(1).join('=')||fallback;
const out=path.resolve(Arg('out','Taierzhuang1938/_shots/TrenchReference'));
const base=Arg('base-url','http://127.0.0.1:8098'),quality=Arg('quality','high');
const focus=Arg('focus','').split(',').filter(Boolean);
const detailVariants=process.argv.includes('--detail-variants');
const pickPoints=Arg('pick','').split(':').filter(Boolean).map(pair=>pair.split(',').map(Number));
const plan=CompileTrenchNetwork(MISSION_TRENCH_NETWORK);
const shots=[
{id:'CrestLow',x:-18,z:-48,h:1.35,yaw:1.45,pitch:-.15,fov:65},
{id:'CrestAlong',x:-20,z:-37,h:1.5,yaw:.22,pitch:-.25,fov:65},
{id:'Communication',x:-24,z:-45,h:1.65,yaw:0,pitch:-.1,fov:65},
{id:'EarthFace',x:-24,z:-51,h:1.5,yaw:1.15,pitch:-.15,fov:60},
{id:'Overlook',x:-33,z:-43,h:8,yaw:-2.55,pitch:-.65,fov:58},
{id:'BunkerTrench',x:-7,z:-112.8,h:1.65,yaw:-1.53,pitch:-.12,fov:65},
{id:'RightApproach',x:4,z:-143,h:1.65,yaw:-1.45,pitch:-.12,fov:65},
];
for(const segment of plan.segments){
 const stations=segment.stations;
 const st=stations[Math.floor(stations.length*.48)];
 if(!st)continue;
 shots.push({id:'Network_'+segment.id,segment:segment.id,x:st.x,z:st.z,h:1.55,
  yaw:Math.atan2(-st.tx,-st.tz)+.23,pitch:-.18,fov:68});
}
await fs.mkdir(out,{recursive:true});
const browser=await LaunchBrowser({extraArgs:['--mute-audio']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],consoleErrors=[],captures=[];
page.on('pageerror',e=>{errors.push(String(e));console.error('PAGE',String(e));});
page.on('console',m=>{if(m.type()==='error'){consoleErrors.push(m.text().slice(0,600));console.error('CONSOLE',m.text().slice(0,600));}});
try{
 await page.goto(base+'/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&missionStage=7&quality='+quality+'&scale=small',{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:300000});
 await page.evaluate(()=>window.Tengxian.Debug.OpenEditor('samplePoints'));
 for(const shot of shots){
  if(focus.length&&!focus.includes(shot.id))continue;
  const pose=await page.evaluate(s=>{
   const g=window.Tengxian,tool=g.editor.active;
   tool.host.SetViewmodelVisible?.(false);
   const pose=tool.ApplyPose({...s,y:null,phase:null,far:null});
   document.getElementById('edRoot')?.classList.add('off');
   g.StepFrames(32,0,true);
   return pose;
  },shot);
  await page.screenshot({path:path.join(out,shot.id+'.png')});
  const picks=pickPoints.length?await page.evaluate(async points=>{
   const {Raycaster,Vector2}=await import('three'),g=window.Tengxian,ray=new Raycaster();
   return points.map(([x,y])=>{
    ray.setFromCamera(new Vector2(x/innerWidth*2-1,1-y/innerHeight*2),g.camera);
    return {pixel:[x,y],hits:ray.intersectObjects(g.battlefield.meshes,true).slice(0,3).map(hit=>{
     const layers=hit.object.geometry.attributes.terrainLayers;
     return {mesh:hit.object.name,material:hit.object.material.name,point:hit.point.toArray(),
      gap:hit.point.y-g.battlefield.TerrainHeight(hit.point.x,hit.point.z),
      layerW:layers?.itemSize===4?layers.getW(hit.face.a):null};
    })};
   });
  },pickPoints):undefined;
  if(detailVariants){
   for(const [id,detail] of [['Soft',[.30,.008,.012,1]],['Medium',[.60,.008,.012,1]],['Strong',[1,.008,.012,1]]]){
    const changed=await page.evaluate(async values=>{
     const {PatchesOf}=await import('./Script_MaterialPatches.mjs');
     let changed=0;
     window.Tengxian.scene.traverse(object=>{
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials)if(material)for(const patch of PatchesOf(material)||[])
       if(patch.trenchDetailUniform){patch.trenchDetailUniform.value.set(...values);changed++;}
     });
     window.Tengxian.StepFrames(32,0,true);
     return changed;
    },detail);
    if(!changed)throw new Error('No trench detail uniforms found');
    await page.screenshot({path:path.join(out,shot.id+'_'+id+'.png')});
   }
   await page.evaluate(async()=>{
    const {PatchesOf}=await import('./Script_MaterialPatches.mjs');
    const {TRENCH_SURFACE:{mud}}=await import('./Data_TrenchSurface.mjs');
    window.Tengxian.scene.traverse(object=>{
     for(const material of Array.isArray(object.material)?object.material:[object.material])
      if(material)for(const patch of PatchesOf(material)||[])patch.trenchDetailUniform?.value.set(mud.normalScale,mud.pomReliefM,mud.looseReliefM,mud.colorDetail);
    });
   });
  }
  if(process.argv.includes('--material-variants')){
   for(const [id,tile,detail] of [['Fine',1.2,[.6,.008,.012,1]],['Granular',1.8,[.8,.012,.020,1.25]],['Coarse',2.4,[.8,.016,.026,1.25]]]){
    await page.evaluate(async ({tile,detail})=>{
     const {PatchesOf}=await import('./Script_MaterialPatches.mjs');
     window.Tengxian.scene.traverse(object=>{
      for(const material of Array.isArray(object.material)?object.material:[object.material])
       if(material)for(const patch of PatchesOf(material)||[])if(patch.trenchDetailUniform){
        patch.trenchDetailUniform.value.set(...detail);
        patch.terrainUniforms.uTerrainTileNear.value.w=1/tile;
       }
     });
     window.Tengxian.StepFrames(32,0,true);
    },{tile,detail});
    await page.screenshot({path:path.join(out,shot.id+'_'+id+'.png')});
   }
   await page.evaluate(async()=>{
    const {PatchesOf}=await import('./Script_MaterialPatches.mjs'),{TRENCH_SURFACE:{mud}}=await import('./Data_TrenchSurface.mjs');
    window.Tengxian.scene.traverse(object=>{
     for(const material of Array.isArray(object.material)?object.material:[object.material])
      if(material)for(const patch of PatchesOf(material)||[])if(patch.trenchDetailUniform){
       patch.trenchDetailUniform.value.set(mud.normalScale,mud.pomReliefM,mud.looseReliefM,mud.colorDetail);
       patch.terrainUniforms.uTerrainTileNear.value.w=1/mud.baseTileM;
      }
    });
   });
  }
  captures.push({...shot,pose,picks});console.log('Captured '+shot.id);
 }
 const runtime=await page.evaluate(()=>{
  const g=window.Tengxian,b=g.battlefield;
  return {stats:b.stats,glError:g.renderer.getContext().getError(),
   render:{output:[g.renderer.domElement.width,g.renderer.domElement.height],scale:g.graphics.renderScale},
   programs:g.renderer.info.programs.map(p=>({name:p.name,runnable:p.diagnostics?.runnable??true})),
   terrainLayers:b.terrainLayers?{count:b.terrainLayers.layers,size:b.terrainLayers.size,dataSize:b.terrainLayers.dataSize}:null,
   trenchMeshes:b.meshes.filter(m=>m.userData.trenchEarth).map(m=>({name:m.name,material:m.material.name,
    triangles:(m.geometry.index?.count??m.geometry.attributes.position.count)/3}))};
 });
 if(runtime.stats.trenchEarth.triangles+runtime.stats.trenchSurface.triangles>=1150000||runtime.stats.trenchEarth.meshes>64)
  throw new Error('Trench dressing exceeds existing Fortifications triangle/mesh budget');
 if(process.argv.includes('--gpu-samples')){
  const timing=await page.evaluate(async()=>{
   const g=window.Tengxian,gl=g.renderer.getContext(),timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
   if(!timer)return {available:false,samples:[]};
   g.state.running=false;g.profiler.Disable();g.StepFrames(21,0,true);gl.finish();const samples=[];
   for(let batch=0;batch<3;batch++){
    const query=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
    const start=performance.now();g.StepFrames(21,0,true);const cpuMs=(performance.now()-start)/21;
    gl.endQuery(timer.TIME_ELAPSED_EXT);gl.finish();
    for(let i=0;i<40&&!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);i++)await new Promise(resolve=>setTimeout(resolve,0));
    const available=gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE),disjoint=gl.getParameter(timer.GPU_DISJOINT_EXT);
    samples.push({frames:21,cpuMs,gpuMs:available&&!disjoint?gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6/21:null,disjoint});gl.deleteQuery(query);
   }
   return {available:true,kind:'Frozen camera; 21 frames per batch',samples};
  });
  await fs.writeFile(path.join(out,'GpuTiming.json'),JSON.stringify(timing,null,2));
 }
 if(quality==='high'){
  const count=Math.max(1,Math.min(5,Number(Arg('frame-samples','1'))||1)),frames=[];
  for(let i=0;i<count;i++)frames.push(await page.evaluate(async()=>{const g=window.Tengxian;g.StepFrames(16,0,true);const f=g.FrameDebug;await f.Capture({waitGpu:true});const s=f.Summary({top:6});f.Release();return s;}));
  const frame=[...frames].sort((a,b)=>a.gpuMs-b.gpuMs)[Math.floor(frames.length/2)];
  await fs.writeFile(path.join(out,'FrameDebugSamples.json'),JSON.stringify(frames,null,2));
  await fs.writeFile(path.join(out,'FrameDebug.json'),JSON.stringify(frame,null,2));
 }
 if(process.argv.includes('--blast-check')){
  const blast=await page.evaluate(()=>{
   const g=window.Tengxian,b=g.battlefield,d=b.deformation,x=-20.3,z=-48;
   const before=b.GroundHeight(x,z),original=new Map(b.meshes.filter(m=>m.userData.trenchEarth).map(m=>[m,m.geometry]));
   const Count=geometry=>geometry.index?.count??geometry.attributes.position.count;
   const hit=d.ApplyBlast({x,y:before,z},'Shell75');g.StepFrames(2,0,true);
   const after=b.GroundHeight(x,z),cut=[];
   for(const [mesh,geometry] of original)if(mesh.geometry!==geometry)cut.push({name:mesh.name,before:Count(geometry),after:Count(mesh.geometry)});
   const glError=g.renderer.getContext().getError();d.Reset();g.StepFrames(2,0,true);
   return {x,z,before,after,hit:!!hit,cut,glError,resetHeight:b.GroundHeight(x,z),restored:[...original].every(([mesh,geometry])=>mesh.geometry===geometry)};
  });
  await fs.writeFile(path.join(out,'BlastReport.json'),JSON.stringify(blast,null,2));
  if(!blast.hit||blast.before-blast.after<.1||!blast.cut.some(m=>m.name.includes('TrenchEarth'))||!blast.restored||Math.abs(blast.before-blast.resetHeight)>1e-6||blast.glError)
   throw new Error('Trench dressing blast/reset contract failed: '+JSON.stringify(blast));
 }
 const report={quality,network:plan.segments.map(s=>({id:s.id,length:s.path.length,stations:s.stations.length})),
  captures,runtime,errors,consoleErrors};
 await fs.writeFile(path.join(out,'Report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({out,captured:captures.length,segments:plan.segments.length,errors,consoleErrors,stats:runtime.stats,glError:runtime.glError}));
 if(errors.length||consoleErrors.length||runtime.glError||runtime.programs.some(program=>!program.runnable))process.exitCode=1;
}catch(error){
 const state=await page.evaluate(()=>({ready:window.Tengxian?.state,body:document.body.innerText.slice(-6000)})).catch(e=>({error:String(e)}));
 await fs.writeFile(path.join(out,'LoadFailure.json'),JSON.stringify({error:String(error),errors,consoleErrors,state},null,2));
 console.error(JSON.stringify({errors,consoleErrors,state}));throw error;
}finally{await browser.close();}
