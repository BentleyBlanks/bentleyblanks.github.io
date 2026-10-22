import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6);assert(url,'Pass --url=...');
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
const report={checks:[],errors:[],samples:[]};
const Check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
await fs.mkdir(path.join(here,'_dev'),{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.addInitScript(()=>{localStorage.setItem('earspa3d.calm.settings',JSON.stringify({master:0,muted:true}));const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>callback.name==='Animate'?0:raf(callback);});
  await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:120000});
  report.initial=await page.evaluate(()=>({version:__EarSpaProbe().version,stats:__EarSpaProbe().stats}));
  const Step=n=>page.evaluate(n=>__EarSpaDebug.StepFrames(n),n);
  const VisiblePixels=()=>page.evaluate(()=>{
    const {core}=__EarSpaDebug,{renderer,scene}=core,gl=renderer.getContext();
    const Pixels=()=>{core.Render();const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    const present=Pixels(),groups=[scene.getObjectByName('Model_Temple').parent,scene.getObjectByName('Model_Canal').parent],visibility=groups.map(group=>group.visible);
    groups.forEach(group=>group.visible=false);const absent=Pixels();groups.forEach((group,index)=>group.visible=visibility[index]);core.Render();
    let changed=0;for(let i=0;i<present.length;i+=4)if(Math.abs(present[i]-absent[i])+Math.abs(present[i+1]-absent[i+1])+Math.abs(present[i+2]-absent[i+2])>9)changed++;
    return changed;
  });
  await Step(3);
  for(const [width,height] of [[1280,720],[390,844],[844,390]]){
    await page.setViewportSize({width,height});await Step(3);
    const pixels=await VisiblePixels(),probe=await page.evaluate(()=>__EarSpaProbe());
    report.samples.push({width,height,pixels,stats:probe.stats,lighting:probe.rendering.portraitLighting,hair:probe.rendering.portraitHair});
    Check(pixels>width*height*.12,`${width}x${height}: actual character pixels survive initialized shadows`);
    Check(probe.stats.triangles<=180000&&probe.stats.drawCalls<=120,`${width}x${height}: steady portrait stays within rendering budget`);
    Check(probe.rendering.portraitLighting.outside===1&&probe.rendering.portraitLighting.environment>0,`${width}x${height}: external reflection lighting active`);
    await page.screenshot({path:path.join(here,`_dev/Shot_PortraitMenu_${width}x${height}.png`)});
  }
  await page.setViewportSize({width:1280,height:720});await Step(3);
  const saved=await page.evaluate(()=>__EarSpaProbe().rendering.renderQuality);
  for(const detail of [0,1]){
    await page.evaluate(({saved,detail})=>__EarSpaDebug.view.SetRenderQuality({...saved,detail,detailLayers:detail?3:0,scattering:detail,reflections:detail}),{saved,detail});await Step(2);
    Check(await VisiblePixels()>100000,`detail ${detail}: skin and groom still render without uninitialized shader values`);
  }
  await page.evaluate(saved=>__EarSpaDebug.view.SetRenderQuality(saved),saved);await Step(2);
  await page.locator('#ear-start').click();await Step(150);
  const inside=await page.evaluate(()=>__EarSpaProbe());report.inside={phase:inside.phase,lighting:inside.rendering.portraitLighting,lamp:inside.rendering.lampEquipment,coins:inside.shop.coins,inventory:inside.shop.inventory};
  Check(inside.phase==='playing'&&inside.viewReady,'real start button enters playable canal');
  Check(inside.rendering.portraitLighting.outside===0&&inside.rendering.portraitLighting.fill===0&&inside.rendering.portraitLighting.rim===0&&inside.rendering.portraitLighting.environment===0,'portrait lighting fades fully out inside the canal');
  Check(inside.rendering.lampIntensity===55&&!inside.rendering.lampEquipment.mounted,'weak manually aimed starting lamp remains intact');
  Check(inside.shop.coins===0&&inside.shop.inventory.tools.join(',')==='scoop','portrait changes preserve initial economy and tools');
  Check(await VisiblePixels()>100000,'interior wall remains visibly rendered');
  await page.screenshot({path:path.join(here,'_dev/Shot_PortraitInterior_1280x720.png')});
  report.shadowResize=await page.evaluate(async()=>{
    const {core,view}=__EarSpaDebug,{renderer,scene}=core,key=scene.getObjectByName('PortraitKey');
    const {ResolveRenderQuality}=await import('./Data_RenderQuality.mjs');
    const audit=window.__PortraitShadowAudit={passes:0,originalSetRenderTarget:renderer.setRenderTarget};
    renderer.setRenderTarget=function(target,...rest){
      if(target&&target===key.shadow.map)audit.passes++;
      return audit.originalSetRenderTarget.call(this,target,...rest);
    };
    const shadows=key.shadow.mapSize.x===512?'high':'low',expectedSize=shadows==='low'?512:2048;
    const quality=ResolveRenderQuality({...__EarSpaProbe().renderQuality,shadows});
    core.SetRenderQuality(quality);view.SetRenderQuality(quality);
    const invalidated=key.shadow.map===null&&key.shadow.needsUpdate;
    __EarSpaDebug.StepFrames(1);
    const result={invalidated,expectedSize,size:key.shadow.map?.width,passes:audit.passes,outerVisible:view.RenderingProbe().outerVisible,needsUpdate:key.shadow.needsUpdate};
    audit.passes=0;return result;
  });
  Check(report.shadowResize.invalidated&&!report.shadowResize.outerVisible&&report.shadowResize.size===report.shadowResize.expectedSize,'shadow quality change recreates the requested map size while portrait is hidden');
  Check(report.shadowResize.passes===1&&!report.shadowResize.needsUpdate,'hidden portrait shadow resize performs exactly one initialization pass');
  await page.locator('#view-toggle').click();await Step(150);
  report.shadowReentry=await page.evaluate(()=>{
    const key=__EarSpaDebug.core.scene.getObjectByName('PortraitKey');
    return{passes:__PortraitShadowAudit.passes,needsUpdate:key.shadow.needsUpdate,autoUpdate:key.shadow.autoUpdate};
  });
  Check(report.shadowReentry.passes===1&&!report.shadowReentry.needsUpdate&&!report.shadowReentry.autoUpdate,'returning to the portrait rebuilds its static shadow exactly once');
  await Step(5);
  Check(await page.evaluate(()=>__PortraitShadowAudit.passes)===1,'stable portrait frames reuse the rebuilt static shadow');
  await page.evaluate(saved=>{
    const {core,view}=__EarSpaDebug;core.renderer.setRenderTarget=__PortraitShadowAudit.originalSetRenderTarget;
    delete window.__PortraitShadowAudit;core.SetRenderQuality(saved);view.SetRenderQuality(saved);
  },saved);await Step(2);
  Check((await page.evaluate(()=>__EarSpaProbe().rendering)).outerVisible,'real observation control returns to external portrait');
  Check(await VisiblePixels()>100000,'portrait remains visible after entering and exiting canal');
  const isolation=await page.evaluate(async()=>{
    const THREE=await import('three'),{core,view}=__EarSpaDebug,{scene,renderer,camera}=core;
    const key=scene.getObjectByName('PortraitKey'),lamp=scene.children.find(object=>object.isSpotLight);
    const scoop=scene.getObjectByName('Model_ScoopHead').parent,tool=scoop.parent,wax=view.chunks.find(chunk=>chunk.mesh.castShadow).mesh;
    const staticCasters=new Set(['Model_Temple','Model_OuterEar','Model_ProfileEyes','Model_ProfileIris','Model_ProfileHair','Model_ProfileHairStrands','Model_ProfileHairWisps']);
    const Pose=object=>({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone(),visible:object.visible});
    const poses=[tool,scoop,wax].map(Pose),visibility=tool.children.map(object=>[object,object.visible]);
    const ranges=new Map();scene.traverse(object=>{if(object.geometry)ranges.set(object.geometry,{...object.geometry.drawRange});});
    const lampState={position:lamp.position.clone(),target:lamp.target.position.clone(),intensity:lamp.intensity,angle:lamp.angle,penumbra:lamp.penumbra,autoUpdate:lamp.shadow.autoUpdate,needsUpdate:lamp.shadow.needsUpdate};
    const casts=scoop.children.map(object=>[object,object.castShadow]);
    const originalTarget=renderer.setRenderTarget,originalDraw=renderer.renderBufferDirect;
    let passes=0;const draws={keyStatic:0,keyExcluded:0,keyOther:0,lampTools:0,mainTools:0};
    renderer.setRenderTarget=function(target,...args){if(target&&target===key.shadow.map)passes++;return originalTarget.call(this,target,...args);};
    renderer.renderBufferDirect=function(drawCamera,drawScene,geometry,material,object,group){
      if(drawCamera===key.shadow.camera){if(staticCasters.has(object.name))draws.keyStatic++;else if(geometry.drawRange.count===0)draws.keyExcluded++;else draws.keyOther++;}
      if(scoop.children.includes(object)&&geometry.drawRange.count>0){if(drawCamera===lamp.shadow.camera)draws.lampTools++;if(drawCamera===camera)draws.mainTools++;}
      return originalDraw.call(this,drawCamera,drawScene,geometry,material,object,group);
    };
    const gl=renderer.getContext();
    function Capture(){core.Render();const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return{pixels,png:renderer.domElement.toDataURL(),passes,triangles:renderer.info.render.triangles};}
    function Compare(a,b){let changed=0,darker=0,peak=0;for(let i=0;i<a.length;i+=4){const delta=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(delta>9){changed++;if(a[i]+a[i+1]+a[i+2]<b[i]+b[i+1]+b[i+2])darker++;peak=Math.max(peak,Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));}}return{changed,darker,peak};}
    try{
      key.shadow.needsUpdate=true;view.Update(0);
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(1120/1280*2-1,1-350/720*2),camera);
      const receiver=ray.intersectObjects([scene.getObjectByName('Model_Temple'),scene.getObjectByName('Model_OuterEar')])[0];
      const lightDirection=key.position.clone().sub(key.target.position).normalize();
      tool.position.copy(receiver.point).addScaledVector(lightDirection,12);tool.quaternion.identity();tool.scale.setScalar(1);
      tool.children.forEach(child=>child.visible=child===scoop);scoop.position.set(0,0,0);scoop.quaternion.identity();scoop.scale.setScalar(1);
      wax.position.copy(receiver.point).addScaledVector(lightDirection,10);
      tool.visible=wax.visible=false;const clean=Capture();
      passes=0;tool.visible=wax.visible=true;key.shadow.needsUpdate=true;const present=Capture();
      passes=0;tool.visible=wax.visible=false;const cached=Capture();
      passes=0;key.shadow.needsUpdate=true;const refreshed=Capture();
      passes=0;tool.visible=true;let maxMovingTriangles=0;
      for(let i=0;i<5;i++){tool.position.y+=.2;core.Render();maxMovingTriangles=Math.max(maxMovingTriangles,renderer.info.render.triangles);}
      const movingPasses=passes;
      tool.position.copy(receiver.point).addScaledVector(lightDirection,12);
      lamp.position.copy(receiver.point).addScaledVector(lightDirection,26);lamp.target.position.copy(receiver.point);
      lamp.intensity=1600;lamp.angle=.65;lamp.penumbra=.2;lamp.shadow.autoUpdate=true;lamp.shadow.needsUpdate=true;
      const lampShadow=Capture();scoop.children.forEach(object=>object.castShadow=false);const lampNoShadow=Capture();
      return{stats:{receiver:receiver.object.name,unscaledExistingTool:true,existingWax:true,draws,passes:{present:present.passes,cached:cached.passes,refreshed:refreshed.passes,moving:movingPasses},ghost:Compare(cached.pixels,refreshed.pixels),clean:Compare(clean.pixels,refreshed.pixels),mainVisible:Compare(present.pixels,clean.pixels),lampToolShadow:Compare(lampShadow.pixels,lampNoShadow.pixels),maxMovingTriangles,rangesRestored:[...ranges].every(([geometry,range])=>geometry.drawRange.start===range.start&&geometry.drawRange.count===range.count)},images:{Cached:cached.png,Refreshed:refreshed.png,LampShadow:lampShadow.png,LampNoShadow:lampNoShadow.png}};
    }finally{
      renderer.setRenderTarget=originalTarget;renderer.renderBufferDirect=originalDraw;
      for(const [object,castShadow] of casts)object.castShadow=castShadow;
      for(const pose of poses){pose.object.position.copy(pose.position);pose.object.quaternion.copy(pose.quaternion);pose.object.scale.copy(pose.scale);pose.object.visible=pose.visible;}
      for(const [object,visible] of visibility)object.visible=visible;
      lamp.position.copy(lampState.position);lamp.target.position.copy(lampState.target);lamp.intensity=lampState.intensity;lamp.angle=lampState.angle;lamp.penumbra=lampState.penumbra;lamp.shadow.autoUpdate=lampState.autoUpdate;lamp.shadow.needsUpdate=lampState.needsUpdate;
      key.shadow.needsUpdate=true;view.Update(0);core.Render();
    }
  });
  report.shadowIsolation=isolation.stats;
  for(const [name,png] of Object.entries(isolation.images))await fs.writeFile(path.join(here,`_dev/Shot_PortraitShadowIsolation_${name}.png`),Buffer.from(png.split(',')[1],'base64'));
  const isolationStats=isolation.stats;
  Check(isolationStats.draws.keyStatic>0&&isolationStats.draws.keyExcluded>=3&&isolationStats.draws.keyOther===0,'portrait key draws only its bound static meshes, excluding existing tool and wax');
  Check(isolationStats.passes.present===1&&isolationStats.passes.cached===0&&isolationStats.passes.refreshed===1&&isolationStats.ghost.changed===0&&isolationStats.clean.changed===0,'removing cached tool and wax leaves no ghost shadow before or after an explicit refresh');
  Check(isolationStats.mainVisible.changed>100&&isolationStats.draws.mainTools>=2&&isolationStats.rangesRestored,'main render keeps visible tools and restores every geometry draw range');
  Check(isolationStats.passes.moving===0&&isolationStats.maxMovingTriangles<=180000,'moving exterior tool keeps the static cache and original 180k triangle budget');
  Check(isolationStats.draws.lampTools>=2&&isolationStats.lampToolShadow.darker>30,'actual examination lamp still receives the existing tool shadow');
  report.shadowHookLifecycle=await page.evaluate(async()=>{
    const THREE=await import('three'),{CreatePortraitLighting}=await import('./Script_PortraitLighting.js');
    const {renderer,camera}=__EarSpaDebug.core,scene=new THREE.Scene(),key=new THREE.DirectionalLight();scene.add(key);
    const geometry=new THREE.BoxGeometry(1,1,1);geometry.clearGroups();geometry.addGroup(0,18,0);geometry.addGroup(18,18,1);geometry.setDrawRange(3,27);
    const materials=[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial()],bound=new THREE.Mesh(geometry,materials[0]),moving=new THREE.Mesh(geometry,materials),shared=new THREE.Mesh(geometry,materials[0]);
    moving.castShadow=shared.castShadow=true;scene.add(bound,moving,shared);
    const events=[];const Before=function(...args){events.push({phase:'before',object:this===args[1],camera:args[3]===key.shadow.camera,range:{...geometry.drawRange},group:args[6]});};
    const After=function(...args){events.push({phase:'after',object:this===args[1],camera:args[3]===key.shadow.camera,range:{...geometry.drawRange},group:args[6]});};
    moving.onBeforeShadow=Before;moving.onAfterShadow=After;const originalShared=[shared.onBeforeShadow,shared.onAfterShadow],originalBound=bound.onBeforeShadow;
    const lighting=CreatePortraitLighting({renderer,scene,key,meshes:[bound]});lighting.Update(1,true);
    const results=[];const otherCamera=new THREE.PerspectiveCamera();
    const Invoke=(object,shadowCamera,group)=>{const args=[renderer,object,camera,shadowCamera,geometry,materials[0],group];object.onBeforeShadow(...args);const during={...geometry.drawRange};object.onAfterShadow(...args);results.push({during,after:{...geometry.drawRange}});};
    for(const group of geometry.groups)Invoke(moving,key.shadow.camera,group);
    Invoke(shared,key.shadow.camera,null);Invoke(moving,otherCamera,geometry.groups[0]);
    const arrayAndShared=results.slice(0,3).every(result=>result.during.count===0&&result.after.start===3&&result.after.count===27)&&bound.onBeforeShadow===originalBound;
    const otherLamp=results[3].during.start===3&&results[3].during.count===27;
    const originalCallbacks=events.length===6&&events.every(event=>event.object&&event.range.start===3&&event.range.count===27)&&events[0].group===geometry.groups[0]&&events[2].group===geometry.groups[1];
    geometry.dispose();const geometryDisposal=moving.onBeforeShadow===Before&&moving.onAfterShadow===After&&shared.onBeforeShadow===originalShared[0]&&shared.onAfterShadow===originalShared[1];
    lighting.Update(1,true);scene.remove(moving);key.shadow.needsUpdate=true;lighting.Update(1,true);
    const detachedRestored=moving.onBeforeShadow===Before&&moving.onAfterShadow===After;
    scene.add(moving);lighting.Update(1,true);
    moving.onBeforeShadow(renderer,moving,camera,key.shadow.camera,geometry,materials[0],geometry.groups[0]);
    lighting.Dispose();const disposed=moving.onBeforeShadow===Before&&moving.onAfterShadow===After&&shared.onBeforeShadow===originalShared[0]&&shared.onAfterShadow===originalShared[1]&&geometry.drawRange.start===3&&geometry.drawRange.count===27;
    geometry.dispose();materials.forEach(material=>material.dispose());
    return{arrayAndShared,otherLamp,originalCallbacks,geometryDisposal,detachedRestored,disposed};
  });
  const lifecycle=report.shadowHookLifecycle;
  Check(lifecycle.arrayAndShared&&lifecycle.otherLamp,'array material groups and shared static geometry restore after each key draw; other lamps retain full ranges');
  Check(lifecycle.originalCallbacks,'original shadow callbacks retain their receiver, arguments and complete draw range');
  Check(lifecycle.geometryDisposal&&lifecycle.detachedRestored,'disposed customer geometry and detached meshes release their shadow hooks');
  Check(lifecycle.disposed,'lighting disposal restores callbacks and any interrupted draw range');
  report.shadowRegistration=await page.evaluate(()=>{
    const {core,view}=__EarSpaDebug,{renderer,scene}=core,key=scene.getObjectByName('PortraitKey');
    const enabled=renderer.shadowMap.enabled,originalTraverse=scene.traverse;let scans=0;
    scene.traverse=function(...args){scans++;return originalTraverse.apply(this,args);};
    try{
      renderer.shadowMap.enabled=false;key.shadow.needsUpdate=true;
      for(let i=0;i<5;i++)view.Update(0);const disabledScans=scans;
      renderer.shadowMap.enabled=true;view.Update(0);const enabledScans=scans-disabledScans;core.Render();scans=0;
      for(let i=0;i<5;i++){view.Update(0);core.Render();}
      return{disabledScans,enabledScans,stableScans:scans};
    }finally{scene.traverse=originalTraverse;renderer.shadowMap.enabled=enabled;}
  });
  const registration=report.shadowRegistration;
  Check(registration.disabledScans===0&&registration.enabledScans===1&&registration.stableScans===0,'caster discovery scans only on an enabled shadow-cache rebuild, never on disabled or steady frames');
  Check(report.errors.length===0,'no browser or shader errors');
  console.log('PASS '+report.checks.length+' portrait rendering checks');
}finally{await fs.writeFile(path.join(here,'_dev/Report_PortraitRendering.json'),JSON.stringify(report,null,2));await browser.close();}
