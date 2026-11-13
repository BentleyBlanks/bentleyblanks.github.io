import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser,ServeProject} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {FLOW_TIMELINE} from "./AdvancedTools/Script_LevelFlowModel.mjs";
import {FLOW_SOURCE_EXCERPTS} from "./AdvancedTools/Data_LevelFlowSource.mjs";
import {ReadPngFrameMetadata} from "./AdvancedTools/Script_LevelFlowDocument.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,"tmp","EncounterEditor");
fs.mkdirSync(out,{recursive:true});
const server=await ServeProject(root),base=`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
const browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1,acceptDownloads:true});
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(()=>{
    localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));
    localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));
  });
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  async function ReadyPlan() {
    await page.waitForFunction(()=>window.LevelFlow);
    await page.evaluate(()=>{LevelFlow.SetViewType(0,'plan');LevelFlow.SetViewType(1,'oblique');LevelFlow.ActivateView(0);});
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
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=384`);await page.waitForFunction(()=>window.LevelFlow);
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
      const view={eye:[0,0,0],right:[1,0,0],up:[0,1,0],forward:[0,0,1],focal:32,scale:4,far:50,width:64,height:48,
        type:perspective?'scene':'oblique',CameraPoint:point=>point,
        Vertex:point=>({x:32+point[0]*4,y:48*.57-point[1]*4,depth:point[2]})};
      view.FaceVertices=(...args)=>FlowPerspectiveView.prototype.FaceVertices.apply(view,args);
      const world=[[-7,6,0],[8,5,6],[0,-8,80]],colors=[[210,70,40],[40,170,80],[70,60,190]];
      const WorldDraw=raster=>{
        raster.Begin(64,48,perspective);raster.view=view;
        if(raster.accelerated) raster.WorldTriangle(world,colors);
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
  const defaults=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  assert.equal(defaults.count,2);
  assert.deepEqual(defaults.views.map(view=>view.type),['scene','scene']);
  assert.ok(defaults.views.every(view=>view.mode==='manual'&&view.freeCamera));
  assert.ok(defaults.views[0].freeCamera.pitch<-0.5&&defaults.views[1].focusDistance<defaults.views[0].focusDistance/2,'the default pair provides an aerial and a near-ground Scene camera');
  for(const type of ['scene','plan','battle','oblique','chase','eye']) {
    await page.evaluate(type=>LevelFlow.SetViewType(1,type),type);
    for(const playing of [true,false]) {
      await page.evaluate(playing=>{LevelFlow.Seek(384);LevelFlow.SetPlaying(playing);},playing);
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
  await page.evaluate(()=>LevelFlow.Seek(600));
  assert.deepEqual((await page.evaluate(()=>LevelFlow.Inspect().viewports.views)).map(view=>view.freeCamera),defaults.views.map(view=>view.freeCamera),'scrubbing preserves both manually controlled Scene cameras');
  await page.evaluate(()=>LevelFlow.Seek(384));
  await page.evaluate(()=>{
    LevelFlow.SetViewType(0,'oblique');LevelFlow.SetViewType(1,'battle');
    const layout=LevelFlow.Inspect().viewports;
    for(const view of layout.views) {
      view.center=[36.5,66.5];view.scale=15;view.mode='manual';view.freeCamera=null;
      view.yaw=-0.4;view.pitch=0.65;
    }
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(116.4);
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
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(123.9);
  });
  const fugitives=(await page.evaluate(()=>LevelFlow.Inspect())).actors.filter(actor=>actor.groupId==='OpeningSurvivors');
  assert.equal(fugitives.length,3);
  assert.ok(fugitives.every(actor=>actor.pose==='run'&&actor.p[0]<27),'the three fugitives have already cleared the crowd in the reported 02G frame');
  await page.screenshot({path:path.join(out,'OpeningMeleeDisengaged.png')});
  await page.evaluate(defaults=>{LevelFlow.Seek(145);LevelFlow.Seek(116.4);LevelFlow.RestoreViewports(defaults);LevelFlow.Seek(384);},defaults);
  const skyPixels=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:320px;height:240px';document.body.append(canvas);
    const view=new FlowPerspectiveView(canvas,{objects:[],farObjects:[],terrain:{heightAt:()=>0,roots:[]}},'scene');
    view.freeCamera={eye:[0,1.6,0],yaw:0,pitch:0.3};view.Draw(LevelFlow.Evaluate(384),{},null);
    const context=canvas.getContext('2d'),pixels=[20,210].map(y=>[...context.getImageData(160,y,1,1).data]);
    canvas.remove();return pixels;
  });
  assert.ok(skyPixels[0][2]>skyPixels[0][0]+15&&skyPixels[0][0]<180,'the sky dome has a blue zenith');
  assert.notDeepEqual(skyPixels[0],skyPixels[1],'the sky has an elevation gradient');
  await page.evaluate(()=>{LevelFlow.SetViewType(0,'plan');LevelFlow.SetViewType(1,'oblique');LevelFlow.ActivateView(0);});
  assert.equal(await page.locator("h1").textContent(),"Encounter Designer");
  assert.equal(await page.title(),"Encounter Designer · 血战滕县");
  await page.evaluate(()=>LevelFlow.Seek(165));
  const junctionBlockers=(await page.evaluate(()=>LevelFlow.Inspect())).actors.filter(actor=>["OpeningSurvivors","ForkRelief"].includes(actor.groupId));
  assert.equal(junctionBlockers.length,5);
  assert.ok(junctionBlockers.every(actor=>actor.pose==="shoot"));
  await page.screenshot({path:path.join(out,"JunctionBlockade.png")});
  const returnViews=await page.evaluate(()=>LevelFlow.Inspect().viewports);
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
  await page.evaluate(()=>LevelFlow.Seek(455.569));
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
    LevelFlow.RestoreViewports(layout);LevelFlow.Seek(455.569);
  });
  const groundFormation=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>['GroundWest','GroundEast'].includes(actor.groupId)));
  assert.equal(groundFormation.length,8);
  assert.ok(groundFormation.some(actor=>actor.pose==='run')&&groundFormation.some(actor=>actor.firing),'the camp preview displays advancing infantry and covering fire together');
  await page.screenshot({path:path.join(out,"GroundInfantryFormation.png")});
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),campViews);
  await page.evaluate(()=>LevelFlow.Seek(207.137));
  const pressure=(await page.evaluate(()=>LevelFlow.Inspect())).actors.filter(actor=>actor.groupId==="Fork");
  assert.equal(pressure.length,5);
  assert.equal(new Set(pressure.map(actor=>actor.p.join(","))).size,5);
  assert.equal(pressure.filter(actor=>actor.pose==="run").length,2);
  assert.equal(pressure.filter(actor=>actor.firing).length,3);
  await page.screenshot({path:path.join(out,"EnemyFormation.png")});
  await page.evaluate(()=>LevelFlow.Seek(398.55));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==="TrafficFlank").every(actor=>actor.born<390)),"second west-ramp batch waits until all three originals have fallen");
  await page.evaluate(()=>LevelFlow.Seek(419));
  const flankRefill=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==="TrafficFlank"&&actor.pose!=="dead"));
  assert.equal(flankRefill.length,3);
  assert.ok(flankRefill.every(actor=>actor.born>398&&actor.p[1]>86),"the complete second batch advances through the marked bend");
  await page.screenshot({path:path.join(out,"WestRampRefill.png")});
  await page.evaluate(()=>LevelFlow.Seek(384));
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
  assert.equal(await page.locator("[data-stage]").count(),10);
  assert.ok((await page.evaluate(()=>window.LevelFlow.Inspect())).mapObjects>1000);
  assert.equal(await page.locator('.lfViewPane:visible').count(),2);
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
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=384&x=21.9&z=67.1&zoom=12`);await ReadyPlan();
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
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=384`);await ReadyPlan();
  for(const beat of FLOW_TIMELINE) {
    await page.evaluate((time)=>window.LevelFlow.Seek(time),beat.start+beat.duration*0.5);
    assert.equal(await page.locator("#beatTitle").textContent(),beat.title);
    assert.equal(await page.locator("#sourcePassage").textContent(),FLOW_SOURCE_EXCERPTS[beat.id],"paragraph formatting retains all script wording");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight),false);
  }
  await page.evaluate(()=>window.LevelFlow.Seek(384));
  await page.screenshot({path:path.join(out,"Retreat.png")});
  await page.click('.lfViewPane[data-viewport="0"] [data-framing="follow"]');
  const framing=await page.evaluate(()=>{
    const state=window.LevelFlow.Inspect(),canvas=document.getElementById('flowMap');
    return state.actors.filter(actor=>actor.pose!=="dead"&&Math.hypot(actor.p[0]-state.actors[0].p[0],actor.p[1]-state.actors[0].p[1])<115).map(actor=>({name:actor.name,p:window.LevelFlow.ToScreen(actor.p),width:canvas.clientWidth,height:canvas.clientHeight}));
  });
  assert.ok(framing.every(({p,width,height})=>p[0]>20&&p[1]>20&&p[0]<width-20&&p[1]<height-20),"follow keeps the player, threats and defenders inside the viewport");
  await page.click('.lfViewPane[data-viewport="0"] [data-framing="stage"]');
  assert.equal(await page.locator('[data-tab="edit"],#editPane,#objectList,#objectForm,#undoFlow,#redoFlow').count(),0);
  const firstBefore=await page.evaluate(()=>LevelFlow.Inspect().viewports.views[0]);
  await page.click('.lfViewPane[data-viewport="1"] [data-framing="all"]');
  const framedViews=await page.evaluate(()=>LevelFlow.Inspect().viewports.views);
  assert.equal(framedViews[1].mode,'all');assert.deepEqual(framedViews[0],firstBefore,'viewport controls only reframe their own viewport');
  const fullMap=await page.evaluate(async()=>{
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const {bounds}=await LoadEncounterMap(),canvas=document.getElementById('flowMap2');
    return {width:canvas.clientWidth,height:canvas.clientHeight,corners:[[bounds[0],bounds[2]],[bounds[1],bounds[2]],[bounds[1],bounds[3]],[bounds[0],bounds[3]]].map(point=>LevelFlow.ToScreen(point,1))};
  });
  assert.ok(fullMap.corners.every(point=>point[0]>=20&&point[0]<=fullMap.width-20&&point[1]>=20&&point[1]<=fullMap.height-20),'the entire level fits inside the overview viewport');
  await page.click('.lfViewPane[data-viewport="1"] [data-framing="follow"]');
  assert.equal((await page.evaluate(()=>LevelFlow.Inspect().viewports.views[1])).mode,'follow');
  await page.click('.lfViewPane[data-viewport="1"] [data-framing="follow"]');
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
  await page.evaluate(()=>window.LevelFlow.Seek(384));
  assert.equal(await page.locator('#exportProject,#importProject,#importFile,#planningSection,[data-tab="notes"]').count(),0);
  const layout=await page.evaluate(()=>({toolbar:document.querySelector('.lfToolbar').getBoundingClientRect().height,
    passage:document.querySelector('#sourcePassage').textContent,paragraphs:document.querySelectorAll('#sourcePassage p').length}));
  assert.ok(layout.toolbar<=52,'all navigation fits in one compact row at 720p');
  assert.ok(layout.paragraphs>1,'source passage is broken into readable paragraphs');
  async function ReadLocationAttachment() {
    await page.click('[data-tab="chat"]');
    await page.click('#attachCodexLocation');
    await page.locator('.lfChatContext').evaluate(element=>{element.open=true;element.dispatchEvent(new Event('toggle'));});
    return page.locator('#codexContextDetail').textContent();
  }
  assert.equal(await page.locator('#copyFrame,#copyViewports').count(),0);
  const locationText=await ReadLocationAttachment();
  assert.ok(!locationText.includes('http'),'AI location contains no URL');
  const location=JSON.parse(locationText);
  assert.equal(location.timeline.timeSeconds,384);
  assert.equal(location.timeline.secondsIntoBeat,384-location.timeline.beatStartSeconds);
  assert.equal(location.viewports.length,2);assert.ok(location.player.x&&Number.isFinite(location.player.y));
  assert.equal(location.coordinates.unit,'metres');
  await page.evaluate(()=>LevelFlow.Seek(400));
  assert.equal(JSON.parse(await page.locator('#codexContextDetail').textContent()).timeline.timeSeconds,384,'location attachment stays at its captured time');
  await page.click('#removeCodexLocation');
  assert.ok(await page.locator('#codexPendingLocation').isHidden());
  await page.evaluate(()=>LevelFlow.Seek(384));
  const fireMenu=page.locator('.lfViewPane').first().locator('.lfViewLayers');
  await fireMenu.locator('summary').click();await fireMenu.locator('[data-layer="fire"]').uncheck();
  const layerState=await page.evaluate(()=>LevelFlow.Inspect().viewports.views.map(view=>view.layers));
  assert.equal(layerState[0].fire,false);assert.equal(layerState[1].fire,true,'display settings belong to each viewport');
  await fireMenu.locator('[data-layer="fire"]').check();await fireMenu.locator('summary').click();
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
    if(text) {await page.locator('#screenshotText').fill(text);await page.locator('#screenshotText').press('Tab');}
  }
  await Draw('arrow',[0.1,0.2],[0.3,0.4]);
  await Draw('rect',[0.6,0.2],[0.85,0.6]);
  await Draw('text',[0.3,0.75],[0.3,0.75],'这里加两名追兵');
  assert.ok((await page.locator('#annotationStatus').textContent()).includes('3 处'));
  await page.click('#undoAnnotation');assert.ok((await page.locator('#annotationStatus').textContent()).includes('3 处'));
  await page.click('#undoAnnotation');assert.ok((await page.locator('#annotationStatus').textContent()).includes('2 处'));
  await page.click('#redoAnnotation');await page.click('#redoAnnotation');
  await page.click('#copyScreenshot');await page.waitForFunction(()=>document.querySelector('#annotationStatus').textContent.includes('已复制标记截图'));
  assert.equal(downloads,0,'annotated image copies without downloading');
  await page.screenshot({path:path.join(out,'AnnotationDialog.png')});
  const downloadPromise=page.waitForEvent('download');await page.click('#exportFrame');const download=await downloadPromise;
  const imagePath=path.join(out,'FrameWithMetadata.png');await download.saveAs(imagePath);
  const metadata=ReadPngFrameMetadata(Uint8Array.from(fs.readFileSync(imagePath)).buffer);
  assert.equal(metadata.context.time,384);assert.equal(metadata.screenshot.marks.length,3);
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
  await page.waitForFunction(()=>window.LevelFlow.Inspect().time>384.2);await page.keyboard.press('Space');
  assert.equal((await page.evaluate(()=>window.LevelFlow.Inspect())).playing,false);
  await page.click('[data-stage="01"]');assert.ok(await page.locator('.lfBeats .cinematic').count()>0);
  await page.click('[data-stage="09"]');await page.click('[data-tab="script"]');await page.screenshot({path:path.join(out,'Village.png')});
  await page.click('[data-stage="05"]');await page.evaluate(()=>window.LevelFlow.JumpBeat('05c'));await page.screenshot({path:path.join(out,'TankApproach.png')});
  await page.setViewportSize({width:1024,height:720});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1280,height:720});
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=652.25&x=86.50&z=258.85&zoom=12`);
  await ReadyPlan();
  const groundFrame=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(groundFrame.time,652.25);
  assert.ok(groundFrame.actors.filter(actor=>actor.kind==='tank').every(actor=>actor.p[0]>100));
  await page.screenshot({path:path.join(out,'GroundTank652.png')});
  const roundTrips=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const {LoadEncounterMap}=await import('./Script_LevelFlowMap.mjs');
    const view=new FlowPerspectiveView(document.getElementById('flowMap2'),await LoadEncounterMap(),'oblique');
    view.center=[100,246];view.scale=10;view.BeforeDraw(LevelFlow.Evaluate(652.25));
    return [[101,240],[88,238],[96,247]].map(point=>({point,restored:view.ToWorld(view.ToScreen(point))}));
  });
  assert.ok(roundTrips.every(({point,restored})=>Math.hypot(point[0]-restored[0],point[1]-restored[1])<0.1),'elevated ground, trench floor and ramp keep consistent edit coordinates');

  await page.evaluate(()=>{LevelFlow.SetLayout(1);LevelFlow.SetViewType(0,'oblique');});
  await page.locator('.lfViewTarget').first().selectOption('tank1');
  await page.screenshot({path:path.join(out,'GroundTankOblique652.png')});
  await page.evaluate(()=>localStorage.removeItem('tengxian1938_encounter_v2'));
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=384&x=73&z=115&zoom=5.5`);
  await ReadyPlan();
  const early=await page.evaluate(()=>LevelFlow.Inspect());
  assert.ok(early.actors.some(actor=>actor.kind==='tank'),'vehicle threat is present during dragging before collection');
  await page.screenshot({path:path.join(out,'EarlyGroundEncounter.png')});
  await page.evaluate(()=>LevelFlow.Seek(301));
  const alignment=await page.evaluate(()=>{
    const axis=document.querySelector('#timelineAxis').getBoundingClientRect(),range=document.querySelector('#flowSeek').getBoundingClientRect();
    const seconds=LevelFlow.Inspect().time,duration=LevelFlow.Inspect().duration;
    return {playhead:document.querySelector('.lfPlayhead').getBoundingClientRect().x,
      slider:range.x+7+(range.width-14)*seconds/duration,expected:axis.x+axis.width*seconds/duration,
      stages:[...document.querySelectorAll('[data-stage]')].map(element=>({id:element.dataset.stage,x:element.getBoundingClientRect().x})),
      beats:[...document.querySelectorAll('[data-beat]')].map(element=>({id:element.dataset.beat,x:element.getBoundingClientRect().x,width:element.getBoundingClientRect().width})),axis:{x:axis.x,width:axis.width}};
  });
  assert.ok(Math.abs(alignment.playhead-alignment.expected)<0.1&&Math.abs(alignment.slider-alignment.expected)<0.1,"05:01 slider and playhead use the same global time position");
  for(const beat of FLOW_TIMELINE) assert.ok(Math.abs(alignment.beats.find(item=>item.id===beat.id).x-(alignment.axis.x+alignment.axis.width*beat.start/1870))<0.1,"every beat uses the global time axis");
  for(const beat of FLOW_TIMELINE) assert.ok(Math.abs(alignment.beats.find(item=>item.id===beat.id).width-alignment.axis.width*beat.duration/1870)<0.1,"short beats retain their actual duration width");
  for(const stage of alignment.stages) assert.ok(Math.abs(stage.x-(alignment.axis.x+alignment.axis.width*FLOW_TIMELINE.find(beat=>beat.stage===stage.id).start/1870))<0.1,"every stage uses the global time axis");
  await page.screenshot({path:path.join(out,'Timeline301.png')});

  await page.evaluate(()=>{LevelFlow.SetPlaying(false);LevelFlow.SetLayout(2);LevelFlow.SetViewType(1,'oblique');LevelFlow.Seek(384);});
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
  assert.equal(stopped.time,384);assert.equal(stopped.playing,false);
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

  const depth=await page.evaluate(async()=>{
    const {FlowPerspectiveView}=await import('./Script_LevelFlowPerspective.mjs');
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:640px;height:360px';document.body.append(canvas);canvas.width=640;canvas.height=360;
    const data={objects:[{id:'Wall',pos:[0,0,5],size:[4,3,1],material:'Whitebox/Plaster'}],farObjects:[],terrain:{heightAt:()=>0,roots:[],source:'Flat regression scene'}};
    const view=new FlowPerspectiveView(canvas,data,'scene');view.freeCamera={eye:[0,1.6,0],yaw:0,pitch:0};
    const actors=[{id:'visible',kind:'person',side:'friend',pose:'stand',p:[0,3]},
      {id:'hidden',kind:'person',side:'friend',pose:'stand',p:[0,10]},
      {id:'partial',kind:'person',side:'friend',pose:'stand',p:[4.4,10]}];
    const frame={...LevelFlow.Evaluate(384),actors};view.BeforeDraw(frame);view.DrawBase(canvas.getContext('2d'),640,360,frame);
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
  await page.evaluate(()=>{LevelFlow.SetViewType(0,'chase');LevelFlow.SetViewType(1,'eye');LevelFlow.Seek(150);LevelFlow.SetPlaying(true);});
  await page.waitForFunction(()=>LevelFlow.Inspect().time>150.2);
  assert.ok((await page.evaluate(()=>LevelFlow.Inspect().rendering)).every(view=>view.renderScale===1),'playback preserves full terrain resolution');
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  await page.waitForFunction(()=>LevelFlow.Inspect().rendering.every(view=>view.renderScale===1));
  await page.evaluate(()=>{LevelFlow.SetViewType(1,'oblique');LevelFlow.Seek(384);});
  await page.screenshot({path:path.join(out,'RealTerrainGully.png')});
  await page.evaluate(()=>LevelFlow.JumpBeat('06g'));await page.screenshot({path:path.join(out,'CartLane.png')});
  await page.evaluate(()=>localStorage.removeItem('tengxian1938_encounter_v2'));
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=227.14&x=45&z=65&zoom=9`);
  await ReadyPlan();
  assert.equal(await page.locator('#planningSection').count(),0);
  await page.evaluate(()=>LevelFlow.Seek(186.63));
  const deployed=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='Fork'));
  assert.equal(deployed.length,5);
  assert.equal(new Set(deployed.map(actor=>actor.born)).size,1);
  assert.equal(new Set(deployed.map(actor=>actor.p.join(','))).size,5);
  assert.ok(deployed.every(actor=>actor.pose==='kneel'&&!actor.firing));
  const forkDocument=(await page.evaluate(()=>LevelFlow.Inspect().document)).groups.find(group=>group.id==='Fork');
  assert.equal(forkDocument.spawnOffsets.map(point=>point.join(', ')).join('\n'),"2.3, -9.9\n10.3, -3.5\n-10.6, -5\n5.5, 3.8\n-8.4, 1.8");
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
  await page.evaluate(()=>LevelFlow.Seek(227.14));
  await page.screenshot({path:path.join(out,'DragDoorPressure.png')});
  await page.evaluate(()=>LevelFlow.Seek(252));
  const rampEnemy=await page.evaluate(()=>LevelFlow.Inspect().actors.find(actor=>actor.groupId==='Corner'&&actor.pose!=='dead'));
  assert.ok(rampEnemy,'second pressure reaches the door ramp after the first wave');
  await page.screenshot({path:path.join(out,'DragRampPressure.png')});
  await page.evaluate(()=>LevelFlow.Seek(364.5));
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='TrafficFlank').length),0);
  await page.evaluate(()=>LevelFlow.Seek(369));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.some(actor=>actor.groupId==='TrafficFlank')));
  await page.screenshot({path:path.join(out,'TrafficSecondRampPressure.png')});
  await page.goto(`${base}AdvancedTools/Tool_LevelFlow.html?t=26.14&x=45&z=58&zoom=6`);
  await page.waitForFunction(()=>window.LevelFlow);
  const opening=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(opening.actors.filter(actor=>actor.id==='yao'||actor.id.startsWith('openingGun')).length,4);
  assert.equal(opening.actors.filter(actor=>['luo','he','liu'].includes(actor.id)||actor.id.startsWith('openingAlly')).length,12);
  await page.screenshot({path:path.join(out,'OpeningDeparture.png')});
  await page.evaluate(()=>LevelFlow.Seek(40.05));
  const approaching=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>/^opening\d+$/.test(actor.id)));
  assert.equal(approaching.length,9);
  assert.ok(approaching.some(actor=>actor.pose==='run'));
  await page.screenshot({path:path.join(out,'OpeningEnemyApproach.png')});
  await page.evaluate(()=>LevelFlow.Seek(85));
  const rescueApproach=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>['luo','he','liu'].includes(actor.id)||actor.id.startsWith('openingAlly')));
  assert.equal(new Set(rescueApproach.map(actor=>actor.rescueGroup)).size,4);
  assert.ok(rescueApproach.some(actor=>actor.pose==='walk')&&rescueApproach.some(actor=>actor.pose==='kneel'),'advancing soldiers and observers have independent timing');
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.id.startsWith('openingAlly')).every(actor=>{
    const before=LevelFlow.Evaluate(74).actors.find(previous=>previous.id===actor.id);
    return Math.hypot(actor.p[0]-before.p[0],actor.p[1]-before.p[1])>3;
  })),'each trio makes progress along its approach between observation halts');
  await page.screenshot({path:path.join(out,'OpeningReturn.png')});
  await page.evaluate(()=>LevelFlow.Seek(107));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.id.startsWith('openingAlly')).every(actor=>actor.pose==='kneel')));
  await page.screenshot({path:path.join(out,'OpeningSouthBerm.png')});
  await page.evaluate(()=>LevelFlow.Seek(107.654));
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
    LevelFlow.Seek(1084);
  });
  const villageRunners=await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='VillageCasualties'));
  assert.equal(villageRunners.length,2);
  assert.ok(villageRunners.every(actor=>actor.pose==='run'));
  await page.screenshot({path:path.join(out,'VillageEscape.png')});
  await page.evaluate(()=>LevelFlow.Seek(1086.05));
  const villageHit=await page.evaluate(()=>LevelFlow.Inspect());
  assert.equal(villageHit.actors.find(actor=>actor.id==='villager2').pose,'hit');
  assert.ok(await page.evaluate(()=>LevelFlow.Evaluate(1086.05).effects.some(effect=>effect.targetId==='villager2'&&effect.phase<0.3)));
  await page.screenshot({path:path.join(out,'VillageMachineGunHit.png')});
  await page.evaluate(()=>{LevelFlow.Seek(1088.1);LevelFlow.SetPlaying(true);});
  await page.waitForFunction(()=>LevelFlow.Inspect().time>1089.4);
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  assert.ok(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='VillageCasualties').every(actor=>actor.pose==='dead')));
  await page.screenshot({path:path.join(out,'VillageBodies.png')});
  await page.evaluate(()=>LevelFlow.JumpBeat('08c'));
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().actors.filter(actor=>actor.groupId==='VillageCasualties'&&actor.pose==='dead').length),2);
  await page.screenshot({path:path.join(out,'VillageBodies08C.png')});
  assert.deepEqual(errors,[]);
  console.log('ok  Encounter editor browser: 68 beats, 720p layout, safe following, per-viewport camera controls, removed setup panel, region selection, legacy draft reload, arrow/box/text, clipboard screenshots, compact toolbar, readable source, per-viewport layers, PNG export and playback');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
