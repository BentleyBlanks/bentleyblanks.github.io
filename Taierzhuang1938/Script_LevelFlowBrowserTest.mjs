import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {FLOW_TIMELINE} from "./AdvancedTools/Script_LevelFlowModel.mjs";
import {FLOW_SOURCE_EXCERPTS} from "./AdvancedTools/Data_LevelFlowSource.mjs";
import {ReadPngFrameMetadata,ReadFramePacket} from "./AdvancedTools/Script_LevelFlowDocument.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,"tmp","EncounterEditor");
fs.mkdirSync(out,{recursive:true});
const server=await ServeRoot(root),base=`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
const browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1,acceptDownloads:true});
  // Exercise the portable Worker and IndexedDB path even on a developer machine
  // with a prebuilt disk Library. EncounterLibraryBrowserTest covers disk hits.
  await page.route("**/Library/Terrain/*.bin.gz",route=>route.fulfill({status:404,body:""}));
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(()=>{
    localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));
    localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));
    window.encounterLoadPulse={ticks:0,maxGap:0,last:performance.now()};
    window.encounterLoadTimer=setInterval(()=>{
      const now=performance.now();encounterLoadPulse.ticks++;encounterLoadPulse.maxGap=Math.max(encounterLoadPulse.maxGap,now-encounterLoadPulse.last);encounterLoadPulse.last=now;
    },50);
  });
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  async function ReadyPlan() {
    await page.waitForFunction(()=>window.LevelFlow, {}, {timeout:180000});
    await page.evaluate(()=>{LevelFlow.SetLayout(2);LevelFlow.SetViewType(0,'plan');LevelFlow.SetViewType(1,'oblique');LevelFlow.ActivateView(0);});
    const framing=await page.evaluate(()=>{
      const params=new URLSearchParams(location.search);
      return ['x','z','zoom'].every(key=>params.has(key))?['x','z','zoom'].map(key=>Number(params.get(key))):null;
    });
    if(framing) {
      const box=await page.locator('#flowMap').boundingBox();
      const point=await page.evaluate(point=>LevelFlow.ToScreen(point),framing.slice(0,2));
      await page.mouse.move(box.x+point[0],box.y+point[1]);await page.mouse.down();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.up();
      const scale=await page.evaluate(()=>LevelFlow.Inspect().view.scale);
      await page.mouse.wheel(0,-Math.log(framing[2]/scale)*1000);
      await page.evaluate(()=>new Promise(requestAnimationFrame));
    }
  }
  async function FrameViewport(index,mode) {
    const menu=page.locator(`.lfViewPane[data-viewport="${index}"] .lfViewCamera`);
    await menu.locator('summary').click();
    await menu.locator(`[data-framing="${mode}"]`).click();
    assert.equal(await menu.getAttribute('open'),null,'camera action closes its menu');
  }
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=424`);await page.waitForFunction(()=>window.LevelFlow, {}, {timeout:180000});
  const terrainLoading=await page.evaluate(async()=>{
    clearInterval(encounterLoadTimer);
    const pulse={...encounterLoadPulse};
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const {EvaluateFlow}=await import('./Script_LevelFlowModel.mjs');
    const map=await LoadEncounterMap({focus:EvaluateFlow(0).player});
    return {pulse,build:map.terrain.buildInfo,leaves:map.terrain.leafCount};
  });
  assert.ok(terrainLoading.pulse.ticks>20&&terrainLoading.pulse.maxGap<2500,'first-load terrain work yields the browser main thread');
  assert.equal(terrainLoading.build.source,'cache','a second load restores the content-keyed prepared terrain');
  assert.ok(terrainLoading.leaves>100000&&terrainLoading.build.cached,'cached data restores the full terrain hierarchy');
  const roofDepth=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';document.body.append(canvas);
    const roof={id:'Roof',material:'Whitebox/Roof',pos:[0,2.5,0],size:[10,1,10],params:{color:'#ff0000'}};
    const wall={id:'Lintel',material:'Whitebox/Plaster',pos:[0,0,0],size:[5,3.5,10],params:{color:'#0000ff'}};
    const source=LevelFlow.Evaluate(424),frame={...source,actors:source.actors.map(actor=>({...actor,p:[10000,10000]})),effects:[],triggers:[],groups:[]};
    const results=[];
    for(const software of [false,true]) for(const reverse of [false,true]) {
      const view=new FlowPerspectiveView(canvas,{objects:reverse?[wall,roof]:[roof,wall],farObjects:[],labels:[],terrain:{heightAt:()=>0,roots:[]}},'scene');
      view.lighting=null;if(software) view.raster.gpu=null;
      for(const yaw of [-0.6,0.4]) for(const pitch of [-0.08,-0.35,-0.8]) {
        const forward=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
        view.freeCamera={eye:forward.map((value,axis)=>(axis===1?3.5:0)-value*30),yaw,pitch};
        view.Draw(frame,{names:false,landmarks:false},null);
        const context=canvas.getContext('2d');let wrong=0;
        for(const x of [-0.6,0,0.6]) for(const z of [-0.6,0,0.6]) {
          const point=view.Project([x,3.5,z]),pixel=context.getImageData(Math.round(point[0]),Math.round(point[1]),1,1).data;
          if(pixel[0]<200||pixel[2]>20) wrong++;
        }
        for(const x of [-0.6,0,0.6]) {
          const point=view.Project([x,3,-5]),pixel=context.getImageData(Math.round(point[0]),Math.round(point[1]),1,1).data;
          if(pixel[0]<200||pixel[2]>20) wrong++;
        }
        results.push({software,reverse,yaw,pitch,wrong});
      }
    }
    canvas.remove();return results;
  });
  assert.ok(roofDepth.every(result=>result.wrong===0),`roof caps stay above coplanar wall tops for GPU/software, either draw order and shallow/steep cameras: ${JSON.stringify(roofDepth.filter(result=>result.wrong))}`);
  const rasterParity=await page.evaluate(async()=>{
    const {EncounterRaster}=await import('./Script_LevelFlowRaster.mjs');
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const results=[];
    for(const perspective of [false,true]) {
      const gpu=new EncounterRaster(),cpu=new EncounterRaster();cpu.gpu=null;
      const Draw=raster=>{
        raster.Begin(64,48,perspective);
        raster.Triangle({x:-10.2,y:-8.7,depth:7,rgb:[190,80,50]}, {x:81.3,y:5.7,depth:15,rgb:[60,190,80]}, {x:13.4,y:68.1,depth:9,rgb:[80,60,200]}, '#000000');
        raster.Triangle({x:12.3,y:10.7,depth:3},{x:43.7,y:12.4,depth:3},{x:29.1,y:35.2,depth:3},'#abcdef');
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;
        const context=canvas.getContext('2d');raster.Flush(context,64,48);
        return context.getImageData(0,0,64,48).data;
      };
      const actual=Draw(gpu),expected=Draw(cpu);
      let pixels=0,maxColorError=0,maxDepthError=0;
      // Sample interiors, excluding the different CPU/GPU edge fill rules.
      for(let y=14;y<25;y++) for(let x=19;x<36;x++) {
        const index=y*64+x;
        if(!Number.isFinite(cpu.depth[index])) continue;
        pixels++;
        maxDepthError=Math.max(maxDepthError,Math.abs(gpu.depth[index]-cpu.depth[index]));
        for(let c=0;c<4;c++) maxColorError=Math.max(maxColorError,Math.abs(actual[index*4+c]-expected[index*4+c]));
      }
      results.push({accelerated:gpu.accelerated,pixels,maxColorError,maxDepthError});
      // A failed GPU frame must immediately replay all triangles in software.
      const failed=new EncounterRaster();failed.gpu={gl:{isContextLost:()=>false},Draw:()=>false};
      const recovered=Draw(failed);
      results.push({fallback:!failed.accelerated,same:recovered.every((value,index)=>Math.abs(value-expected[index])<=1)});
      const view={eye:[0,0,0],right:[1,0,0],up:[0,1,0],forward:[0,0,1],focal:32,scale:4,near:perspective?0.65:0.15,far:50,width:64,height:48,
        type:perspective?'scene':'oblique',CameraPoint:point=>point,
        Vertex:point=>({x:32+point[0]*4,y:48*.57-point[1]*4,depth:point[2]})};
      view.FaceVertices=(...args)=>FlowPerspectiveView.prototype.FaceVertices.apply(view,args);
      const world=[[-7,6,0],[8,5,6],[0,-8,80]],colors=[[210,70,40],[40,170,80],[70,60,190]];
      const WorldDraw=raster=>{
        raster.Begin(64,48,perspective);raster.view=view;
        if(raster.accelerated) raster.WorldTriangle(world,colors,[[0,1,0],[0.2,0.98,0],[0,0.98,0.2]]);
        else raster.Face(view.FaceVertices(world,colors),'#000000');
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;
        raster.Flush(canvas.getContext('2d'),64,48);return canvas.getContext('2d').getImageData(0,0,64,48).data;
      };
      const worldExpected=WorldDraw(cpu),worldActual=WorldDraw(gpu);
      let worldPixels=0,worldColorError=0,worldDepthError=0;
      for(let y=10;y<37;y++) for(let x=10;x<54;x++) {
        const i=y*64+x;
        if(![i-65,i-64,i-63,i-1,i,i+1,i+63,i+64,i+65].every(index=>Number.isFinite(cpu.depth[index]))) continue;
        worldPixels++;worldDepthError=Math.max(worldDepthError,Math.abs(gpu.depth[i]-cpu.depth[i]));
        for(let c=0;c<4;c++) worldColorError=Math.max(worldColorError,Math.abs(worldActual[i*4+c]-worldExpected[i*4+c]));
      }
      // GPU triangle setup snaps to a subpixel grid. Its near/far-clipped
      // interpolation error must stay below the editor's 2.5 cm depth bias.
      results.push({pixels:worldPixels,maxColorError:worldColorError,maxDepthError:worldDepthError,depthTolerance:0.025});
      failed.gpu={gl:{isContextLost:()=>false},Draw:()=>false};
      const worldRecovered=WorldDraw(failed);
      results.push({fallback:!failed.accelerated,same:worldRecovered.every((value,index)=>Math.abs(value-worldExpected[index])<=1)});
    }
    return results;
  });
  for(const result of rasterParity) {
    if('fallback' in result) assert.ok(result.fallback&&result.same,'GPU failure replays the complete frame in software');
    else assert.ok(result.pixels>100&&result.maxColorError<=2&&result.maxDepthError<(result.depthTolerance||0.001),`GPU preserves smooth colors and perspective depth: ${JSON.stringify(result)}`);
  }
  const lighting=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {FLOW_RENDERING}=await import('../Data_Tuning_LevelFlow.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';document.body.append(canvas);
    const objects=[
      {id:'Floor',pos:[0,-0.1,0],size:[20,0.1,20],material:'Whitebox/Plaster'},
      {id:'Wall',pos:[0,0,0],size:[5,3,0.4],material:'Whitebox/Plaster'},
      {id:'Wing',pos:[-2.5,0,2],size:[0.4,3,4],material:'Whitebox/Plaster'},
    ];
    const view=new FlowPerspectiveView(canvas,{objects,farObjects:[],terrain:{heightAt:()=>0,roots:[]},ramps:[]},'scene');
    view.freeCamera={eye:[6,6,8],yaw:Math.atan2(-6,-8),pitch:Math.atan2(-5,10)};
    const frame={...LevelFlow.Evaluate(1355),actors:[],effects:[]};
    canvas.width=320;canvas.height=240;
    const Draw=settings=>{
      view.lighting=settings;view.BeforeDraw(frame);const context=canvas.getContext('2d');view.DrawBase(context,320,240,frame);
      return {pixels:context.getImageData(0,0,320,240).data,depth:[...view.raster.depth]};
    };
    const direct=Draw({...FLOW_RENDERING.lighting,shadowStrength:0,aoStrength:0});
    const shadow=Draw({...FLOW_RENDERING.lighting,aoStrength:0});
    const ambient=Draw({...FLOW_RENDERING.lighting,shadowStrength:0});
    const CountDarker=(a,b)=>{
      let count=0,depthError=0;
      for(let i=0;i<a.depth.length;i++) {
        if(Number.isFinite(a.depth[i])) {
          depthError=Math.max(depthError,Math.abs(a.depth[i]-b.depth[i]));
          if(a.pixels[i*4]-b.pixels[i*4]>12) count++;
        }
      }
      return {count,depthError};
    };
    // All four panes share this context. Returning to another target size and
    // camera must preserve the same shadow/AO color and interaction depth.
    const repeated=Draw({...FLOW_RENDERING.lighting,aoStrength:0});
    const result={backend:view.raster.accelerated,shadow:CountDarker(direct,shadow),ao:CountDarker(direct,ambient),repeat:CountDarker(shadow,repeated),maxRepeatError:shadow.pixels.reduce((max,value,index)=>Math.max(max,Math.abs(value-repeated.pixels[index])),0)};
    canvas.remove();return result;
  });
  assert.ok(lighting.backend,'lighting regression exercises WebGL');
  assert.ok(lighting.shadow.count>100,`wall casts a visible ground shadow: ${JSON.stringify(lighting)}`);
  assert.ok(lighting.ao.count>25,`wall/floor junction receives ambient occlusion: ${JSON.stringify(lighting)}`);
  assert.equal(lighting.shadow.depthError,0,'shadows preserve picking and actor depth');
  assert.equal(lighting.ao.depthError,0,'AO preserves picking and actor depth');
  assert.ok(lighting.maxRepeatError<=1,`repeated lighting is deterministic: ${JSON.stringify(lighting)}`);
  const terrainTexture=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {FLOW_RENDERING}=await import('../Data_Tuning_LevelFlow.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:321px;height:241px';
    document.body.append(canvas);canvas.width=321;canvas.height=241;
    const data=new Uint8Array(5*5*4);
    for(let row=0;row<5;row++) for(let column=0;column<5;column++) data.set(column<2?[220,20,20,255]:[20,20,220,255],(row*5+column)*4);
    const surface={scene:{minX:-2,minZ:0,texelM:1,width:5,height:5,data},backdrop:null};
    const points=[[-2,0,0],[2,0,0],[2,0,4],[-2,0,4]];
    let diagonal=false;
    const terrain={heightAt:()=>0,colorAt:x=>x<0?[220,20,20]:[20,20,220],surfaceMaps:()=>surface,
      roots:[{center:[0,0,2],radius:3,size:4,minHeight:0,maxHeight:0}],
      packedFacesForCell:()=>new Float32Array((diagonal?[[0,1,3],[1,2,3]]:[[0,1,2],[0,2,3]])
        .flatMap(face=>face.flatMap(index=>[...points[index],20,220,20,0,1,0])))};
    const view=new FlowPerspectiveView(canvas,{objects:[],farObjects:[],terrain},'scene');
    view.freeCamera={eye:[0,3,-3],yaw:0,pitch:-0.55};
    view.lighting={...FLOW_RENDERING.lighting,shadowStrength:0,aoStrength:0};
    const frame={...LevelFlow.Evaluate(0),actors:[],effects:[]};
    const Draw=()=>{
      view.BeforeDraw(frame);const context=canvas.getContext('2d');context.clearRect(0,0,321,241);
      view.DrawBase(context,321,241,frame);
      return [[-1,0,2],[1,0,2]].map(point=>{
        const pixel=view.Project(point);return [...context.getImageData(Math.round(pixel[0]),Math.round(pixel[1]),1,1).data];
      });
    };
    const first=Draw(),target=view.raster.gpu.target;
    diagonal=true;const alternate=Draw();
    view.raster.gpu={gl:{isContextLost:()=>false},Draw:()=>false};
    const fallback=Draw(),software=!view.raster.accelerated;
    canvas.remove();return {first,alternate,fallback,software,aoSize:[target.aoWidth,target.aoHeight]};
  });
  assert.deepEqual(terrainTexture.aoSize,[161,121],'AO uses a bounded half-resolution target for odd-sized native viewports');
  assert.ok(terrainTexture.first[0][0]>terrainTexture.first[0][2]*4&&terrainTexture.first[1][2]>terrainTexture.first[1][0]*4,
    'world-space terrain textures override triangle vertex colors');
  assert.deepEqual(terrainTexture.first,terrainTexture.alternate,'changing the terrain diagonal preserves painted surface pixels');
  assert.ok(terrainTexture.software&&terrainTexture.fallback[0][0]>terrainTexture.fallback[0][2]
    &&terrainTexture.fallback[1][2]>terrainTexture.fallback[1][0],'GPU failure restores authored terrain colors in the same frame');
  const sampledDepth=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';document.body.append(canvas);
    const objects=[{id:'Floor',material:'Whitebox/Plaster',pos:[0,-0.1,0],size:[30,0.1,30]},
      {id:'Wall',material:'Whitebox/Plaster',pos:[0,0,0],size:[5,3,0.4]}];
    const map={objects,farObjects:[],terrain:{heightAt:()=>0,roots:[]}};
    const view=new FlowPerspectiveView(canvas,map,'scene');view.freeCamera={eye:[0,2,-6],yaw:0,pitch:-0.1};
    const source=LevelFlow.Evaluate(424),template=source.actors[0];
    const frame={...source,actors:[{...template,id:'Visible',pose:'stand',p:[-2,-2]},{...template,id:'Hidden',pose:'stand',p:[0,3]},
      {...template,id:'Partial',pose:'stand',p:[2.5,3]}],effects:[],dialogue:[]};
    const layers={names:false,landmarks:false};
    const Draw=()=>{view.baseKey='';view.Draw(frame,layers,null);return canvas.getContext('2d').getImageData(0,0,320,240).data;};
    const gl=view.raster.gpu?.gl,read=gl?.readPixels;
    let reads=0;
    if(gl) gl.readPixels=function(...args){reads++;return read.apply(this,args);};
    const sparse=Draw(),renderReads=reads,stats=view.Diagnostics().actors;
    const other=document.createElement('canvas');other.style.cssText=canvas.style.cssText;document.body.append(other);
    const second=new FlowPerspectiveView(other,map,'scene');second.freeCamera={eye:[6,7,-9],yaw:-0.4,pitch:-0.5};second.Draw(frame,layers,null);
    const preserved=[...view.raster.depth],picked=view.ToWorld([160,180]);
    const full=Draw(),fullDepth=[...view.raster.depth];
    const maxError=full.reduce((maximum,value,index)=>Math.max(maximum,Math.abs(value-sparse[index])),0);
    const sameDepth=fullDepth.every((value,index)=>value===preserved[index]);
    view.baseKey='';view.Draw(frame,layers,null);
    const moving=[];
    const beforeMoving=reads;
    for(let index=0;index<4;index++) {
      frame.time+=0.1;frame.actors[0].p[0]+=0.4;
      view.Draw(frame,layers,null);const cached=canvas.getContext('2d').getImageData(0,0,320,240).data;
      const expected=Draw();
      moving.push(expected.reduce((maximum,value,pixel)=>Math.max(maximum,Math.abs(value-cached[pixel])),0));
      view.baseKey='';view.Draw(frame,layers,null);
    }
    const movingReads=reads-beforeMoving;
    if(gl) gl.readPixels=read;
    canvas.remove();other.remove();return {maxError,sameDepth,picked,renderReads,movingReads,stats,moving};
  });
  assert.equal(sampledDepth.renderReads,0,'scene depth stays on the GPU when drawing the world and labels');
  assert.equal(sampledDepth.movingReads,0,'moving actors and reused backgrounds do not read WebGL depth');
  assert.ok(sampledDepth.maxError<=1&&sampledDepth.sameDepth,'sampled and full depth preserve pixels and the complete lazy depth snapshot across panes');
  assert.ok(sampledDepth.stats.find(actor=>actor.id==='Hidden').hidden>0&&sampledDepth.stats.find(actor=>actor.id==='Visible').visible>0);
  assert.ok(sampledDepth.picked.every(Number.isFinite)&&sampledDepth.moving.every(error=>error<=1),
    'picking and moving actors retain correct depth while the static background is cached');
  const bodyOverlay=await page.evaluate(async()=>{
   const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
   const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:480px;height:320px';document.body.append(canvas);
   const wall={id:'wall',pos:[0,0,5],size:[4,3,1],material:'Whitebox/Plaster'};
   const map={objects:[wall],farObjects:[],labels:[],terrain:{heightAt:()=>0,roots:[]}};
   const view=new FlowPerspectiveView(canvas,map,'eye');view.lighting=null;
   const src=LevelFlow.Evaluate(0);
   const player={id:'player',kind:'person',side:'player',name:'相机',pose:'stand',p:[0,0],lookAt:[0,4],eyeHeight:1.6};
   const make=(id,x,z)=>({id,kind:'person',side:'friend',pose:'stand',name:id,p:[x,z]});
   const far=make('FAR',0,10),near=make('NEAR',0,3),partial=make('EDGE',4.4,10);
   const gl=view.raster.gpu?.gl,orig=gl?.readPixels;let reads=0;if(gl) gl.readPixels=function(...a){reads++;return orig.apply(this,a)};
   const render=(actors,dialogue=[])=>{view.baseKey='';view.Draw({...src,actors:[player,...actors],dialogue,effects:[],groups:[],triggers:[]},{names:true,landmarks:true},null);
    return canvas.getContext('2d').getImageData(0,0,480,320).data};
   const difference=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])))>2)n++;return n};
   const empty=render([]),hidden=render([far],[{actorId:'FAR',text:'不应显示',name:'FAR'}]),edge=render([partial]),front=render([near],[{actorId:'NEAR',text:'可见对白',name:'NEAR'}]);
   render([near,far]);const p=view.Vertex([0,1,3]),p2=view.Vertex([0,1.50,3]);const nearest=view.PickActor([p.x,p.y])?.id,chest=view.PickActor([p2.x,p2.y])?.id;
   render([far,near]);const reordered=view.PickActor([p.x,p.y])?.id;
   const hit=view.hits.find(h=>h.id==='NEAR'),off=hit.labelBounds&&view.PickActor([hit.labelBounds[0]+hit.labelBounds[2]-1,hit.labelBounds[1]+4])?.id;
    const labelPixel=[hit.labelBounds[0]+hit.labelBounds[2]-1,hit.labelBounds[1]+4];
    const depth=3.2,dx=(labelPixel[0]-view.width/2)/view.focal,dy=(view.height*.49-labelPixel[1])/view.focal;
    const world=view.eye.map((v,i)=>v+depth*(view.forward[i]+dx*view.right[i]+dy*view.up[i]));
    const underLabel=make("BODY",world[0],world[2]);underLabel.surfaceY=world[1]-.8;
    render([near,underLabel]);const overlap=view.PickActor(labelPixel)?.id;
    if(gl) gl.readPixels=orig;
    canvas.remove();
    return {overlap,hidden:difference(empty,hidden),partial:difference(empty,edge),visible:difference(empty,front),
      nearest,chest,reordered,off:off??null,reads};
  });
  assert.equal(bodyOverlay.hidden,0,"a wall hides both the actor and its GPU name and speech in eye view");
  assert.ok(bodyOverlay.partial>0&&bodyOverlay.visible>bodyOverlay.partial,"exposed limbs and foreground labels remain visible");
  assert.deepEqual([bodyOverlay.nearest,bodyOverlay.chest,bodyOverlay.reordered],["NEAR","NEAR","NEAR"],
    "the ray hits the closest body or head independently of actor order");
  assert.equal(bodyOverlay.overlap,"BODY","a label over another body does not intercept its ray");
  assert.equal(bodyOverlay.off,null,"a ray into nameplate pixels outside the body misses");
  assert.equal(bodyOverlay.reads,0,"looking, moving actors, dialogue and body picking never read GPU depth");
  const bankLighting = await page.evaluate(async () => {
    const {FlowPerspectiveView} = await import('./Script_LevelFlowPerspective.mjs');
    const {FLOW_RENDERING} = await import('../Data_Tuning_LevelFlow.mjs');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:-2000px;width:320px;height:240px';
    document.body.append(canvas); canvas.width = 320; canvas.height = 240;
    const HeightAt = (x, z) => {
      const t = Math.max(0, Math.min(1, (Math.abs(x - z * 0.14) - 2) / 1.5));
      return -2 + 2 * t * t * (3 - 2 * t);
    };
    const NormalAt = ([x, , z]) => {
      const normal = [HeightAt(x - 0.5, z) - HeightAt(x + 0.5, z), 1,
        HeightAt(x, z - 0.5) - HeightAt(x, z + 0.5)];
      return normal.map(value => value / Math.hypot(...normal));
    };
    const view = new FlowPerspectiveView(canvas, {objects:[], farObjects:[], terrain:{heightAt:HeightAt, roots:[]}}, 'scene');
    view.freeCamera = {eye:[0, 1, -6], yaw:0, pitch:-0.12};
    view.BeforeDraw(LevelFlow.Evaluate(424));
    const faces = [];
    for (let z = -10; z < 20; z += 0.5) for (let x = -7; x < 7; x += 0.5) {
      const center = [x + 0.25, HeightAt(x + 0.25, z + 0.25), z + 0.25];
      const outline = [[x,z], [x+0.5,z], [x+0.5,z+0.5], [x,z+0.5]]
        .map(([px,pz]) => [px,HeightAt(px,pz),pz]);
      for (let index = 0; index < 4; index++) faces.push([center,outline[index],outline[(index+1)%4]]);
    }
    const Draw = (smooth, lit) => {
      view.lighting = {...FLOW_RENDERING.lighting, shadowStrength:0, aoStrength:lit?FLOW_RENDERING.lighting.aoStrength:0};
      view.raster.Begin(320,240,true); view.raster.view = view;
      view.raster.shadowVertices = new Float32Array(0);
      for (const points of faces) view.raster.WorldTriangle(points, [[184,164,128],[184,164,128],[184,164,128]], smooth?points.map(NormalAt):null);
      const context = canvas.getContext('2d');
      context.clearRect(0,0,320,240); view.raster.Flush(context,320,240);
      return {pixels:context.getImageData(0,0,320,240).data,depth:[...view.raster.depth]};
    };
    const direct = Draw(true,false), flat = Draw(false,true), smooth = Draw(true,true);
    let samples = 0, flatDarkness = 0, smoothDarkness = 0, depthError = 0;
    for (let z = 0; z <= 12; z += 0.5) for (const side of [-1,1]) for (const offset of [2.2,2.6,3,3.4]) {
      const x = z * 0.14 + side * offset, point = view.Project([x,HeightAt(x,z),z]);
      const px = Math.round(point[0]), py = Math.round(point[1]);
      if (px < 1 || py < 1 || px >= 319 || py >= 239) continue;
      const index = py * 320 + px;
      if (!Number.isFinite(direct.depth[index])) continue;
      samples++;
      flatDarkness += Math.max(0,direct.pixels[index*4]-flat.pixels[index*4]);
      smoothDarkness += Math.max(0,direct.pixels[index*4]-smooth.pixels[index*4]);
      depthError = Math.max(depthError, Math.abs(flat.depth[index]-smooth.depth[index]));
    }
    const result = {accelerated:view.raster.accelerated,samples,flatDarkness,smoothDarkness,depthError};
    canvas.remove(); return result;
  });
  assert.ok(bankLighting.accelerated && bankLighting.samples > 50, `bank lighting samples the GPU surface: ${JSON.stringify(bankLighting)}`);
  assert.ok(bankLighting.flatDarkness > 100 && bankLighting.smoothDarkness < bankLighting.flatDarkness * 0.6,
    `smooth terrain lighting suppresses repeated dark fan ridges: ${JSON.stringify(bankLighting)}`);
  assert.equal(bankLighting.depthError,0,'smooth bank lighting preserves picking and occlusion depth');
  const terrainSun=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {FLOW_RENDERING}=await import('../Data_Tuning_LevelFlow.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';
    canvas.width=320;canvas.height=240;document.body.append(canvas);
    const texture={minX:-20,minZ:-20,texelM:40,width:2,height:2,data:new Uint8Array(Array(4).fill([180,160,120,255]).flat())};
    const normal=FLOW_RENDERING.sky.sunDirection.map(value=>value/Math.hypot(...FLOW_RENDERING.sky.sunDirection));
    const view=new FlowPerspectiveView(canvas,{objects:[],farObjects:[],terrain:{heightAt:()=>0,roots:[],
      surfaceMaps:()=>({scene:texture,backdrop:null})}},'scene');
    view.freeCamera={eye:[0,3,-3],yaw:0,pitch:-0.55};
    view.lighting={...FLOW_RENDERING.lighting,shadowStrength:0,aoStrength:0};
    const frame=LevelFlow.Evaluate(0),points=[[-10,0,-10],[10,0,-10],[10,0,10],[-10,0,10]];
    const Draw=(direction)=>{
      view.BeforeDraw(frame);view.raster.Begin(320,240,true);view.raster.view=view;
      view.raster.terrainSurface=view.mapData.terrain.surfaceMaps();view.raster.shadowVertices=new Float32Array(0);
      for(const face of [[0,1,2],[0,2,3]]) view.raster.WorldTriangle(face.map(index=>points[index]),
        [[180,160,120],[180,160,120],[180,160,120]],Array(3).fill(direction));
      const context=canvas.getContext('2d');view.raster.Flush(context,320,240);
      const at=view.Project([0,0,2]);return context.getImageData(Math.round(at[0]),Math.round(at[1]),1,1).data[0];
    };
    const facing=Draw(normal),back=Draw(normal.map(value=>-value));canvas.remove();return {facing,back};
  });
  assert.ok(terrainSun.facing>terrainSun.back+60&&terrainSun.back>60,
    `terrain uses the real sun direction with ambient light on its backlit side: ${JSON.stringify(terrainSun)}`);
  const backgroundCache=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320.5px;height:240.5px';document.body.append(canvas);
    const view=new FlowPerspectiveView(canvas,{objects:[],farObjects:[],terrain:{heightAt:()=>0,roots:[]},ramps:[]},'scene');
    view.freeCamera={eye:[0,2,0],yaw:0,pitch:0};
    const sample=LevelFlow.Evaluate(384),vehicle={id:'CacheCart',kind:'cart',p:[2000,30],heading:0,side:'friend',pose:'walk'};
    const player={...sample.actors[0],p:[0,10],pose:'stand'};
    sample.actors=[player,vehicle];sample.effects=[];sample.zone=null;
    let draws=0;const original=view.DrawBase.bind(view);view.DrawBase=(...args)=>{draws++;original(...args);};
    const Draw=()=>{sample.time+=0.01;view.Draw(sample,{},null);};
    Draw();const initial=draws;vehicle.p=[2001,30];Draw();const offscreen=draws;
    vehicle.p=[0,12];Draw();const enter=draws,visiblePixels=canvas.toDataURL();
    vehicle.p=[1,12];Draw();const move=draws,movedPixels=canvas.toDataURL();
    vehicle.p=[2000,30];Draw();const leave=draws,emptyPixels=canvas.toDataURL();
    player.carryingAmmo=true;Draw();const carrying=draws;player.p=[1,10];Draw();const carriedMove=draws;
    const background=view.baseCanvas.toDataURL();view.baseKey='';Draw();const stableEdges=background===view.baseCanvas.toDataURL();
    canvas.remove();return {initial,offscreen,enter,move,leave,carrying,carriedMove,visibleChanged:visiblePixels!==movedPixels,cleared:emptyPixels!==movedPixels,stableEdges};
  });
  assert.equal(backgroundCache.initial,1);
  assert.equal(backgroundCache.offscreen,1,'offscreen motion does not redraw or read back either static background');
  assert.deepEqual([backgroundCache.enter,backgroundCache.move,backgroundCache.leave,backgroundCache.carrying,backgroundCache.carriedMove],[2,3,4,5,6],
    'entering, moving, leaving and carried boxes invalidate the current color/depth frame');
  assert.ok(backgroundCache.visibleChanged&&backgroundCache.cleared,'cached backgrounds neither freeze moving vehicles nor retain their trails');
  assert.ok(backgroundCache.stableEdges,'fractional CSS dimensions do not accumulate color at the canvas edge');
  const mapTerrainCache=await page.evaluate(async()=>{
    const {FlowMapView}=await import('./Script_LevelFlowView.mjs');
    const {FLOW_RENDERING}=await import('../Data_Tuning_LevelFlow.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320.5px;height:240.5px';document.body.append(canvas);
    const context=canvas.getContext('2d');canvas.width=641;canvas.height=481;context.scale(2,2);
    let samples=0,layoutReads=0;
    const height=(x,z)=>{samples++;return Math.sin(x*.13)+Math.cos(z*.1);};
    const map={terrain:{bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000},preAt:height}};
    const view=new FlowMapView(canvas,map);
    const rect=canvas.getBoundingClientRect.bind(canvas);
    canvas.getBoundingClientRect=()=>{layoutReads++;return rect();};
    const Draw=()=>{context.clearRect(0,0,320.5,240.5);view.DrawTerrain(context,320.5,240.5);return canvas.toDataURL();};
    const results=[];
    for(const scale of [.5,2.4,6,15]) {
      view.scale=scale;view.center=[40,60];Draw();const before=samples;
      Draw();const reused=samples===before;
      view.center=[40+1/scale,60+1/scale];const moved=Draw(),afterMove=samples;
      view.terrainTiles.clear();const rebuilt=Draw();
      results.push({reused,panSamples:afterMove-before,equal:moved===rebuilt});
    }
    view.scale=2.4;Draw();const beforeSame=samples;
    view.scale=2.6;Draw();const sameLevel=samples===beforeSame,beforeZoom=samples;
    view.scale=3;Draw();const zoomed=samples>beforeZoom,beforeReplace=samples;
    map.terrain={...map.terrain,preAt:(x,z)=>height(x,z)*2};Draw();const replaced=samples>beforeReplace;
    for(let index=0;index<140;index++) {view.center=[-900+index*13,0];Draw();}
    const bounded=view.terrainTiles.size<=FLOW_RENDERING.mapTerrain.maxTiles;
    view.center=[40,60];const returned=Draw();view.terrainTiles.clear();const rebuilt=Draw();
    canvas.remove();return {results,sameLevel,zoomed,replaced,bounded,returned:returned===rebuilt,layoutReads};
  });
  assert.ok(mapTerrainCache.results.every(result=>result.reused&&result.equal&&result.panSamples===0),
    '2D pan reuses world-aligned terrain tiles and matches a fresh draw at every tested zoom');
  assert.ok(mapTerrainCache.sameLevel,'zooming within one terrain level only rescales the cached tiles');
  assert.ok(mapTerrainCache.zoomed&&mapTerrainCache.replaced&&mapTerrainCache.bounded&&mapTerrainCache.returned,
    'terrain tiles rebuild for level and source changes, stay bounded, and recover after eviction');
  assert.equal(mapTerrainCache.layoutReads,0,'terrain sampling never reads layout per cell');
  const landmarkLabels=await page.evaluate(async()=>{
    const {FlowMapView}=await import('./Script_LevelFlowView.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';document.body.append(canvas);
    const map={paint:[],fieldZones:[],fields:[],footpaths:[],trenches:[],floors:[],river:[],objects:[],markers:[],ramps:[],
      roads:[{points:[[-4,0],[4,0]],width:1,caps:['from']}],labels:[{name:'测试掩体',p:[0,0]}]};
    const view=new FlowMapView(canvas,map);view.center=[0,0];view.scale=5;
    const frame={...LevelFlow.Evaluate(384),actors:[{id:'player',pose:'stand',p:[10000,10000],side:'player'}],effects:[],triggers:[],groups:[]};
    const background=view.baseCanvas.getContext('2d'),fillText=background.fillText.bind(background);
    let labels=[];background.fillText=(text,...args)=>{labels.push(text);fillText(text,...args);};
    view.Draw(frame,{landmarks:true},null);const shown=canvas.toDataURL(),initial=[...labels];
    labels=[];view.Draw(frame,{landmarks:false},null);const hidden=canvas.toDataURL(),off=[...labels];
    labels=[];view.Draw(frame,{landmarks:true},null);const restored=canvas.toDataURL(),on=[...labels];
    view.Draw(frame,{},null);const legacy=canvas.toDataURL();
    canvas.remove();return {initial,off,on,changed:shown!==hidden,restored:shown===restored,legacy:shown===legacy};
  });
  assert.deepEqual(landmarkLabels.initial,['死巷','测试掩体']);
  assert.deepEqual(landmarkLabels.off,[],'turning scene names off invalidates the background and omits its text');
  assert.deepEqual(landmarkLabels.on,landmarkLabels.initial);
  assert.ok(landmarkLabels.changed&&landmarkLabels.restored&&landmarkLabels.legacy,'scene labels toggle without moving the camera and older settings keep labels visible');
  const restoredMapObjects=await page.evaluate(async()=>{
    const {BuildEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const {FlowMapView}=await import('./Script_LevelFlowView.mjs');
    const scene=await (await fetch('../Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json')).json();
    const map=BuildEncounterMap(scene),canvas=document.createElement('canvas');
    canvas.width=320;canvas.height=240;
    canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';document.body.append(canvas);
    const view=new FlowMapView(canvas,map),context=canvas.getContext('2d');
    view.center=[70,525];view.scale=8;
    const frame=LevelFlow.Evaluate(530),objects=map.objects;
    const Draw=()=>{
      view.DrawBase(context,320,240,frame,{landmarks:false});
      return context.getImageData(0,0,320,240).data;
    };
    map.objects=objects.filter(object=>!/^11–18/.test(object.group||''));
    const before=Draw();map.objects=objects;const after=Draw();
    let changedPixels=0;
    for(let index=0;index<before.length;index+=4) {
      if(before[index]!==after[index]||before[index+1]!==after[index+1]||before[index+2]!==after[index+2]) changedPixels++;
    }
    const names=[];context.fillText=text=>names.push(text);
    for(const id of ['LmGengGrove','LmWell_GardenNW','LmThreshing1','LmOuterPond','LmShop']) {
      const label=map.labels.find(entry=>entry.id===id);
      view.mapData={...map,labels:[label]};view.center=[...label.p];view.scale=5;
      view.DrawLandmarks(context,320,240);
    }
    canvas.remove();return {changedPixels,names};
  });
  assert.ok(restoredMapObjects.changedPixels>100,'southern courtyard walls and props appear through the normal 2D background renderer');
  assert.deepEqual(restoredMapObjects.names,['耿家林','浇地井（西北菜园）','场院（北）','取土坑（庄东北）','杂货铺'],
    'original grove, well, threshing ground, pond and shop labels reach the canvas');
  const perspectiveLandmarks=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:640px;height:360px';document.body.append(canvas);
    const map={objects:[],farObjects:[],terrain:{heightAt:()=>0,roots:[]},labels:[
      {name:'关帝庙',p:[-6,8]},{name:'土地庙',p:[6,8]},{name:'背后地标',p:[0,-80]},{name:'远裁剪外',p:[0,2000]},
    ]};
    const view=new FlowPerspectiveView(canvas,map,'scene');view.scale=0.15;view.freeCamera={eye:[0,15,-20],yaw:0,pitch:-0.45};
    const source=LevelFlow.Evaluate(424);
    const frame={...source,actors:source.actors.map(actor=>({...actor,p:[10000,10000]})),effects:[],triggers:[],groups:[]};
    const context=view.baseCanvas.getContext('2d'),fillText=context.fillText.bind(context);
    let drawn=[];context.fillText=(text,...args)=>{drawn.push(text);fillText(text,...args);};
    const overlay=view.raster.gpu?.overlay,billboard=overlay?.Billboard;
    if(overlay) overlay.Billboard=function(key,...args) {
      if(key[0]==="label") drawn.push(key[1]);
      return billboard.call(this,key,...args);
    };
    view.Draw(frame,{landmarks:true},null);const shown=canvas.toDataURL(),initial=[...drawn];
    drawn=[];view.Draw(frame,{landmarks:false},null);const hidden=canvas.toDataURL(),off=[...drawn];
    drawn=[];view.Draw(frame,{landmarks:true},null);const restored=canvas.toDataURL(),on=[...drawn];
    if(overlay) overlay.Billboard=billboard;
    canvas.remove();return {initial,off,on,changed:shown!==hidden,restored:shown===restored};
  });
  assert.deepEqual(perspectiveLandmarks.initial,['关帝庙','土地庙'],'3D projects the same landmark names and clips labels behind the camera and beyond the far plane');
  assert.deepEqual(perspectiveLandmarks.off,[]);
  assert.deepEqual(perspectiveLandmarks.on,perspectiveLandmarks.initial);
  assert.ok(perspectiveLandmarks.changed&&perspectiveLandmarks.restored,'3D scene names toggle and invalidate the background cache');
  const initialLayout=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  assert.equal(initialLayout.count,1,'the editor opens with a single viewport');
  assert.deepEqual(initialLayout.views.map(view=>view.type),['scene']);
  assert.equal(await page.locator('#viewportLayout').inputValue(),'1');
  assert.equal(await page.locator('.lfViewPane:visible').count(),1);
  assert.equal(await page.locator('.lfViewFraming').count(),0,'framing actions share the top-bar camera menu');
  const cameraMenu=page.locator('.lfViewPane[data-viewport="0"] .lfViewCamera');
  await cameraMenu.locator('summary').click();
  assert.deepEqual(await cameraMenu.locator('button').allTextContents(),['重置镜头','当前剧情范围','整个关卡','自动跟随','恢复默认参数']);
  const ReadCameraSettings=()=>page.evaluate(()=> {
    const {verticalFov,near,far,speed}=LevelFlow.Packet().context.viewports.views[0];
    return {verticalFov,near,far,speed};
  });
  const defaultSettings={verticalFov:60,near:0.15,far:1500,speed:12};
  assert.deepEqual(await ReadCameraSettings(),defaultSettings);
  const SetCameraSetting=async(key,value)=>{
    const input=cameraMenu.locator(`input[name="${key}"]`);
    await input.fill(String(value));await input.press('Enter');
  };
  const testPoint=[initialLayout.views[0].center[0]+8,initialLayout.views[0].center[1]];
  const originalScreen=await page.evaluate(point=>LevelFlow.ToScreen(point),testPoint);
  await SetCameraSetting('verticalFov',42);
  const tighterScreen=await page.evaluate(point=>LevelFlow.ToScreen(point),testPoint);
  const screenCenter=initialLayout.views[0].viewport.width/2;
  assert.ok(Math.abs(tighterScreen[0]-screenCenter)>Math.abs(originalScreen[0]-screenCenter),'FOV reprojects a paused viewport');
  await SetCameraSetting('far',20);
  assert.deepEqual(await page.evaluate(point=>LevelFlow.ToScreen(point),testPoint),[-100000,-100000],'editor far plane clips projection');
  await SetCameraSetting('far',120);
  await SetCameraSetting('near',90);
  assert.deepEqual(await page.evaluate(point=>LevelFlow.ToScreen(point),testPoint),[-100000,-100000],'editor near plane clips projection');
  await SetCameraSetting('near',120);
  assert.equal(await cameraMenu.locator('input[name="near"]').getAttribute('aria-invalid'),'true');
  assert.equal((await ReadCameraSettings()).near,90,'invalid clip planes keep the last valid projection');
  await SetCameraSetting('near',0.35);
  await SetCameraSetting('speed',24);
  const tunedSettings={verticalFov:42,near:0.35,far:120,speed:24};
  assert.deepEqual(await ReadCameraSettings(),tunedSettings);
  await page.evaluate(()=>LevelFlow.RestoreViewports(LevelFlow.Packet().context.viewports));
  assert.deepEqual(await ReadCameraSettings(),tunedSettings,'frame restore retains Scene settings');
  await cameraMenu.getByRole('button',{name:'恢复默认参数'}).click();
  assert.deepEqual(await ReadCameraSettings(),defaultSettings);
  await page.screenshot({path:path.join(out,'CameraMenuSingle.png')});
  await page.keyboard.press('Escape');assert.equal(await cameraMenu.getAttribute('open'),null);
  await cameraMenu.locator('summary').click();await page.locator('#frameHeading').click();
  assert.equal(await cameraMenu.getAttribute('open'),null,'outside click closes the camera menu');
  await FrameViewport(0,'follow');
  await cameraMenu.locator('summary').click();
  assert.equal(await cameraMenu.locator('[data-framing="follow"]').textContent(),'停止跟随');
  await cameraMenu.getByRole('button',{name:'重置镜头',exact:true}).click();
  assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[0])).mode,'manual');
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[0])).freeCamera,initialLayout.views[0].freeCamera,'reset restores the default Scene camera');
  await page.selectOption('#viewportLayout','2');
  const defaults=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  assert.equal(defaults.count,2);
  assert.deepEqual(defaults.views.map(view=>view.type),['scene','scene']);
  assert.equal(await page.locator('button[title="旋转 45°"]').count(),0);
  const gizmo=page.locator('.lfViewPane[data-viewport="1"] .lfViewGizmo');
  assert.equal(await gizmo.isVisible(),true);
  const axesBefore=await gizmo.locator('[data-gizmo-axis]').evaluateAll(buttons=>buttons.map(button=>[button.style.left,button.style.top]));
  const gizmoBox=await gizmo.boundingBox();
  await page.mouse.move(gizmoBox.x+48,gizmoBox.y+48);await page.mouse.down();
  await page.mouse.move(gizmoBox.x+76,gizmoBox.y+64,{steps:6});await page.mouse.up();
  const gizmoRotated=await page.evaluate(()=>LevelFlow.Inspect().viewports.views);
  assert.notEqual(gizmoRotated[1].freeCamera.yaw,defaults.views[1].freeCamera.yaw,'dragging XYZ orbits the camera');
  assert.notEqual(gizmoRotated[1].freeCamera.pitch,defaults.views[1].freeCamera.pitch);
  assert.deepEqual(gizmoRotated[0],defaults.views[0],'XYZ controls belong to their own viewport');
  assert.equal(gizmoRotated[1].focusDistance,defaults.views[1].focusDistance,'orbit retains zoom distance');
  const axesAfter=await gizmo.locator('[data-gizmo-axis]').evaluateAll(buttons=>buttons.map(button=>[button.style.left,button.style.top]));
  assert.notDeepEqual(axesAfter,axesBefore,'XYZ directions track the actual camera orientation');
  await page.mouse.move(gizmoBox.x+48,gizmoBox.y+48);await page.mouse.down();
  await page.keyboard.press('Escape');
  await page.mouse.move(gizmoBox.x+20,gizmoBox.y+20,{steps:3});await page.mouse.up();
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).freeCamera,gizmoRotated[1].freeCamera,'Escape releases the XYZ drag');
  assert.equal(await gizmo.evaluate(element=>element.classList.contains('lfGizmoDragging')),false);
  await gizmo.locator('[data-gizmo-axis="+X"]').click();
  assert.ok(Math.abs((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).freeCamera.yaw+Math.PI/2)<1e-9,'clicking X aligns the view');
  await gizmo.locator('[data-gizmo-axis="+Y"]').focus();await page.keyboard.press('Enter');
  assert.ok((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).freeCamera.pitch<-1.5,'axis buttons support keyboard alignment');
  await page.evaluate(()=>LevelFlow.SetViewType(1,'plan'));
  assert.equal(await gizmo.isVisible(),false,'2D views hide the 3D orientation control');
  const zoomStamp=await page.evaluate(()=>LevelFlow.Inspect().time);
  await page.evaluate(()=>{
    LevelFlow.Seek(1408);
    const layout=LevelFlow.Inspect().viewports;
    Object.assign(layout.views[1],{type:'oblique',mode:'manual',center:[64.7,450],scale:40,freeCamera:null});
    LevelFlow.RestoreViewports(layout);
  });
  const zoomBox=await page.locator('#flowMap2').boundingBox();
  await page.mouse.move(zoomBox.x+zoomBox.width/2,zoomBox.y+zoomBox.height/2);
  await page.mouse.wheel(0,-1000);
  await page.waitForFunction(()=>LevelFlow.Inspect().viewports.views[1].scale>80);
  const closeView=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
  assert.ok(closeView.scale>80,'wheel zoom passes both the old interactive and saved-view ceilings');
  await page.screenshot({path:path.join(out,'ViewportCloseZoom.png')});
  await page.mouse.wheel(0,-3000);
  await page.waitForFunction(()=>LevelFlow.Inspect().viewports.views[1].scale===320);
  const maxZoom=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),maxZoom);
  assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).scale,320,'restoring keeps the enlarged zoom');
  const zoomPacket=await page.evaluate(()=>LevelFlow.Packet());
  assert.equal(ReadFramePacket(zoomPacket,FLOW_TIMELINE).context.view.scale,320,'high-zoom frame packets remain readable');
  await page.mouse.wheel(0,3000);
  await page.waitForFunction(()=>LevelFlow.Inspect().viewports.views[1].scale<40);
  await page.evaluate(({defaults,zoomStamp})=>{LevelFlow.RestoreViewports(defaults);LevelFlow.Seek(zoomStamp);},{defaults,zoomStamp});
  const viewMenus=await page.locator('.lfViewBar > select:first-of-type').evaluateAll(selects=>selects.map(select=>
    [...select.children].map(group=>({label:group.label,options:[...group.children].map(option=>[option.value,option.textContent])}))));
  assert.equal(viewMenus.length,4);
  for(const menu of viewMenus) assert.deepEqual(menu,[
    {label:'2D',options:[['battle','战斗局部']]},
    {label:'3D',options:[['scene','Scene 自由视角'],['chase','跟拍'],['eye','玩家视线']]},
  ],'every viewport exposes only the four requested views under 2D and 3D');
  assert.ok(defaults.views.every(view=>view.mode==='manual'&&view.freeCamera));
  assert.ok(defaults.views[0].freeCamera.pitch<-0.5&&defaults.views[1].focusDistance<defaults.views[0].focusDistance/2,'the default pair provides an aerial and a near-ground Scene camera');
  const sceneBefore=await page.evaluate(()=>LevelFlow.Inspect());
  await FrameViewport(1,'follow');
  const sceneFollowing=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(sceneFollowing.viewports.views[1].type,'scene','enabling follow preserves the perspective Scene camera');
  assert.equal(sceneFollowing.viewports.views[1].mode,'follow');
  assert.deepEqual(sceneFollowing.viewports.views[1].freeCamera,sceneBefore.viewports.views[1].freeCamera,'enabling follow preserves position and orientation');
  assert.deepEqual(sceneFollowing.rendering[1].aim,sceneBefore.rendering[1].aim,'enabling follow preserves perspective projection');
  const followingSceneBox=await page.locator('#flowMap2').boundingBox();
  await page.mouse.move(followingSceneBox.x+followingSceneBox.width/2,followingSceneBox.y+followingSceneBox.height/2);
  await page.keyboard.down('Alt');await page.mouse.down({button:'right'});
  await page.mouse.move(followingSceneBox.x+followingSceneBox.width/2+12,followingSceneBox.y+followingSceneBox.height/2+8,{steps:3});
  await page.mouse.up({button:'right'});await page.keyboard.up('Alt');
  await page.mouse.wheel(0,-80);
  const sceneZoomed=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
  assert.equal(sceneZoomed.mode,'follow');assert.equal(sceneZoomed.type,'scene');
  assert.notEqual(sceneZoomed.focusDistance,sceneFollowing.viewports.views[1].focusDistance,'perspective zoom moves the following camera');
  await page.evaluate(()=>{LevelFlow.SetPlaying(true);});
  await page.waitForFunction(()=>LevelFlow.Inspect().time>424.1);
  await page.evaluate(()=>{LevelFlow.SetPlaying(false);LevelFlow.Seek(640);});
  const sceneMoved=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
  assert.notDeepEqual(sceneMoved.followAnchor,sceneZoomed.followAnchor);
  for(let axis=0;axis<3;axis++) assert.ok(Math.abs((sceneMoved.freeCamera.eye[axis]-sceneZoomed.freeCamera.eye[axis])
    -(sceneMoved.followAnchor[axis]-sceneZoomed.followAnchor[axis]))<1e-9,'camera and subject translate together in all three axes');
  assert.equal(sceneMoved.freeCamera.yaw,sceneZoomed.freeCamera.yaw);assert.equal(sceneMoved.freeCamera.pitch,sceneZoomed.freeCamera.pitch);
  assert.equal(sceneMoved.focusDistance,sceneZoomed.focusDistance);
  await page.evaluate(()=>LevelFlow.RestoreViewports(LevelFlow.Inspect().viewports));
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).freeCamera,sceneMoved.freeCamera,'restoring a following Scene preserves its camera');
  await page.evaluate(()=>LevelFlow.Seek(424));
  const sceneRewound=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
  for(let axis=0;axis<3;axis++) assert.ok(Math.abs(sceneRewound.freeCamera.eye[axis]-sceneZoomed.freeCamera.eye[axis])<1e-9,'rewinding restores the following camera offset');
  await FrameViewport(1,'follow');
  await page.evaluate(()=>LevelFlow.Seek(640));
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).freeCamera,sceneRewound.freeCamera,'stopping follow holds the perspective camera in place');
  await page.evaluate(defaults=>{LevelFlow.Seek(424);LevelFlow.RestoreViewports(defaults);},defaults);
  for(const type of ['plan','battle','oblique','chase','eye']) {
    await page.evaluate(type=>{
      LevelFlow.SetPlaying(false);LevelFlow.Seek(424);LevelFlow.SetViewType(1,type);
      const layout=LevelFlow.Inspect().viewports;layout.views[1].mode='follow';
      LevelFlow.RestoreViewports(layout);
    },type);
    assert.equal(await page.locator('.lfViewPane[data-viewport="1"] .lfViewBar > select').first().inputValue(),
      ({plan:'battle',oblique:'scene'})[type]||type,'legacy projections retain a visible compatible menu selection');
    const initial=await page.evaluate(()=>LevelFlow.Inspect().viewports.views);
    const box=await page.locator('#flowMap2').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.keyboard.down('Alt');await page.mouse.down({button:'right'});
    assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).mode,'follow',`${type} zoom press preserves follow`);
    await page.mouse.move(box.x+box.width/2+15,box.y+box.height/2+10,{steps:3});
    await page.mouse.up({button:'right'});await page.keyboard.up('Alt');
    const dragged=await page.evaluate(()=>LevelFlow.Inspect().viewports.views);
    assert.equal(dragged[1].type,type);assert.equal(dragged[1].mode,'follow');
    assert.ok(dragged[1].scale<initial[1].scale,`${type} Alt RMB changes the following zoom`);
    assert.deepEqual(dragged[0],initial[0],`${type} zoom leaves the other viewport unchanged`);
    await page.mouse.wheel(0,-180);
    const zoomed=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
    assert.equal(zoomed.mode,'follow');assert.equal(zoomed.type,type);
    assert.ok(zoomed.scale>dragged[1].scale,`${type} wheel changes the following zoom`);
    await page.evaluate(()=>LevelFlow.Seek(424));
    assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).scale,zoomed.scale,`${type} redraw retains zoom`);
    await page.evaluate(()=>{LevelFlow.SetPlaying(true);});
    await page.waitForFunction(()=>LevelFlow.Inspect().time>424.1);
    await page.mouse.wheel(0,80);
    await page.evaluate(()=>LevelFlow.SetPlaying(false));
    const playingZoom=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
    assert.equal(playingZoom.mode,'follow');assert.equal(playingZoom.type,type);
    assert.ok(playingZoom.followZoom<zoomed.followZoom,`${type} zoom works during playback`);
    await page.evaluate(()=>LevelFlow.Seek(640));
    const moved=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
    assert.notDeepEqual(moved.center,zoomed.center,`${type} camera keeps following the moving subject`);
    assert.equal(moved.followZoom,playingZoom.followZoom,`${type} seeking retains the zoom adjustment`);
    await page.evaluate(()=>LevelFlow.RestoreViewports(LevelFlow.Inspect().viewports));
    assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).followZoom,playingZoom.followZoom,`${type} viewport round-trip retains zoom`);
    await FrameViewport(1,'follow');
    assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).mode,'manual',`${type} follow can still be stopped explicitly`);
  }
  await page.evaluate(defaults=>{
    for(const view of defaults.views) delete view.followZoom;
    LevelFlow.RestoreViewports(defaults);
  },defaults);
  assert.ok((await page.evaluate(()=>LevelFlow.Inspect().viewports.views)).every(view=>view.followZoom===1),'older viewport layouts default to unmodified zoom');
  for(const type of ['scene','plan','battle','oblique','chase','eye']) {
    await page.evaluate(type=>LevelFlow.SetViewType(1,type),type);
    for(const playing of [true,false]) {
      await page.evaluate(playing=>{LevelFlow.Seek(424);LevelFlow.SetPlaying(playing);},playing);
      const box=await page.locator('#flowMap2').boundingBox();
      const x=box.x+box.width/2,y=box.y+24;
      await page.mouse.move(x,y);await page.mouse.down();
      assert.equal(await page.evaluate(()=>LevelFlow.Inspect().playing),playing,`${type} mouse press preserves playback`);
      const start=await page.evaluate(()=>LevelFlow.Inspect().time);
      await page.mouse.move(x+35,y+20,{steps:4});
      if(playing) await page.waitForFunction(start=>LevelFlow.Inspect().time>start,start);
      else assert.equal(await page.evaluate(()=>LevelFlow.Inspect().time),start,`${type} drag keeps paused time fixed`);
      assert.equal(await page.locator('#playFlow').getAttribute('aria-pressed'),String(playing));
      await page.mouse.up();
      assert.equal(await page.evaluate(()=>LevelFlow.Inspect().playing),playing,`${type} mouse release preserves playback`);
      await page.mouse.click(x,y);
      assert.equal(await page.evaluate(()=>LevelFlow.Inspect().playing),playing,`${type} click preserves playback`);
      await page.evaluate(()=>LevelFlow.SetPlaying(false));
    }
  }
  await page.evaluate(defaults=>LevelFlow.RestoreViewports(defaults),defaults);
  await page.evaluate(()=>LevelFlow.Seek(640));
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect().viewports.views)).map(view=>view.freeCamera),defaults.views.map(view=>view.freeCamera),'scrubbing preserves both manually controlled Scene cameras');
  await page.evaluate(()=>LevelFlow.Seek(424));
  await page.evaluate(()=>{
    LevelFlow.SetViewType(0,'oblique');LevelFlow.SetViewType(1,'battle');
    const layout=LevelFlow.Inspect().viewports;
    for(const view of layout.views) {
      view.center=[36.5,66.5];view.scale=15;view.mode='manual';view.freeCamera=null;
      view.yaw=-0.4;view.pitch=0.65;
    }
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(156.4);
  });
  const meleeFrame=await page.evaluate(()=>LevelFlow.Inspect());
  for(const id of ['opening6','opening7','opening8']) {
    const enemy=meleeFrame.actors.find(actor=>actor.id===id);
    assert.equal(enemy.pose,'melee');
    assert.equal(meleeFrame.actors.find(actor=>actor.id===enemy.meleePartnerId).pose,'melee');
  }
  await page.screenshot({path:path.join(out,'OpeningRearMelee.png')});
  await page.evaluate(()=>{
    const layout=LevelFlow.Inspect().viewports;
    for(const view of layout.views) {view.center=[28,63];view.scale=9;}
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(163.9);
  });
  const fugitives=(await page.evaluate(()=>LevelFlow.Inspect())).actors.filter(actor=>actor.groupId==='OpeningSurvivors');
  assert.equal(fugitives.length,3);
  assert.ok(fugitives.every(actor=>actor.pose==='run'&&actor.p[0]<27),'the three fugitives have already cleared the crowd in the reported 02G frame');
  await page.screenshot({path:path.join(out,'OpeningMeleeDisengaged.png')});
  await page.evaluate(defaults=>{LevelFlow.Seek(185);LevelFlow.Seek(156.4);LevelFlow.RestoreViewports(defaults);LevelFlow.Seek(424);},defaults);
  const skyPixels=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';document.body.append(canvas);
    const view=new FlowPerspectiveView(canvas,{objects:[],farObjects:[],terrain:{heightAt:()=>0,roots:[]}},'scene');
    view.freeCamera={eye:[0,1.6,0],yaw:0,pitch:0.3};view.Draw(LevelFlow.Evaluate(424),{},null);
    const context=canvas.getContext('2d'),pixels=[20,210].map(y=>[...context.getImageData(160,y,1,1).data]);
    canvas.remove();return pixels;
  });
  assert.ok(skyPixels[0][2]>skyPixels[0][0]+15&&skyPixels[0][0]<180,'the sky dome has a blue zenith');
  assert.notDeepEqual(skyPixels[0],skyPixels[1],'the sky has an elevation gradient');
  await page.evaluate(()=>{LevelFlow.SetViewType(0,'plan');LevelFlow.SetViewType(1,'oblique');LevelFlow.ActivateView(0);});
  assert.equal(await page.locator("h1").textContent(),"Encounter Designer");
  assert.equal(await page.title(),"Encounter Designer · 血战滕县");
  await page.evaluate(()=>LevelFlow.Seek(205));
  const junctionBlockers=(await page.evaluate(()=>LevelFlow.Inspect())).actors.filter(actor=>["OpeningSurvivors","ForkRelief"].includes(actor.groupId));
  assert.equal(junctionBlockers.length,5);
  assert.ok(junctionBlockers.every(actor=>actor.pose==="shoot"));
  await page.screenshot({path:path.join(out,"JunctionBlockade.png")});
  const returnViews=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  await page.evaluate(()=>{
    LevelFlow.SetViewType(0,"battle");LevelFlow.SetViewType(1,"battle");
    const layout=LevelFlow.Inspect().viewports;
    layout.views[0].mode="manual";layout.views[0].center=[43,67];layout.views[0].scale=10;
    layout.views[1].mode="manual";layout.views[1].center=[33,116];layout.views[1].scale=6;
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(298.6793);
  });
  const woundedEvacuation=await page.evaluate(()=>LevelFlow.Inspect());
  const walkingWounded=woundedEvacuation.actors.filter(actor=>actor.groupId==="WalkingWounded");
  assert.equal(walkingWounded.length,2);
  assert.ok(walkingWounded.every(actor=>actor.wounded&&actor.alive&&!actor.firing&&actor.p[1]>110));
  assert.ok(woundedEvacuation.actors.find(actor=>actor.id==="luo").p[1]>=73);
  await page.screenshot({path:path.join(out,"WalkingWoundedEvacuation.png")});
  await page.evaluate(()=>{
    LevelFlow.SetViewType(0,"oblique");LevelFlow.SetViewType(1,"battle");
    const layout=LevelFlow.Inspect().viewports;
    for(const view of layout.views) {view.mode="manual";view.center=[18,66];view.scale=4;view.layers.triggers=false;}
    LevelFlow.RestoreViewports(layout);
  });
  for(const [stamp,name] of [[312.442,"YaowaWoundedReturn"],[340,"NorthPursuitSpacing"],[368.077,"WestCoveredApproach"]]) {
    await page.evaluate(stamp=>LevelFlow.Seek(stamp),stamp);
    const state=await page.evaluate(()=>LevelFlow.Inspect());
    assert.equal(state.actors.filter(actor=>actor.groupId==="PitSurvivors"&&actor.alive&&actor.wounded).length,3);
    assert.ok(state.actors.filter(actor=>["Rim","RearPursuit","TrafficFlank"].includes(actor.groupId)&&actor.pose!=="dead")
      .every(actor=>Math.hypot(actor.p[0]-state.actors[0].p[0],actor.p[1]-state.actors[0].p[1])>=16));
    await page.screenshot({path:path.join(out,`${name}.png`)});
  }
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),returnViews);
  await page.evaluate(()=>LevelFlow.Seek(495.569));
  const camp = await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(camp.actors.filter(actor=>['luo','he','liu','yao'].includes(actor.id)&&actor.firing&&actor.p[1]<148).length,4);
  assert.equal(camp.actors.filter(actor=>['geng','ammoCarrier1','ammoCarrier2'].includes(actor.id)).length,3);
  assert.match(await page.locator('#planningNote').textContent(),/老耿.*搬弹药/);
  assert.equal(await page.locator('#sourcePassage').textContent(),FLOW_SOURCE_EXCERPTS['04c']);
  await page.screenshot({path:path.join(out,"CampDefense.png")});
  const campViews=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  await page.evaluate(()=>{
    LevelFlow.SetViewType(0,'oblique');LevelFlow.SetViewType(1,'plan');
    const layout=LevelFlow.Inspect().viewports;
    for(const view of layout.views) {
      view.center=[108,139];view.scale=4.5;view.mode='manual';view.freeCamera=null;
      view.yaw=0;view.pitch=0.65;
    }
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(495.569);
  });
  const groundFormation=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>['GroundWest','GroundEast'].includes(actor.groupId)));
  assert.equal(groundFormation.length,8);
  assert.ok(groundFormation.every(actor=>actor.firing&&actor.p[1]<=119.5),'squad fire holds both enemy flanks outside the camp');
  await page.screenshot({path:path.join(out,"GroundInfantryFormation.png")});
  await page.evaluate(()=>{
    const layout=LevelFlow.Inspect().viewports;
    for(const view of layout.views) {view.center=[83,150];view.scale=3.5;view.layers.triggers=false;}
    LevelFlow.RestoreViewports(layout);
  });
  const evacuationStart=FLOW_TIMELINE.find(beat=>beat.id==="04d").start;
  const withdrawalStart=FLOW_TIMELINE.find(beat=>beat.id==="05a").start;
  for(const [stamp,name] of [[evacuationStart,"CampEvacuationStart"],[withdrawalStart+12.1794,"CampAnnotatedHolding"],[withdrawalStart+35,"CampEvacuationRearGuard"]]) {
    await page.evaluate(stamp=>LevelFlow.Seek(stamp),stamp);
    const evacuation=await page.evaluate(()=>LevelFlow.Inspect());
    assert.equal(evacuation.actors.filter(actor=>['geng','ammoCarrier1','ammoCarrier2'].includes(actor.id)&&actor.pose==='run').length,3);
    assert.ok(evacuation.actors.filter(actor=>actor.coveringEvacuation&&actor.firing).length>=2);
    assert.ok(evacuation.actors.filter(actor=>['GroundWest','GroundEast'].includes(actor.groupId)&&actor.pose!=='dead').every(actor=>actor.p[1]<=119.5));
    await page.screenshot({path:path.join(out,name+'.png')});
  }
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),campViews);
  await page.evaluate(()=>LevelFlow.Seek(247.137));
  const pressure=(await page.evaluate(()=>LevelFlow.Inspect())).actors.filter(actor=>actor.groupId==="Fork");
  assert.equal(pressure.length,5);
  assert.equal(new Set(pressure.map(actor=>actor.p.join(","))).size,5);
  assert.equal(pressure.filter(actor=>actor.pose==="run").length,2);
  assert.equal(pressure.filter(actor=>actor.firing).length,3);
  await page.screenshot({path:path.join(out,"EnemyFormation.png")});
  await page.evaluate(()=>LevelFlow.Seek(438.55));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==="TrafficFlank").every(actor=>actor.born<430)),"second west-ramp batch waits until all three originals have fallen");
  await page.evaluate(()=>LevelFlow.Seek(459));
  const flankRefill=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==="TrafficFlank"&&actor.pose!=="dead"));
  assert.equal(flankRefill.length,3);
  assert.ok(flankRefill.every(actor=>actor.born>438&&actor.p[1]<85&&actor.firing),"the complete second batch holds behind cover while friendly blocking fire survives");
  await page.screenshot({path:path.join(out,"WestRampRefill.png")});
  await page.evaluate(()=>LevelFlow.Seek(424));
  const coverPixels=await page.evaluate(()=>["flowMap","flowMap2"].map(id=>{
    const canvas=document.getElementById(id),context=canvas.getContext("2d");
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;
    for(let offset=0;offset<pixels.length;offset+=4) {
      if(pixels[offset]===36&&pixels[offset+1]===70&&pixels[offset+2]===51) count++;
    }
    return count;
  }));
  assert.ok(coverPixels.every(count=>count>10),"plan and oblique views show dark green cover outlines and shields");
  assert.equal(await page.locator("#flowCamera").count(),0);
  assert.equal(await page.locator("#stageList").count(),0);
  assert.equal(await page.locator("[data-stage]").count(),18);
  assert.ok((await page.evaluate(()=>window.LevelFlow.Inspect())).mapObjects>1000);
  assert.equal(await page.locator('.lfViewPane:visible').count(),2);
  const dualPanes=await page.locator('.lfViewPane:visible').evaluateAll(panes=>panes.map(pane=>{
    const {x,y,width,height}=pane.getBoundingClientRect();return {x,y,width,height};
  }));
  assert.ok(Math.abs(dualPanes[0].width-dualPanes[1].width)<1&&dualPanes[0].y===dualPanes[1].y,
    'two viewports divide the workspace into equal left and right columns');
  await page.selectOption('#viewportLayout','3');
  assert.equal(await page.locator('.lfViewPane:visible').count(),3);
  const triple=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  assert.equal(triple.count,3);assert.equal(triple.views.length,3);
  const triplePanes=await page.locator('.lfViewPane:visible').evaluateAll(panes=>panes.map(pane=>{
    const {x,y,width,height}=pane.getBoundingClientRect();return {x,y,width,height};
  }));
  assert.ok(triplePanes[0].height>triplePanes[1].height*1.9&&triplePanes[1].x===triplePanes[2].x
    &&triplePanes[0].x<triplePanes[1].x&&triplePanes[1].y<triplePanes[2].y
    &&Math.abs(triplePanes[0].width-triplePanes[1].width)<1,
    'three viewports provide one full-height left pane and two stacked right panes');
  await page.evaluate(triple=>{LevelFlow.SetLayout(4);LevelFlow.RestoreViewports(triple);},triple);
  assert.equal((await page.evaluate(()=>LevelFlow.Packet().context.viewports)).count,3,'frame packets retain the three-viewport layout');
  await page.screenshot({path:path.join(out,'ThreeViewports.png')});
  await page.selectOption('#viewportLayout','2');
  await page.evaluate(()=>LevelFlow.SetViewType(1,'scene'));
  const hoverPicks=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const original=FlowPerspectiveView.prototype.ToWorld;
    let calls=0;
    FlowPerspectiveView.prototype.ToWorld=function(...args) {calls++;return original.apply(this,args);};
    try {
      const canvas=document.getElementById('flowMap2'),rect=canvas.getBoundingClientRect();
      for(let index=0;index<20;index++) canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.x+index+10,clientY:rect.y+10}));
      return calls;
    } finally {FlowPerspectiveView.prototype.ToWorld=original;}
  });
  assert.equal(hoverPicks,0,'Scene hover uses screen-space hits without marching a terrain ray into empty sky');
  await page.evaluate(()=>LevelFlow.SetViewType(1,'oblique'));
  await page.selectOption('#viewportLayout','4');
  assert.equal(await page.locator('.lfViewPane:visible').count(),4);
  await page.evaluate(()=>{LevelFlow.SetViewType(1,'plan');LevelFlow.ActivateView(1);});
  const independentBefore=await page.evaluate(()=>LevelFlow.Inspect().viewports.views);
  const second=await page.locator('#flowMap2').boundingBox();
  await page.mouse.move(second.x+second.width/2,second.y+second.height/2);await page.mouse.wheel(0,-180);
  const independentAfter=await page.evaluate(()=>LevelFlow.Inspect().viewports.views);
  assert.deepEqual(independentAfter[0],independentBefore[0],"zooming viewport 2 leaves viewport 1 unchanged");
  assert.notEqual(independentAfter[1].scale,independentBefore[1].scale);
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=424&x=21.9&z=67.1&zoom=12`);await ReadyPlan();
  for(const menu of await page.locator('.lfViewPane:visible .lfViewLayers').all()) {
    await menu.locator('summary').click();
    for(const input of await menu.locator('input').all()) await input.uncheck();
    await menu.locator('summary').click();
  }
  await page.evaluate(()=>LevelFlow.ActivateView(0));
  const junctionPixels=await page.evaluate(()=>{
    const canvas=document.querySelector('#flowMap'),context=canvas.getContext('2d');
    const samples=[63,64.5,66,67.1,69,70].map(z=>[12+(z-44)*18/42,z]);
    samples.push([12+(64.5-44)*18/42+1.2,64.5]);
    return samples.map(([x,z])=>{
      const point=LevelFlow.ToScreen([x,z]);
      return [...context.getImageData(Math.round(point[0]),Math.round(point[1]),1,1).data];
    });
  });
  assert.ok(junctionPixels.every(pixel=>pixel[0]>170&&pixel[1]>150&&pixel[2]>120),"the branch T-junction has a continuous floor, with no overpainted bank cap");
  await page.screenshot({path:path.join(out,'JunctionConnectivity.png')});
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=424`);await ReadyPlan();
  for(const beat of FLOW_TIMELINE) {
    await page.evaluate((time)=>window.LevelFlow.Seek(time),beat.start+beat.duration*0.5);
    assert.equal(await page.locator("#beatTitle").textContent(),beat.title);
    assert.equal(await page.locator("#sourcePassage").textContent(),FLOW_SOURCE_EXCERPTS[beat.id],"paragraph formatting retains all script wording");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  }
  await page.evaluate(()=>window.LevelFlow.Seek(424));
  await page.screenshot({path:path.join(out,"Retreat.png")});
  await FrameViewport(0,'follow');
  const framing=await page.evaluate(()=>{
    const state=window.LevelFlow.Inspect(),canvas=document.getElementById('flowMap');
    return state.actors.filter(actor=>actor.pose!=="dead"&&Math.hypot(actor.p[0]-state.actors[0].p[0],actor.p[1]-state.actors[0].p[1])<115).map(actor=>({name:actor.name,p:window.LevelFlow.ToScreen(actor.p),width:canvas.clientWidth,height:canvas.clientHeight}));
  });
  assert.ok(framing.every(({p,width,height})=>p[0]>20&&p[1]>20&&p[0]<width-20&&p[1]<height-20),"follow keeps the player, threats and defenders inside the viewport");
  await FrameViewport(0,'stage');
  assert.equal(await page.locator('[data-tab="edit"],#editPane,#objectList,#objectForm,#undoFlow,#redoFlow').count(),0);
  const firstBefore=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[0]);
  await FrameViewport(1,'all');
  const framedViews=await page.evaluate(()=>LevelFlow.Inspect().viewports.views);
  assert.equal(framedViews[1].mode,'all');assert.deepEqual(framedViews[0],firstBefore,'viewport controls only reframe their own viewport');
  const fullMap=await page.evaluate(async()=>{
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const {bounds}=await LoadEncounterMap(),canvas=document.getElementById('flowMap2');
    return {width:canvas.clientWidth,height:canvas.clientHeight,corners:[[bounds[0],bounds[2]],[bounds[1],bounds[2]],[bounds[1],bounds[3]],[bounds[0],bounds[3]]].map(point=>LevelFlow.ToScreen(point,1))};
  });
  assert.ok(fullMap.corners.every(point=>point[0]>=20&&point[0]<=fullMap.width-20&&point[1]>=20&&point[1]<=fullMap.height-20),'the entire level fits inside the overview viewport');
  await FrameViewport(1,'follow');
  assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).mode,'follow');
  await FrameViewport(1,'follow');
  assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).mode,'manual');
  await page.click('[data-tab="chat"]');
  await page.evaluate(()=>LevelFlow.Select({type:'group',id:'RearPursuit'}));
  assert.equal(await page.locator('[data-tab="chat"]').getAttribute('class'),'selected');
  const documentBefore=await page.evaluate(()=>LevelFlow.Inspect().document);
  const mapBox=await page.locator('#flowMap').boundingBox();
  const center=await page.evaluate(()=>LevelFlow.ToScreen([20,33]));
  await page.mouse.move(mapBox.x+center[0],mapBox.y+center[1]);await page.mouse.down();
  await page.mouse.move(mapBox.x+center[0]+20,mapBox.y+center[1]+10,{steps:8});await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>LevelFlow.Inspect().document),documentBefore,'dragging a selected region only navigates the preview');
  assert.deepEqual(await page.evaluate(()=>LevelFlow.Packet().context.selection),{type:'group',id:'RearPursuit'});
  // Existing user drafts remain valid after the manual setup panel is removed.
  await page.evaluate(()=>{
    const saved=LevelFlow.Inspect().document;saved.groups.find(group=>group.id==='Fork').count=8;
    localStorage.setItem('tengxian1938_encounter_v2',JSON.stringify(saved));
  });
  await page.reload();await ReadyPlan();
  assert.equal((await page.evaluate(()=>LevelFlow.Inspect())).document.groups.find(group=>group.id==='Fork').count,8,'existing saved drafts survive the UI change');
  await page.evaluate(()=>window.LevelFlow.Seek(424));
  assert.equal(await page.locator('#exportProject,#importProject,#importFile,#planningSection,[data-tab="notes"]').count(),0);
  const layout=await page.evaluate(()=>({toolbar:document.querySelector('.lfToolbar').getBoundingClientRect().height,
    passage:document.querySelector('#sourcePassage').textContent,paragraphs:document.querySelectorAll('#sourcePassage p').length}));
  assert.ok(layout.toolbar<=52,'all navigation fits in one compact row at 720p');
  assert.ok(layout.paragraphs>1,'source passage is broken into readable paragraphs');
  async function ReadLocationAttachment() {
    await page.click('[data-tab="chat"]');
    await page.click('#attachCodexLocation');
    await page.locator('#codexPendingLocation .lfChatContext').evaluate(element=>{element.open=true;element.dispatchEvent(new Event('toggle'));});
    return page.locator('#codexContextDetail').textContent();
  }
  assert.equal(await page.locator('#copyFrame,#copyViewports').count(),0);
  const locationText=await ReadLocationAttachment();
  assert.ok(!locationText.includes('http'),'AI location contains no URL');
  const location=JSON.parse(locationText);
  assert.equal(location.timeline.timeSeconds,424);
  assert.equal(location.timeline.secondsIntoBeat,424-location.timeline.beatStartSeconds);
  assert.equal(location.viewports.length,2);assert.ok(location.player.x&&Number.isFinite(location.player.y));
  assert.equal(location.coordinates.unit,'metres');
  await page.evaluate(()=>LevelFlow.Seek(400));
  assert.equal(JSON.parse(await page.locator('#codexContextDetail').textContent()).timeline.timeSeconds,424,'location attachment stays at its captured time');
  await page.click('#removeCodexLocation');
  assert.ok(await page.locator('#codexPendingLocation').isHidden());
  await page.evaluate(()=>LevelFlow.Seek(424));
  const fireMenu=page.locator('.lfViewPane').first().locator('.lfViewLayers');
  await fireMenu.locator('summary').click();await fireMenu.locator('[data-layer="fire"]').uncheck();
  const layerState=await page.evaluate(()=>LevelFlow.Inspect().viewports.views.map(view=>view.layers));
  assert.equal(layerState[0].fire,false);assert.equal(layerState[1].fire,true,'display settings belong to each viewport');
  await fireMenu.locator('[data-layer="fire"]').check();
  await fireMenu.locator('[data-layer="importantLandmarks"]').uncheck();
  const hiddenLandmarks=await page.evaluate(()=>LevelFlow.Packet().context.viewports);
  assert.equal(hiddenLandmarks.views[0].layers.importantLandmarks,false);
  assert.equal(hiddenLandmarks.views[0].layers.landmarks,false);
  assert.equal(hiddenLandmarks.views[1].layers.importantLandmarks,true,'important scene names belong to each viewport');
  assert.equal(hiddenLandmarks.views[0].layers.names,true,'scene names leave the character-name setting independent');
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),hiddenLandmarks);
  assert.equal(await fireMenu.locator('[data-layer="importantLandmarks"]').isChecked(),false,'saved frame layouts restore the important-scene setting');
  assert.equal(await fireMenu.locator('[data-layer="landmarks"]').isChecked(),false,'saved frame layouts restore the all-scene setting');
  const invalidLandmarks=structuredClone(hiddenLandmarks);invalidLandmarks.views[0].layers.landmarks='off';
  assert.equal(await page.evaluate(layout=>{try{LevelFlow.RestoreViewports(layout);return false;}catch{return true;}},invalidLandmarks),true);
  const legacyLandmarks=structuredClone(hiddenLandmarks);
  for(const view of legacyLandmarks.views) {delete view.layers.landmarks;delete view.layers.importantLandmarks;}
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),legacyLandmarks);
  assert.equal(await fireMenu.locator('[data-layer="importantLandmarks"]').isChecked(),true,'older layouts default to visible important scene names');
  assert.equal(await fireMenu.locator('[data-layer="landmarks"]').isChecked(),false,'older layouts default to hiding minor scene names');
  await fireMenu.locator('summary').click();
  let downloads=0;page.on('download',()=>downloads++);
  await page.click('#attachCodexScreenshot');
  await page.click('#copyScreenshot');
  await page.waitForFunction(()=>document.querySelector('#annotationStatus').textContent.includes('已复制标记截图'));
  const clipboard=await page.evaluate(async()=>{
    const [item]=await navigator.clipboard.read(),blob=await item.getType('image/png'),bitmap=await createImageBitmap(blob);
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
    const grid=document.querySelector('#viewportGrid').getBoundingClientRect();
    const reference=document.createElement('canvas');reference.width=Math.round(grid.width);reference.height=Math.round(grid.height);
    const referenceContext=reference.getContext('2d');
    const samples=[...document.querySelectorAll('.lfViewPane:not([hidden]) canvas')].map(source=>{
      const rect=source.getBoundingClientRect(),x=Math.floor(rect.width/2),y=Math.floor(rect.height/2);
      referenceContext.drawImage(source,rect.x-grid.x,rect.y-grid.y,rect.width,rect.height);
      return {original:[...referenceContext.getImageData(Math.round(rect.x-grid.x+x),Math.round(rect.y-grid.y+y),1,1).data],
        copied:[...context.getImageData(Math.round(rect.x-grid.x+x),Math.round(rect.y-grid.y+y),1,1).data]};
    });
    return {types:item.types,width:bitmap.width,height:bitmap.height,samples,expectedWidth:Math.round(grid.width),expectedHeight:Math.round(grid.height)};
  });
  for(const sample of clipboard.samples) assert.deepEqual(sample.copied,sample.original,'clipboard image includes pixels from both viewport canvases');
  assert.ok(clipboard.types.includes('image/png'));assert.equal(clipboard.width,clipboard.expectedWidth);assert.equal(clipboard.height,clipboard.expectedHeight);
  assert.equal(downloads,0,'copy viewport screenshot writes clipboard without downloading');
  await page.click('#closeAnnotations');
  await page.click('#attachCodexScreenshot');
  assert.ok(await page.locator('#annotationDialog').isVisible());
  const frozen=await page.evaluate(()=>LevelFlow.Inspect().time);
  async function Draw(kind,a,b,text) {
    await page.click(`[data-mark-tool="${kind}"]`);
    const rect=await page.locator('#annotationCanvas').boundingBox();
    await page.mouse.move(rect.x+rect.width*a[0],rect.y+rect.height*a[1]);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width*b[0],rect.y+rect.height*b[1],{steps:8});await page.mouse.up();
    if(text) {await page.locator('#screenshotText').fill(text);await page.locator('#screenshotText').press('Control+Enter');}
  }
  await Draw('arrow',[0.1,0.2],[0.3,0.4]);
  await Draw('rect',[0.6,0.2],[0.85,0.6]);
  await Draw('text',[0.3,0.75],[0.3,0.75],'这里加两名追兵');
  assert.equal(await page.locator('#annotationStatus').isVisible(), false);
  assert.equal(await page.locator('#screenshotTextStyle').isVisible(), true);
  await page.click('#undoAnnotation');assert.equal(await page.locator('#undoAnnotation').isEnabled(), true);
  await page.click('#undoAnnotation');assert.equal(await page.locator('#redoAnnotation').isEnabled(), true);
  await page.click('#redoAnnotation');await page.click('#redoAnnotation');
  await page.click('#copyScreenshot');await page.waitForFunction(()=>document.querySelector('#annotationStatus').textContent.includes('已复制标记截图'));
  assert.equal(downloads,0,'annotated image copies without downloading');
  await page.screenshot({path:path.join(out,'AnnotationDialog.png')});
  const downloadPromise=page.waitForEvent('download');await page.click('#exportFrame');const download=await downloadPromise;
  const imagePath=path.join(out,'FrameWithMetadata.png');await download.saveAs(imagePath);
  const metadata=ReadPngFrameMetadata(Uint8Array.from(fs.readFileSync(imagePath)).buffer);
  assert.equal(metadata.context.time,424);assert.equal(metadata.screenshot.marks.length,3);
  assert.equal(metadata.screenshot.marks[2].text,'这里加两名追兵');
  assert.equal(metadata.context.mapSource.sha256.length,64);assert.equal(metadata.context.viewports.count,2);
  assert.equal(metadata.document.groups.find(group=>group.id==='Fork').count,8);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().time),frozen,'annotation dialog freezes the captured timeline');
  await page.click('#closeAnnotations');
  await page.selectOption('#viewportLayout','4');
  await page.evaluate(()=>{LevelFlow.SetViewType(1,'chase');LevelFlow.SetViewType(2,'oblique');LevelFlow.SetViewType(3,'eye');});
  await page.screenshot({path:path.join(out,'FourViewports.png')});
  await page.click('[data-tab="chat"]');
  await page.click('#attachCodexScreenshot');
  const multiDownloadPromise=page.waitForEvent('download');await page.click('#exportFrame');const multiDownload=await multiDownloadPromise;
  const multiPath=path.join(out,'FourViewportFrame.png');await multiDownload.saveAs(multiPath);
  const multiMetadata=ReadPngFrameMetadata(Uint8Array.from(fs.readFileSync(multiPath)).buffer);
  assert.equal(multiMetadata.context.viewports.count,4);
  assert.deepEqual(multiMetadata.context.viewports.views.map(view=>view.type),['plan','chase','oblique','eye']);
  await page.click('#closeAnnotations');
  await page.evaluate(()=>{LevelFlow.SetLayout(2);LevelFlow.SetViewType(1,'oblique');LevelFlow.ActivateView(0);});
  await page.locator('#flowMap').focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.LevelFlow.Inspect().time>424.2);await page.keyboard.press('Space');
  assert.equal((await page.evaluate(()=>window.LevelFlow.Inspect())).playing,false);
  await page.click('[data-stage="01"]');assert.ok(await page.locator('.lfBeats .cinematic').count()>0);
  await page.click('[data-stage="09"]');await page.click('[data-tab="script"]');await page.screenshot({path:path.join(out,'Village.png')});
  await page.evaluate(time=>{LevelFlow.SetViewType(0,'plan');LevelFlow.SetViewType(1,'scene');LevelFlow.Seek(time);},FLOW_TIMELINE.find(beat=>beat.id==='09c').start+2.577);
  const hiddenVillage=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(hiddenVillage.beat,'09c');
  assert.equal(hiddenVillage.effects.filter(effect=>effect.kind==='fire').length,0,'attached 09C frame no longer shows premature crossfire');
  await page.screenshot({path:path.join(out,'VillageBeforeSignal.png')});
  const villageSignal=FLOW_TIMELINE.find(beat=>beat.id==='09j').start;
  await page.evaluate(time=>LevelFlow.Seek(time),villageSignal);
  const leaderSignal=await page.evaluate(()=>LevelFlow.Inspect());
  assert.ok(leaderSignal.effects.some(effect=>effect.sourceId==='luo'));
  assert.ok(!leaderSignal.actors.find(actor=>actor.id==='yao').firing);
  await page.evaluate(time=>LevelFlow.Seek(time+2),villageSignal);
  const villageResponse=await page.evaluate(()=>LevelFlow.Inspect());
  assert.ok(villageResponse.effects.some(effect=>effect.sourceId==='yao'));
  assert.ok((await page.evaluate(time=>LevelFlow.Evaluate(time),FLOW_TIMELINE.find(beat=>beat.id==='09e').start+2)).actors.some(actor=>actor.groupId==='YardTransfer'&&actor.pose==='run'));
  await page.screenshot({path:path.join(out,'VillageAfterSignal.png')});
  await page.click('[data-stage="05"]');await page.evaluate(()=>window.LevelFlow.JumpBeat('05c'));await page.screenshot({path:path.join(out,'TankApproach.png')});
  await page.setViewportSize({width:1024,height:720});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1280,height:720});
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=692.25&x=86.50&z=258.85&zoom=12`);
  await ReadyPlan();
  const groundFrame=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(groundFrame.time,692.25);
  assert.ok(groundFrame.actors.filter(actor=>actor.kind==='tank').every(actor=>actor.p[0]>100));
  await page.screenshot({path:path.join(out,'GroundTank652.png')});
  const roundTrips=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const view=new FlowPerspectiveView(document.getElementById('flowMap2'),await LoadEncounterMap(),'oblique');
    view.center=[100,246];view.scale=10;view.BeforeDraw(LevelFlow.Evaluate(692.25));
    return [[101,240],[88,238],[96,247]].map(point=>({point,restored:view.ToWorld(view.ToScreen(point))}));
  });
  assert.ok(roundTrips.every(({point,restored})=>Math.hypot(point[0]-restored[0],point[1]-restored[1])<0.1),'elevated ground, trench floor and ramp keep consistent edit coordinates');

  await page.evaluate(()=>{LevelFlow.SetLayout(1);LevelFlow.SetViewType(0,'oblique');});
  await page.locator('.lfViewTarget').first().selectOption('tank1');
  await page.screenshot({path:path.join(out,'GroundTankOblique652.png')});
  await page.evaluate(()=>localStorage.removeItem('tengxian1938_encounter_v2'));
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=424&x=73&z=115&zoom=5.5`);
  await ReadyPlan();
  const early=await page.evaluate(()=>LevelFlow.Inspect());
  assert.ok(!early.actors.some(actor=>actor.kind==='tank'),'infantry pressure precedes the tank pursuit');
  await page.screenshot({path:path.join(out,'EarlyGroundEncounter.png')});
  await page.evaluate(()=>LevelFlow.Seek(341));
  const alignment=await page.evaluate(()=>{
    const axis=document.querySelector('#timelineAxis').getBoundingClientRect(),range=document.querySelector('#flowSeek').getBoundingClientRect();
    const seconds=LevelFlow.Inspect().time,duration=LevelFlow.Inspect().duration;
    return {playhead:document.querySelector('.lfPlayhead').getBoundingClientRect().x,
      slider:range.x+7+(range.width-14)*seconds/duration,expected:axis.x+axis.width*seconds/duration,
      stages:[...document.querySelectorAll('[data-stage]')].map(element=>({id:element.dataset.stage,x:element.getBoundingClientRect().x})),
      beats:[...document.querySelectorAll('[data-beat]')].map(element=>({id:element.dataset.beat,x:element.getBoundingClientRect().x,width:element.getBoundingClientRect().width})),axis:{x:axis.x,width:axis.width}};
  });
  assert.ok(Math.abs(alignment.playhead-alignment.expected)<0.1&&Math.abs(alignment.slider-alignment.expected)<0.1,"05:01 slider and playhead use the same global time position");
  for(const beat of FLOW_TIMELINE) assert.ok(Math.abs(alignment.beats.find(item=>item.id===beat.id).x-(alignment.axis.x+alignment.axis.width*beat.start/FLOW_TIMELINE.at(-1).end))<0.1,"every beat uses the global time axis");
  for(const beat of FLOW_TIMELINE) assert.ok(Math.abs(alignment.beats.find(item=>item.id===beat.id).width-alignment.axis.width*beat.duration/FLOW_TIMELINE.at(-1).end)<0.1,"short beats retain their actual duration width");
  for(const stage of alignment.stages) assert.ok(Math.abs(stage.x-(alignment.axis.x+alignment.axis.width*FLOW_TIMELINE.find(beat=>beat.stage===stage.id).start/FLOW_TIMELINE.at(-1).end))<0.1,"every stage uses the global time axis");
  await page.screenshot({path:path.join(out,'Timeline301.png')});

  const timelineViewport=await page.locator('#timelineScroll').boundingBox();
  await page.mouse.move(timelineViewport.x+timelineViewport.width/2,timelineViewport.y+35);
  const timelineBefore=await page.evaluate(()=>LevelFlow.Timeline());
  const anchoredTime=(timelineBefore.scrollLeft+timelineBefore.viewportWidth/2)/timelineBefore.width;
  await page.mouse.wheel(0,-400);
  await page.waitForFunction(width=>LevelFlow.Timeline().width>width,timelineBefore.width);
  const timelineZoomed=await page.evaluate(()=>LevelFlow.Timeline());
  assert.ok(Math.abs((timelineZoomed.scrollLeft+timelineZoomed.viewportWidth/2)/timelineZoomed.width-anchoredTime)<0.002,'wheel zoom keeps the time under the pointer fixed');
  const cursorBeforePan=await page.evaluate(()=>LevelFlow.Inspect().time);
  await page.keyboard.down('Shift');await page.mouse.wheel(0,200);await page.keyboard.up('Shift');
  await page.waitForFunction(left=>LevelFlow.Timeline().scrollLeft>left,timelineZoomed.scrollLeft);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().time),cursorBeforePan,'horizontal navigation never changes the story cursor');
  await page.evaluate(()=>LevelFlow.JumpBeat('18f'));
  assert.ok(await page.evaluate(()=>{
    const head=document.querySelector('.lfPlayhead').getBoundingClientRect(),clip=document.querySelector('#timelineScroll').getBoundingClientRect();
    return head.x>=clip.x&&head.x<=clip.right;
  }),'jumping to a later beat reveals its playhead');
  await page.click('#timelineFit');
  assert.ok(await page.evaluate(()=>document.querySelector('#timelineScroll').scrollWidth<=document.querySelector('#timelineScroll').clientWidth+1),'fit shows the whole story without overflow');
  await page.screenshot({path:path.join(out,'TimelineFullStory.png')});

  await page.evaluate(()=>{LevelFlow.SetPlaying(false);LevelFlow.SetLayout(2);LevelFlow.SetViewType(1,'oblique');LevelFlow.Seek(424);});
  await page.evaluate(async()=>{
    const {FlowMapView}=await import('./Script_LevelFlowView.mjs');
    const original=FlowMapView.prototype.Draw;
    window.inactiveViewDraws=0;
    FlowMapView.prototype.Draw=function(...args) {if(this.canvas.id==='flowMap') inactiveViewDraws++;return original.apply(this,args);};
  });
  const firstView=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[0]);
  const sceneBox=await page.locator('#flowMap2').boundingBox(),mouseX=sceneBox.x+sceneBox.width/2,mouseY=sceneBox.y+sceneBox.height/2;
  await page.mouse.move(mouseX,mouseY);await page.mouse.down({button:'right'});await page.mouse.move(mouseX+35,mouseY+12,{steps:4});
  const beforeFly=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);
  assert.equal(beforeFly.type,'scene');assert.ok(beforeFly.freeCamera);assert.equal(beforeFly.far,1500);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().rendering[1].renderScale),1,'RMB look preserves full terrain resolution');
  await page.keyboard.down('w');
  await page.waitForFunction((eye)=>Math.hypot(...LevelFlow.Inspect().viewports.views[1].freeCamera.eye.map((value,index)=>value-eye[index]))>0.5,beforeFly.freeCamera.eye);
  await page.keyboard.up('w');await page.keyboard.down('e');
  const beforeUp=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1].freeCamera.eye[1]);
  await page.waitForFunction((height)=>LevelFlow.Inspect().viewports.views[1].freeCamera.eye[1]>height+0.3,beforeUp);
  await page.keyboard.up('e');
  const ReadFly=()=>page.evaluate(()=>({speed:LevelFlow.Packet().context.viewports.views[1].speed,eye:LevelFlow.Inspect().viewports.views[1].freeCamera.eye}));
  const flyBase=await ReadFly();
  await page.mouse.wheel(0,-100);
  await page.waitForFunction(speed=>LevelFlow.Packet().context.viewports.views[1].speed>speed*1.15,flyBase.speed);
  assert.deepEqual((await ReadFly()).eye,flyBase.eye,'wheel while flying changes speed instead of dollying');
  assert.equal(await page.locator('.lfViewPane[data-viewport="1"] .lfSpeedToast:visible').count(),1,'speed change is shown on the viewport');
  await page.mouse.wheel(0,100);
  await page.waitForFunction(speed=>Math.abs(LevelFlow.Packet().context.viewports.views[1].speed-speed)<1e-6,flyBase.speed);
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const heldNavigation=await page.evaluate(()=>({rendering:LevelFlow.Inspect().rendering[1],pixels:document.getElementById('flowMap2').toDataURL()}));
  assert.equal(heldNavigation.rendering.renderScale,1,'flying preserves full terrain resolution');
  await page.screenshot({path:path.join(out,'SceneNavigationHeld.png')});
  await page.mouse.up({button:'right'});
  const stopped=await page.evaluate(()=>LevelFlow.Inspect());await page.waitForTimeout(200);
  await page.waitForFunction(()=>LevelFlow.Inspect().rendering[1].renderScale===1);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().rendering[1].terrainTriangles),heldNavigation.rendering.terrainTriangles,'releasing RMB preserves terrain detail');
  assert.equal(await page.locator('#flowMap2').evaluate(canvas=>canvas.toDataURL()),heldNavigation.pixels,'the same camera has identical pixels while held and after release');
  assert.equal(await page.evaluate(()=>inactiveViewDraws),0,'navigating the paused right Scene leaves the unchanged left canvas cached');
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect())).viewports.views[1],stopped.viewports.views[1],"releasing RMB stops movement while playback is paused");
  assert.equal(stopped.time,424);assert.equal(stopped.playing,false);
  assert.deepEqual(stopped.viewports.views[0],firstView,"Scene navigation leaves the other viewport unchanged");
  await page.mouse.down({button:'middle'});await page.mouse.move(mouseX+65,mouseY+30,{steps:4});
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().rendering[1].renderScale),1,'MMB pan preserves full terrain resolution');
  await page.mouse.up({button:'middle'});
  const panned=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);assert.notDeepEqual(panned.freeCamera.eye,stopped.viewports.views[1].freeCamera.eye,"MMB pans the scene");
  await page.keyboard.down('Alt');await page.mouse.down();await page.mouse.move(mouseX+95,mouseY+15,{steps:4});
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().rendering[1].renderScale),1,'orbit preserves full terrain resolution');
  await page.mouse.up();await page.keyboard.up('Alt');
  const orbited=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);assert.notEqual(orbited.freeCamera.yaw,panned.freeCamera.yaw,"Alt LMB orbits the pivot");
  await page.keyboard.down('Alt');await page.mouse.down({button:'right'});await page.mouse.move(mouseX+95,mouseY+40,{steps:4});
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().rendering[1].renderScale),1,'dolly preserves full terrain resolution');
  await page.mouse.up({button:'right'});await page.keyboard.up('Alt');
  const dollied=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1]);assert.notDeepEqual(dollied.freeCamera.eye,orbited.freeCamera.eye,"Alt RMB dollies");
  await page.mouse.wheel(0,-100);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().rendering[1].renderScale),1,'wheel zoom preserves full terrain resolution');
  await page.locator('#flowMap2').focus();await page.keyboard.press('f');
  const focused=await page.evaluate(()=>LevelFlow.Inspect());assert.deepEqual(focused.viewports.views[1].center,focused.actors[0].p,"F focuses the player when no object is selected");
  const cameraLocation=JSON.parse(await ReadLocationAttachment());
  assert.deepEqual(cameraLocation.viewports[1].camera.eye,focused.viewports.views[1].freeCamera.eye.map(value=>Math.round(value*1000)/1000));
  assert.equal(cameraLocation.viewports[1].camera.farMetres,1500);
  await page.screenshot({path:path.join(out,'SceneNavigation.png')});

  const handButton=page.getByRole('button',{name:'手形工具',exact:true});
  const selectButton=page.getByRole('button',{name:'选择工具',exact:true});
  await handButton.click();
  assert.equal(await handButton.getAttribute('aria-pressed'),'true');
  assert.equal(await selectButton.getAttribute('aria-pressed'),'false');
  const beforeHand=await page.evaluate(()=>LevelFlow.Packet());
  await page.mouse.move(mouseX,mouseY);await page.mouse.down();
  assert.equal(await page.locator('#flowMap2').evaluate(canvas=>getComputedStyle(canvas).cursor),'grabbing');
  await page.mouse.move(mouseX+48,mouseY+24,{steps:4});await page.mouse.up();
  const afterHand=await page.evaluate(()=>LevelFlow.Packet());
  assert.notDeepEqual(afterHand.context.viewports.views[1].freeCamera.eye,beforeHand.context.viewports.views[1].freeCamera.eye,'hand tool pans a 3D scene with LMB');
  assert.equal(afterHand.context.viewports.views[1].freeCamera.yaw,beforeHand.context.viewports.views[1].freeCamera.yaw,'hand pan preserves yaw');
  assert.equal(afterHand.context.viewports.views[1].freeCamera.pitch,beforeHand.context.viewports.views[1].freeCamera.pitch,'hand pan preserves pitch');
  assert.equal(afterHand.context.viewports.views[1].freeCamera.eye[1],beforeHand.context.viewports.views[1].freeCamera.eye[1],'LMB hand pan stays on the XZ plane');
  assert.deepEqual(afterHand.context.viewports.views[0],beforeHand.context.viewports.views[0],'hand tool only moves the pressed viewport');
  assert.deepEqual(afterHand.context.selection,beforeHand.context.selection,'hand dragging preserves selection');
  assert.equal(await page.locator('#flowMap2').evaluate(canvas=>getComputedStyle(canvas).cursor),'grab');
  assert.equal(await page.locator('#flowMap2').getAttribute('data-navigation-action'),null,'release clears navigation capture');
  await page.screenshot({path:path.join(out,'SceneHandTool.png')});
  // A simple hand click over a unit must keep the current selection.
  await page.evaluate(()=>LevelFlow.Select({type:'actor',id:'winter'}));
  await handButton.click();
  const handSelection=await page.evaluate(()=>LevelFlow.Packet().context.selection);
  const playerPoint=await page.evaluate(()=>LevelFlow.ToScreen(LevelFlow.Inspect().actors[0].p,1));
  await page.mouse.click(sceneBox.x+playerPoint[0],sceneBox.y+playerPoint[1]);
  assert.deepEqual(await page.evaluate(()=>LevelFlow.Packet().context.selection),handSelection,'hand click over a unit preserves selection');
  await page.locator('#flowMap2').focus();await page.keyboard.press('w');
  assert.equal(await selectButton.getAttribute('aria-pressed'),'true','W returns to selection');
  await page.keyboard.press('q');
  assert.equal(await handButton.getAttribute('aria-pressed'),'true','Q selects the hand tool');
  await page.locator('#codexPrompt').fill('');await page.locator('#codexPrompt').press('w');
  assert.equal(await handButton.getAttribute('aria-pressed'),'true','typing W in the composer keeps the hand tool');
  await page.locator('#codexPrompt').fill('');
  await page.getByRole('button',{name:'＋ 单位',exact:true}).click();
  assert.equal(await selectButton.getAttribute('aria-pressed'),'true','unit attachment returns to selection');
  await page.evaluate(()=>LevelFlow.Select(null));
  await handButton.click();
  await page.mouse.move(mouseX,mouseY);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await selectButton.getAttribute('aria-pressed'),'true','Escape cancels a hand drag and selects');
  assert.equal(await page.locator('#flowMap2').getAttribute('data-navigation-action'),null);
  await handButton.click();
  await page.mouse.move(mouseX,mouseY);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
  assert.equal(await page.locator('#flowMap2').getAttribute('data-navigation-action'),null,'blur clears a hand drag');
  const planBox=await page.locator('#flowMap').boundingBox();
  await page.evaluate(()=>LevelFlow.SetViewType(0,'plan'));
  const planBefore=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[0]);
  await page.mouse.move(planBox.x+planBox.width/2,planBox.y+planBox.height/2);await page.mouse.down();
  await page.mouse.move(planBox.x+planBox.width/2+30,planBox.y+planBox.height/2+20);await page.mouse.up();
  assert.notDeepEqual((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[0])).center,planBefore.center,'hand tool pans 2D');
  // Restore the existing navigation fixture for later checks.
  await selectButton.click();
  await page.evaluate(layout=>{LevelFlow.RestoreViewports(layout);LevelFlow.ActivateView(1);},focused.viewports);

  const routeClipping=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:640px;height:360px';document.body.append(canvas);
    const context=canvas.getContext('2d'),map=await LoadEncounterMap(),frame=LevelFlow.Evaluate(227);
    const layers={routes:true,spawns:true,triggers:true,fire:true,names:true};
    let points=[],ghostStrokes=0;
    const beginPath=context.beginPath.bind(context),stroke=context.stroke.bind(context);
    context.beginPath=()=>{points=[];beginPath();};
    for(const method of ['moveTo','lineTo']) {
      const original=context[method].bind(context);
      context[method]=(x,y)=>{points.push([x,y]);original(x,y);};
    }
    context.stroke=()=>{
      if(points.some(point=>point.includes(-100000))&&points.some(point=>point.every(value=>Math.abs(value)<90000))) ghostStrokes++;
      stroke();
    };
    const legacy=new FlowPerspectiveView(canvas,map,'scene');
    legacy.freeCamera={eye:[85,30,135],yaw:-2.6,pitch:-0.2};
    legacy.ProjectPath=points=>[points.map(point=>legacy.ToScreen(point))];
    legacy.Draw(frame,layers,null);
    const legacyGhostStrokes=ghostStrokes;
    const results=[];
    for(const type of ['scene','eye','chase','oblique']) for(const pitch of [-0.2,-0.4,-0.7]) {
      const view=new FlowPerspectiveView(canvas,map,type);
      view.freeCamera={eye:[85,30,135],yaw:-2.6,pitch};
      ghostStrokes=0;
      view.Draw(frame,layers,null);
      results.push({type,pitch,ghostStrokes});
    }
    canvas.remove();return {legacyGhostStrokes,views:results};
  });
  assert.ok(routeClipping.legacyGhostStrokes>0,'elevated 03B camera reproduces the original erroneous connections');
  assert.ok(routeClipping.views.every(result=>result.ghostStrokes===0),
    `world routes and arrows never connect hidden-point sentinels to visible geometry: ${JSON.stringify(routeClipping)}`);

  const depth=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:640px;height:360px';document.body.append(canvas);canvas.width=640;canvas.height=360;
    const data={objects:[{id:'Wall',pos:[0,0,5],size:[4,3,1],material:'Whitebox/Plaster'}],farObjects:[],terrain:{heightAt:()=>0,roots:[],source:'Flat regression scene'}};
    const view=new FlowPerspectiveView(canvas,data,'scene');view.freeCamera={eye:[0,1.6,0],yaw:0,pitch:0};
    const actors=[{id:'visible',kind:'person',side:'friend',pose:'stand',p:[0,3]},
      {id:'hidden',kind:'person',side:'friend',pose:'stand',p:[0,10]},
      {id:'partial',kind:'person',side:'friend',pose:'stand',p:[4.4,10]}];
    const frame={...LevelFlow.Evaluate(424),actors};view.BeforeDraw(frame);view.DrawBase(canvas.getContext('2d'),640,360,frame);
    const context=canvas.getContext('2d'),pixel=view.Vertex([0,1,10]);
    const background=[...context.getImageData(Math.floor(pixel.x),Math.floor(pixel.y),1,1).data];
    view.DrawActor(context,actors[1],frame);
    const throughWall=[...context.getImageData(Math.floor(pixel.x),Math.floor(pixel.y),1,1).data];
    for(const actor of [actors[0],actors[2]]) view.DrawActor(context,actor,frame);
    const result={...view.Diagnostics(),background,throughWall};
    view.type='eye';view.freeCamera=null;view.occlusion.clear();
    view.DrawBase(context,640,360,frame);
    const eyeBackground=[...context.getImageData(0,0,640,360).data];
    view.DrawActor(context,actors[1],frame);
    const eyeForeground=context.getImageData(0,0,640,360).data;
    result.eyePixelsUnchanged=eyeBackground.every((value,index)=>value===eyeForeground[index]);
    result.eyeLabelOpacity=view.ActorLabelOpacity(actors[1]);
    view.type='scene';
    data.objects=[{id:'FarBuilding',pos:[0,-23.4,1100],size:[50,50,20],material:'Whitebox/Plaster'}];
    view.DrawBase(context,640,360,frame);result.farDepth=view.raster.depth[176*640+320];
    data.objects[0].pos[2]=1600;view.DrawBase(context,640,360,frame);result.beyondFarVisible=Number.isFinite(view.raster.depth[176*640+320]);
    const overview=new FlowPerspectiveView(canvas,data,'oblique');overview.center=[0,0];overview.scale=0.5;
    data.objects=[-400,400].map(z=>({id:`Overview${z}`,pos:[0,0,z],size:[80,10,80],material:'Whitebox/Plaster'}));
    overview.BeforeDraw(frame);overview.DrawBase(context,640,360,frame);
    result.overviewDepths=[-400,400].map(z=>{const point=overview.Vertex([0,5,z]);return overview.raster.depth[Math.round(point.y)*640+Math.round(point.x)];});
    data.objects=[{id:'BoxInterior',pos:[0,0,0],size:[4,3,2],material:'Whitebox/Plaster'}];
    result.boxDepths=[];
    for(const [eye,yaw,pitch,point] of [
      [[0,1,0],0,0,[0,1,1]],
      [[0,-2,0],0,1.54,[0,3,0]],
      [[0,6,0],0,-1.54,[0,3,0]],
      [[8,1.5,0],-Math.PI/2,0,[2,1.5,0]],
    ]) {
      view.freeCamera={eye,yaw,pitch};view.BeforeDraw(frame);view.DrawBase(context,640,360,frame);
      const projected=view.Vertex(point);
      result.boxDepths.push(view.raster.depth[Math.round(projected.y)*640+Math.round(projected.x)]);
    }
    canvas.remove();return result;
  });
  const visible=depth.actors.find(actor=>actor.id==='visible'),hidden=depth.actors.find(actor=>actor.id==='hidden'),partial=depth.actors.find(actor=>actor.id==='partial');
  assert.ok(visible.visible>0&&visible.hidden===0&&visible.labelOpacity===1,"foreground actors remain opaque");
  assert.ok(hidden.hidden>0&&hidden.visible===0&&hidden.labelOpacity===0.22,"a wall occludes the character and dims its label");
  assert.ok(partial.hidden>0&&partial.visible>0,"occlusion is evaluated on individual body fragments");
  assert.ok(depth.eyePixelsUnchanged&&depth.eyeLabelOpacity===0,"player eye hides all occluded body fragments, heads and labels");
  for(let channel=0;channel<3;channel++) assert.ok(Math.abs(depth.throughWall[channel]-(depth.background[channel]*0.8+[39,109,130][channel]*0.2))<3,"hidden body strokes blend at 20 percent opacity");
  assert.ok(depth.farDepth>1000&&depth.farDepth<1500&&!depth.beyondFarVisible,"the 1500 m far plane renders distant geometry and clips beyond its range");
  assert.ok(depth.overviewDepths.every(value=>Number.isFinite(value)&&value>0&&value<1500),"zoomed-out oblique view retains geometry 400 m on both sides of the center");
  assert.ok(depth.boxDepths.every((value,index)=>Math.abs(value-[1,5,3,6][index])<0.1),'box face culling preserves interior walls, open-bottom undersides, tops and exterior walls');
  const distantLod=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {FLOW_RENDERING}=await import('../Data_Tuning_LevelFlow.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';
    canvas.width=320;canvas.height=240;document.body.append(canvas);
    const root={x:-8,z:20,size:16,center:[0,-1,28],radius:12,minHeight:-2,maxHeight:0,heightError:3};
    root.children=[[-8,20],[0,20],[0,28],[-8,28]].map(([x,z])=>({x,z,size:8,center:[x+4,-1,z+4],radius:6,
      minHeight:-2,maxHeight:0,heightError:0}));
    const selected=[];
    const view=new FlowPerspectiveView(canvas,{objects:[],farObjects:[],terrain:{heightAt:()=>-2,roots:[root],
      facesForCell:cell=>{selected.push(cell.size);return [{points:[[cell.x,-2,cell.z],[cell.x+cell.size,-2,cell.z],
        [cell.x,-2,cell.z+cell.size]],color:'#b8a480',vertexColors:[[184,164,128],[184,164,128],[184,164,128]]}];}}},'scene');
    view.freeCamera={eye:[0,20,-110],yaw:0,pitch:-0.1};view.lighting=null;
    const frame=LevelFlow.Evaluate(0);view.BeforeDraw(frame);view.DrawBase(canvas.getContext('2d'),320,240,frame);
    const projectedSize=root.size*view.focal/(view.CameraPoint(root.center)[2]-root.radius);
    canvas.remove();return {selected,projectedSize,paintThreshold:FLOW_RENDERING.terrainCellPixels};
  });
  assert.ok(distantLod.projectedSize<distantLod.paintThreshold&&distantLod.selected.length===4
    &&distantLod.selected.every(size=>size===8),`distant relief refines below the paint-size threshold: ${JSON.stringify(distantLod)}`);
  const terrainWork=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:fixed;left:-2000px;width:640px;height:640px';document.body.append(canvas);
    const data=await LoadEncounterMap(),view=new FlowPerspectiveView(canvas,data,'scene');
    view.center=[66.5,64.5];view.freeCamera={eye:[66.5,view.Ground(view.center)+12,46.5],yaw:0,pitch:-0.55};
    view.Draw(LevelFlow.Evaluate(0),{},null);
    const triangles=view.Diagnostics().terrainTriangles;
    view.freeCamera.pitch=1.54;view.Draw(LevelFlow.Evaluate(0),{},null);
    const skyTriangles=view.Diagnostics().triangles;
    canvas.remove();return {triangles,skyTriangles};
  });
  assert.ok(terrainWork.triangles>0&&terrainWork.triangles<40000,`Scene navigation bounds terrain work by projected detail ${JSON.stringify(terrainWork)}`);
  assert.ok(terrainWork.skyTriangles<1000,"looking at empty sky culls the terrain before projecting its faces");
  await page.evaluate(()=>{LevelFlow.SetViewType(0,'chase');LevelFlow.SetViewType(1,'eye');LevelFlow.Seek(190);LevelFlow.SetPlaying(true);});
  await page.waitForFunction(()=>LevelFlow.Inspect().time>190.2);
  assert.ok((await page.evaluate(()=>LevelFlow.Inspect().rendering)).every(view=>view.renderScale===1),'playback preserves full terrain resolution');
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  await page.waitForFunction(()=>LevelFlow.Inspect().rendering.every(view=>view.renderScale===1));
  await page.evaluate(()=>{LevelFlow.SetViewType(1,'oblique');LevelFlow.Seek(424);});
  await page.screenshot({path:path.join(out,'RealTerrainGully.png')});
  await page.evaluate(()=>LevelFlow.JumpBeat('06g'));await page.screenshot({path:path.join(out,'CartLane.png')});
  await page.evaluate(()=>localStorage.removeItem('tengxian1938_encounter_v2'));
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=267.14&x=45&z=65&zoom=9`);
  await ReadyPlan();
  assert.equal(await page.locator('#planningSection').count(),0);
  await page.evaluate(()=>LevelFlow.Seek(226.63));
  const deployed=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='Fork'));
  assert.equal(deployed.length,5);
  assert.equal(new Set(deployed.map(actor=>actor.born)).size,1);
  assert.equal(new Set(deployed.map(actor=>actor.p.join(','))).size,5);
  assert.ok(deployed.every(actor=>actor.pose==='kneel'&&!actor.firing));
  const forkDocument=(await page.evaluate(()=>LevelFlow.Inspect().document)).groups.find(group=>group.id==='Fork');
  assert.equal(forkDocument.spawnOffsets.map(point=>point.join(', ')).join('\n'),"2.3, -9.9\n10.3, -3.5\n1.2, -5\n5.5, 3.8\n2.4, 1.8");
  await page.click('[data-tab="script"]');
  await page.evaluate(()=>{LevelFlow.SetLayout(1);LevelFlow.SetViewType(0,'oblique');});
  await page.screenshot({path:path.join(out,'HiddenSpawnBatch186.png')});
  await page.evaluate(()=>LevelFlow.SetViewType(0,'eye'));
  const spawnEyePacket=await page.evaluate(()=>{
    const packet=LevelFlow.Packet(),camera=LevelFlow.Inspect().rendering[0];
    const heading=Math.atan2(camera.aim[0]-camera.eye[0],camera.aim[2]-camera.eye[2]);
    packet.context.viewports.views[0].yaw+=Math.atan2(75-camera.eye[0],44-camera.eye[2])-heading;
    return packet;
  });
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),spawnEyePacket.context.viewports);
  const hiddenSpawns=await page.evaluate(()=>LevelFlow.Inspect().rendering[0].actors.filter(actor=>actor.id.startsWith('Fork_')));
  assert.equal(hiddenSpawns.length,5);
  assert.ok(hiddenSpawns.every(actor=>actor.visible===0&&actor.hidden>0&&actor.labelOpacity===0),"all five dispersed spawns are fully hidden from the real player camera");
  await page.screenshot({path:path.join(out,'HiddenSpawnEye186.png')});
  await page.evaluate(()=>LevelFlow.SetViewType(0,'oblique'));
  await page.evaluate(()=>LevelFlow.Seek(267.14));
  await page.screenshot({path:path.join(out,'DragDoorPressure.png')});
  await page.evaluate(()=>LevelFlow.Seek(292));
  const rampEnemy=await page.evaluate(()=>LevelFlow.Inspect().actors.find(actor=>actor.groupId==='Corner'&&actor.pose!=='dead'));
  assert.ok(rampEnemy,'second pressure reaches the door ramp after the first wave');
  await page.screenshot({path:path.join(out,'DragRampPressure.png')});
  await page.evaluate(()=>LevelFlow.Seek(404.5));
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='TrafficFlank').length),0);
  await page.evaluate(()=>LevelFlow.Seek(409));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.some(actor=>actor.groupId==='TrafficFlank')));
  await page.screenshot({path:path.join(out,'TrafficSecondRampPressure.png')});
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=26.14&x=45&z=58&zoom=6`);
  await page.waitForFunction(()=>window.LevelFlow, {}, {timeout:180000});
  const opening=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(opening.actors.filter(actor=>actor.id==='yao'||actor.id.startsWith('openingGun')).length,4);
  assert.equal(opening.actors.filter(actor=>['luo','he','liu'].includes(actor.id)||actor.id.startsWith('openingAlly')).length,12);
  await page.screenshot({path:path.join(out,'OpeningDeparture.png')});
  await page.evaluate(()=>LevelFlow.Seek(32.423));
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.side==='enemy').length),0);
  await page.screenshot({path:path.join(out,'OpeningPackingNoEnemies.png')});
  const entryTime=await page.evaluate(async()=>{
    const {OPENING_ENEMY_ENTRY_TIME}=await import('./Script_LevelFlowModel.mjs');
    return OPENING_ENEMY_ENTRY_TIME;
  });
  await page.evaluate(time=>LevelFlow.Seek(time-0.001),entryTime);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>/^opening\d+$/.test(actor.id)).length),0);
  await page.evaluate(time=>LevelFlow.Seek(time),entryTime);
  const entry=await page.evaluate(()=>LevelFlow.Inspect().actors);
  const withdrawn=entry.filter(actor=>['luo','he','liu'].includes(actor.id)||actor.id.startsWith('openingAlly'));
  assert.equal(withdrawn.length,12);
  assert.ok(withdrawn.every(actor=>actor.p[1]>=67.2-0.001));
  assert.equal(entry.filter(actor=>/^opening\d+$/.test(actor.id)).length,1);
  await page.screenshot({path:path.join(out,'OpeningTailClearsBend.png')});
  await page.evaluate(()=>LevelFlow.Seek(32.423));
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.side==='enemy').length),0);
  await page.evaluate(()=>LevelFlow.Seek(60.05));
  const approaching=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>/^opening\d+$/.test(actor.id)));
  assert.equal(approaching.length,9);
  assert.ok(approaching.some(actor=>actor.pose==='run'));
  await page.screenshot({path:path.join(out,'OpeningEnemyApproach.png')});
  const openingLayout=await page.evaluate(()=>LevelFlow.Packet().context.viewports);
  await page.evaluate(()=>{
    const layout=LevelFlow.Packet().context.viewports;
    layout.count=1;layout.active=0;layout.views=layout.views.slice(0,1);
    Object.assign(layout.views[0],{type:'battle',mode:'manual',center:[53.3085,68.6844],scale:4.5437});
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(75.6683);
  });
  const silentCapture=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(silentCapture.actors.find(actor=>actor.id==='opening0').status,'静默架枪');
  assert.ok(!silentCapture.effects.some(effect=>['fire','grenade'].includes(effect.kind)),'the annotated capture frame remains silent');
  assert.match(await page.locator('#planningNote').textContent(),/尽量不开枪/);
  await page.screenshot({path:path.join(out,'OpeningSilentCapture.png')});
  await page.evaluate(()=>LevelFlow.Seek(79));
  const calledByGunfire=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(calledByGunfire.actors.find(actor=>actor.id==='opening0').firing,true);
  assert.equal(calledByGunfire.actors.find(actor=>actor.id==='luo').status,'循枪声接近，准备投弹');
  assert.ok(calledByGunfire.effects.some(effect=>effect.kind==='fire'&&effect.side==='enemy'));
  assert.ok(calledByGunfire.actors.find(actor=>actor.id==='luo').p[1]<silentCapture.actors.find(actor=>actor.id==='luo').p[1]);
  await page.screenshot({path:path.join(out,'OpeningGunfireCallsRelief.png')});
  await page.evaluate(()=>LevelFlow.Seek(104));
  const recognizedPrisoners=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(recognizedPrisoners.actors.find(actor=>actor.id==='winter').status,'受刺惨叫');
  assert.equal(recognizedPrisoners.actors.find(actor=>actor.id==='luo').status,'沟里有自己人，暂缓投弹');
  assert.ok(!recognizedPrisoners.effects.some(effect=>effect.kind==='grenade'));
  assert.match(await page.locator('#planningNote').textContent(),/并非被喊骂召回/);
  await page.screenshot({path:path.join(out,'OpeningCryHoldsGrenades.png')});
  await page.evaluate(()=>LevelFlow.Seek(75.6683));
  assert.deepEqual(await page.evaluate(()=>LevelFlow.Inspect().effects),silentCapture.effects,'backward seek clears later bursts and recognition');
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),openingLayout);
  await page.evaluate(()=>LevelFlow.Seek(110));
  const rescueApproach=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>['luo','he','liu'].includes(actor.id)||actor.id.startsWith('openingAlly')));
  assert.equal(new Set(rescueApproach.map(actor=>actor.rescueGroup)).size,4);
  assert.ok(rescueApproach.some(actor=>actor.pose==='walk')&&rescueApproach.some(actor=>actor.pose==='kneel'),'advancing soldiers and observers have independent timing');
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.id.startsWith('openingAlly')).every(actor=>{
    const before=LevelFlow.Evaluate(94).actors.find(previous=>previous.id===actor.id);
    return Math.hypot(actor.p[0]-before.p[0],actor.p[1]-before.p[1])>3;
  })),'each trio makes progress along its approach between observation halts');
  await page.screenshot({path:path.join(out,'OpeningReturn.png')});
  await page.evaluate(()=>LevelFlow.Seek(147));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.id.startsWith('openingAlly')).every(actor=>actor.pose==='kneel')));
  await page.screenshot({path:path.join(out,'OpeningSouthBerm.png')});
  await page.evaluate(()=>LevelFlow.Seek(147.654));
  const rescueReady=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>['luo','he','liu'].includes(actor.id)||actor.id.startsWith('openingAlly')));
  assert.equal(rescueReady.filter(actor=>actor.rescueLane==='branch'&&actor.p[0]<36&&actor.p[1]<68).length,6,'branch relief stops west of the Japanese positions');
  assert.equal(rescueReady.filter(actor=>actor.rescueLane==='south'&&actor.p[1]>72).length,6,'southern relief spreads behind the berm');
  await page.evaluate(()=>{
    LevelFlow.SetPlaying(false);
    LevelFlow.SetLayout(1);
    LevelFlow.SetViewType(0,'scene');
    const layout=LevelFlow.Packet().context.viewports;
    Object.assign(layout.views[0],{mode:'manual',center:[100,426],freeCamera:{eye:[100,13,399],yaw:0,pitch:-0.4},focusDistance:30});
    LevelFlow.RestoreViewports(layout);
    LevelFlow.Seek(1124);
  });
  const villageRunners=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='VillageCasualties'));
  assert.equal(villageRunners.length,2);
  assert.ok(villageRunners.every(actor=>actor.pose==='run'));
  await page.screenshot({path:path.join(out,'VillageEscape.png')});
  await page.evaluate(()=>LevelFlow.Seek(1126.05));
  const villageHit=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(villageHit.actors.find(actor=>actor.id==='villager2').pose,'hit');
  assert.ok(await page.evaluate(()=>LevelFlow.Evaluate(1126.05).effects.some(effect=>effect.targetId==='villager2'&&effect.phase<0.3)));
  await page.screenshot({path:path.join(out,'VillageMachineGunHit.png')});
  await page.evaluate(()=>{LevelFlow.Seek(1128.1);LevelFlow.SetPlaying(true);});
  await page.waitForFunction(()=>LevelFlow.Inspect().time>1129.4);
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='VillageCasualties').every(actor=>actor.pose==='dead')));
  await page.screenshot({path:path.join(out,'VillageBodies.png')});
  await page.evaluate(()=>LevelFlow.JumpBeat('08c'));
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='VillageCasualties'&&actor.pose==='dead').length),2);
  await page.screenshot({path:path.join(out,'VillageBodies08C.png')});
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=${FLOW_TIMELINE.find(beat=>beat.id==='05b').start+5.8964}&x=91&z=251&zoom=4`);
  await page.waitForFunction(()=>window.LevelFlow, {}, {timeout:180000});
  await page.evaluate(()=>{LevelFlow.SetLayout(1);LevelFlow.SetViewType(0,'oblique');});
  const departure=await page.evaluate(()=>LevelFlow.Inspect());
  assert.ok(!departure.actors.some(actor=>['LaneGround','BendGround'].includes(actor.groupId)));
  assert.equal(departure.actors.filter(actor=>actor.kind==='tank').length,2);
  assert.ok(departure.actors.filter(actor=>actor.kind==='tank').every(actor=>actor.p[1]<departure.actors.find(actor=>actor.id==='player').p[1]-40));
  assert.ok(departure.actors.find(actor=>actor.id==='geng').p[1]>240);
  await page.screenshot({path:path.join(out,'AmbushEvacuation05B.png')});
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=${FLOW_TIMELINE.find(beat=>beat.id==='06e').start+15.0142}&x=96&z=286&zoom=7`);
  await page.waitForFunction(()=>window.LevelFlow, {}, {timeout:180000});
  await page.evaluate(()=>{LevelFlow.SetLayout(1);LevelFlow.SetViewType(0,'oblique');});
  const ambush=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(ambush.actors.filter(actor=>actor.kind==='tank').length,2);
  assert.equal(ambush.actors.filter(actor=>['luo','he','liu','yao'].includes(actor.id)&&actor.firing).length,4);
  assert.ok(ambush.actors.filter(actor=>['nier','ammoCarrier1','ammoCarrier2'].includes(actor.id)).every(actor=>actor.p[1]>=345&&actor.pose==='kneel'));
  assert.ok(Math.hypot(...ambush.actors.find(actor=>actor.id==='geng').p.map((value,index)=>value-ambush.actors.find(actor=>actor.id==='cart').p[index]))<3);
  await page.screenshot({path:path.join(out,'AmbushCrossfire06E.png')});
  await page.evaluate(time=>LevelFlow.Seek(time),FLOW_TIMELINE.find(beat=>beat.id==='06h').start+35);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.find(actor=>actor.id==='tank1').disabled),true);
  await page.screenshot({path:path.join(out,'AmbushFrontApproach06H.png')});
  await page.evaluate(time=>LevelFlow.Seek(time),FLOW_TIMELINE.find(beat=>beat.id==='06i').start+1.8142);
  const destroyed=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(destroyed.actors.filter(actor=>actor.kind==='tank'&&actor.pose==='burn'&&actor.disabled&&!actor.moving).length,2);
  assert.ok(destroyed.actors.every(actor=>!actor.status?.includes('倒车')));
  await page.screenshot({path:path.join(out,'BothTanksDestroyed06I.png')});
  for(const [stamp,centerX,centerZ,zoom,name] of [[383.35,24.55,57.44,10,'NorthPursuitCovered03G'],[433.301,36.39,106.45,6,'PursuitStoppedByDefense03H'],[504.217,68.97,127.76,6,'ShunziForwardDefense04C']]) {
    await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=${stamp}&x=${centerX}&z=${centerZ}&zoom=${zoom}`);
    await page.waitForFunction(()=>window.LevelFlow, {}, {timeout:180000});
    await page.evaluate(({centerX,centerZ,zoom})=>{
      LevelFlow.SetLayout(1);LevelFlow.SetViewType(0,'battle');
      const layout=LevelFlow.Inspect().viewports;
      Object.assign(layout.views[0],{mode:'manual',center:[centerX,centerZ],scale:zoom});
      LevelFlow.RestoreViewports(layout);
    },{centerX,centerZ,zoom});
    const frame=await page.evaluate(()=>LevelFlow.Inspect());
    if(stamp===383.35) assert.ok(frame.actors.filter(actor=>actor.groupId==='Rim').every(actor=>actor.p[1]<55&&actor.firing));
    if(stamp===433.301) assert.ok(frame.actors.filter(actor=>['RearPursuit','TrafficFlank'].includes(actor.groupId)).every(actor=>actor.p[1]<85&&actor.firing));
    if(stamp===504.217) assert.ok(frame.actors.find(actor=>actor.id==='player').firing&&frame.actors.find(actor=>actor.id==='player').p[1]<130);
    await page.screenshot({path:path.join(out,name+'.png')});
  }
  const convoyVisibility=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const map=await LoadEncounterMap(),results=[];
    let creationVisible=0,creationDepthError=0;
    for(const time of [530,603.84]) {
      const frame=LevelFlow.Evaluate(time),tank=frame.actors.find(actor=>actor.id==='tank1');
      frame.effects=[];frame.zone=null;
      const bearing=Math.atan2(tank.p[0]-frame.player[0],tank.p[1]-frame.player[1]),images=[],depths=[];
      for(const include of [true,false]) {
        const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:1280px;height:720px';document.body.append(canvas);
        const view=new FlowPerspectiveView(canvas,map,'eye');
        view.BeforeDraw(frame);view.yaw=bearing-Math.atan2(view.forward[0],view.forward[2]);
        const actors=frame.actors.filter(actor=>include || actor.kind!=='tank' && !['TankEscort','TankRearScreen'].includes(actor.groupId));
        view.Draw({...frame,actors},{names:false,fire:false,spawns:false,triggers:false,routes:false,landmarks:false},null);
        if(time===530) {
          depths.push(view.raster.depth.slice());
          if(include) creationVisible=view.Diagnostics().actors.filter(actor=>/tank|TankEscort|TankRearScreen/.test(actor.id))
            .reduce((sum,actor)=>sum+actor.visible,0);
        }
        // Keep strict first-frame visibility/depth checks. Warm the GPU once
        // before exact RGB comparison, which otherwise catches one-unit AO
        // rounding differences on unrelated ground during cold uploads.
        view.baseKey='';
        view.Draw({...frame,actors},{names:false,fire:false,spawns:false,triggers:false,routes:false,landmarks:false},null);
        images.push(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data);
        canvas.remove();
      }
      let changed=0;
      for(let index=0;index<images[0].length;index+=4) {
        if([0,1,2].some(channel=>images[0][index+channel]!==images[1][index+channel])) changed++;
      }
      results.push(changed);
      if(time===530) for(let index=0;index<depths[0].length;index++) {
        if(depths[0][index]!==depths[1][index]) creationDepthError=Math.max(creationDepthError,Math.abs(depths[0][index]-depths[1][index]));
      }
    }
    return {changes:results,creationVisible,creationDepthError};
  });
  assert.equal(convoyVisibility.creationVisible,0,'convoy strokes are hidden on their first rendered frame');
  assert.equal(convoyVisibility.creationDepthError,0,'hidden convoy boxes do not alter first-frame depth');
  assert.equal(convoyVisibility.changes[0],0,'convoy creation is completely concealed in the player view');
  assert.ok(convoyVisibility.changes[1]>0,'the marching convoy emerges into view before 06A');
  await page.evaluate(()=>{LevelFlow.Seek(619.5);LevelFlow.SetPlaying(true);});
  await page.waitForFunction(()=>LevelFlow.Inspect().time>621.5);
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  const marching=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(marching.actors.filter(actor=>actor.kind==='tank').length,2);
  assert.equal(marching.actors.filter(actor=>['TankEscort','TankRearScreen'].includes(actor.groupId)).length,9);
  // Authored dialogue is a world-anchored HUD in both the map and game views.
  await page.evaluate(()=>{
    LevelFlow.SetLayout(2);
    LevelFlow.SetViewType(0,'plan');LevelFlow.SetViewType(1,'chase');
    LevelFlow.Seek(1064);
  });
  let speech = await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(speech.dialogue[0].actorId,'he');
  assert.ok(speech.speechBubbles[0].length>0,'map renders the speaking actor bubble');
  assert.ok(speech.speechBubbles[1].length>0,'chase view renders a billboard bubble');
  for(const bubbles of speech.speechBubbles) for(const bubble of bubbles) {
    assert.equal(bubble.text,speech.dialogue[0].text);
    assert.ok(bubble.lines.length>=1);
    assert.ok(bubble.box.every(Number.isFinite)&&bubble.anchor.every(Number.isFinite));
  }
  await page.screenshot({path:path.join(out,'DialogueBubbles.png')});
  const before = speech.speechBubbles[0][0].anchor;
  await page.evaluate(()=>LevelFlow.Seek(1068));
  speech=await page.evaluate(()=>LevelFlow.Inspect());
  assert.notDeepEqual(speech.speechBubbles[0][0].anchor,before,'speech follows the moving speaker');
  await page.evaluate(()=>LevelFlow.Seek(1064));
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect())).speechBubbles[0][0].anchor,before,'rewind restores the same anchor');
  await page.evaluate(()=>LevelFlow.Seek(1069));
  assert.ok((await page.evaluate(()=>LevelFlow.Inspect())).speechBubbles.every(bubbles=>bubbles.length===0),'expired speech clears all canvases');
  const speechClipping=await page.evaluate(async()=>{
    const {DrawFlowDialogue}=await import('./Script_LevelFlowDialogue.mjs');
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.width=220;canvas.height=220;
    const context=canvas.getContext('2d'),actor={id:'speaker',p:[0,10],kind:'person',pose:'stand'};
    const frame={actors:[actor],dialogue:[{actorId:actor.id,name:'Speaker',text:'A long sentence that should wrap inside a narrow viewport.'}]};
    const view={SpeechAnchor:()=>[8,80],ActorLabelOpacity:()=>1};
    const bubble=DrawFlowDialogue(context,view,frame,220,220)[0];
    const hidden=DrawFlowDialogue(context,{...view,ActorLabelOpacity:()=>0},frame,220,220).length;
    const self=DrawFlowDialogue(context,{...view,VisibleActor:()=>false},frame,220,220).length;
    const behind=FlowPerspectiveView.prototype.SpeechAnchor.call({Ground:()=>0,Vertex:()=>({x:50,y:50,depth:-1}),near:0.15,far:1500},actor);
    return {bubble,hidden,self,behind};
  });
  assert.ok(speechClipping.bubble.lines.length>1,'long speech wraps');
  assert.ok(speechClipping.bubble.box[0]>=8&&speechClipping.bubble.box[0]+speechClipping.bubble.box[2]<=212,'bubble stays within a narrow viewport');
  assert.equal(speechClipping.hidden,0,'occluded eye-view speakers have no speech HUD');
  assert.equal(speechClipping.self,0,'first-person speaker has no floating self bubble');
  assert.equal(speechClipping.behind,null,'speakers behind the camera have no anchor');
  const transferEnd=FLOW_TIMELINE.find(beat=>beat.id==='09e').end;
  // Install before the new document schedules its RAF loop. A native callback
  // already queued before installation cannot be driven by fastForward().
  await page.clock.install();
  await page.goto(base+`AdvancedTools/Tool_LevelFlow.html?variant=L1_Original&t=${transferEnd}&x=96&z=460&zoom=9`);
  await ReadyPlan();
  const transferArrival=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='YardTransfer'));
  assert.equal(transferArrival.length,5);
  for(const offset of [2,4.4106,7.99]) {
    await page.evaluate(time=>LevelFlow.Seek(time),transferEnd+offset);
    const transfers=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='YardTransfer'));
    assert.equal(transfers.length,5);
    for(const actor of transfers) {
      assert.deepEqual(actor.p,transferArrival.find(entry=>entry.id===actor.id).p,'09F keeps transferred soldiers at the junction, not back at spawn');
      assert.equal(actor.pose,'stand');
      assert.equal(actor.firing,false);
    }
  }
  await page.evaluate(time=>LevelFlow.Seek(time+4.4106),transferEnd);
  await page.screenshot({path:path.join(out,'Screenshot_YardTransferHold.png')});
  // fastForward delivers a single delayed animation frame, reproducing a
  // slow renderer without depending on the test machine's GPU or frame rate.
  await page.clock.pauseAt(new Date(Date.now()+1000));
  for(const speed of [0.5,1,2,4,8,16]) {
    await page.evaluate(speed=>{
      LevelFlow.SetPlaying(false);LevelFlow.Seek(22);
      document.getElementById('loopStage').checked=false;
      document.getElementById('flowSpeed').value=String(speed);
      LevelFlow.SetPlaying(true);
    },speed);
    await page.clock.fastForward(250);
    const state=await page.evaluate(()=>LevelFlow.Inspect());
    assert.ok(Math.abs(state.time-(22+0.25*speed))<0.001,`${speed}x preserves a 250 ms frame's elapsed time`);
    await page.evaluate(()=>LevelFlow.SetPlaying(false));
  }
  await page.evaluate(()=>{
    LevelFlow.Seek(22);document.getElementById('flowSpeed').value='1';LevelFlow.SetPlaying(true);
  });
  const beforeSlowFrame=await page.evaluate(()=>LevelFlow.Inspect());
  await page.clock.fastForward(5000);
  const afterSlowFrame=await page.evaluate(()=>LevelFlow.Inspect());
  assert.ok(Math.abs(afterSlowFrame.time-beforeSlowFrame.time-5)<0.001,'1x advances five seconds after a five-second render stall');
  const beforeSoldier=beforeSlowFrame.actors.find(actor=>actor.id==='openingAlly3');
  const afterSoldier=afterSlowFrame.actors.find(actor=>actor.id==='openingAlly3');
  const {FLOW_OPENING}=await import('./AdvancedTools/Data_LevelFlow.mjs');
  assert.ok(Math.abs(Math.hypot(afterSoldier.p[0]-beforeSoldier.p[0],afterSoldier.p[1]-beforeSoldier.p[1])/5-FLOW_OPENING.retreatSpeed)<0.01,
    'a soldier covers the configured metres per real second even during a render stall');
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  await page.clock.fastForward(3000);
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().time),afterSlowFrame.time,'paused wall time does not advance the plan');
  await page.evaluate(()=>{LevelFlow.SetPlaying(true);LevelFlow.Seek(30);});
  await page.clock.fastForward(500);
  assert.ok(Math.abs(await page.evaluate(()=>LevelFlow.Inspect().time)-30.5)<0.001,'seeking during playback rebases elapsed time');
  const firstStageEnd=FLOW_TIMELINE.find(beat=>beat.id==='02a').start;
  await page.evaluate(end=>{
    LevelFlow.Seek(end-0.2);document.getElementById('loopStage').checked=true;
  },firstStageEnd);
  await page.clock.fastForward((firstStageEnd*2+2)*1000);
  assert.ok(Math.abs(await page.evaluate(()=>LevelFlow.Inspect().time)-1.8)<0.001,'looping preserves overshoot across multiple complete stage loops');
  await page.evaluate(()=>{
    document.getElementById('loopStage').checked=false;
    LevelFlow.Seek(LevelFlow.Inspect().duration-0.2);
  });
  await page.clock.fastForward(1000);
  const ended=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(ended.time,ended.duration);
  assert.equal(ended.playing,false,'delayed final frame stops at the end of the plan');
  assert.deepEqual(errors,[]);
  console.log('ok  Encounter editor browser: 112 beats, 720p layout, safe following, per-viewport camera controls, removed setup panel, region selection, legacy draft reload, arrow/box/text, clipboard screenshots, compact toolbar, readable source, per-viewport layers, PNG export and playback');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
