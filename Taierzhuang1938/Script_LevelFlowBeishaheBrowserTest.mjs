import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,"tmp/BeishaheDetail");
fs.mkdirSync(out,{recursive:true});
const server=await ServeRoot(root),browser=await LaunchBrowser();
try {
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.addInitScript(()=>{
   localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
   localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?variant=L1_Original&t=2400`);
 await page.waitForFunction(()=>window.LevelFlow,{},{timeout:180000});
 await page.locator("#toggleInspector").click();
 const Camera=async(eye,target)=>page.evaluate(({eye,target})=>{
   const layout=LevelFlow.Inspect().viewports;layout.count=1;layout.active=0;layout.views=layout.views.slice(0,1);
   Object.assign(layout.views[0],{type:"scene",mode:"manual",center:[target[0],target[2]],freeCamera:{eye,yaw:Math.atan2(target[0]-eye[0],target[2]-eye[2]),pitch:Math.atan2(target[1]-eye[1],Math.hypot(target[0]-eye[0],target[2]-eye[2]))},layers:{fire:false,triggers:false,spawns:false,routes:false,names:false,landmarks:true,hud:false}});
   LevelFlow.RestoreViewports(layout);
 },{eye,target});
 for(const [name,eye,target] of [
   ["VillageOverview",[190,150,1250],[125,0,1100]],
   ["AidYard",[122,15,1194],[99,0,1167]],
   ["TianEntrance",[108,3,1195],[100,-.5,1189.6]],
   ["TianInterior",[98.5,-.45,1190.2],[105,0,1189.6]],
   ["HouseWindows",[138.4,2.1,1042],[138.4,1.5,1036.8]],
   ["WallSlogan",[119,2.6,1065.4],[125.29,1.7,1061.27]],
   ["MatEntrance",[111,2.4,1211.5],[105.5,-.3,1210.5]],
   ["Church",[63,4,1230],[63,2.5,1218.5]],
   ["SandRiverReach",[126,31,1325],[63,-2,1270]],
   ["SandRiverBridge",[-48,9,1320],[-81,-1,1296]],
 ]) {
   await Camera(eye,target);await page.evaluate(()=>new Promise(requestAnimationFrame));
   await page.screenshot({path:path.join(out,`Verified_${name}.png`)});
 }
 await page.evaluate(async()=>{const {BeatById}=await import('./Script_LevelFlowModel.mjs');LevelFlow.Seek(BeatById('15b').end-1);});
 await Camera([100.8,-.85,1189.5],[97.92,-.85,1189.5]);
 await page.screenshot({path:path.join(out,'Verified_NierDrawing.png')});
 await page.evaluate(async()=>{const {BeatById}=await import('./Script_LevelFlowModel.mjs');LevelFlow.Seek(BeatById('16c').end-1);});
 await Camera([110,1.8,1210.5],[105.8,-.7,1210.5]);
 await page.screenshot({path:path.join(out,'Verified_MatCovered.png')});
 await page.evaluate(()=>{const layout=LevelFlow.Inspect().viewports;Object.assign(layout.views[0],{type:'plan',center:[130,1115],scale:2.2,freeCamera:null});LevelFlow.RestoreViewports(layout);});
 await page.screenshot({path:path.join(out,'Verified_Plan.png')});
 // Use the actual scene and renderer to test readable wall writing independently
 // of the scene-name overlay, including the software fallback.
 const lettering=await page.evaluate(async()=>{
   const {LoadEncounterMap}=await import("./Script_LevelFlowMap.mjs");
   const {FlowPerspectiveView}=await import("./Script_LevelFlowPerspective.mjs");
   const map=await LoadEncounterMap(),frame=LevelFlow.Evaluate(2400),results=[];
   const canvas=document.createElement("canvas");canvas.style.cssText="position:fixed;left:-2000px;width:640px;height:360px";document.body.append(canvas);
   for(const software of [false,true]) {
     const view=new FlowPerspectiveView(canvas,map,"scene");if(software)view.raster.gpu=null;
     view.center=[125.29,1061.27];view.freeCamera={eye:[119,2.6,1065.4],yaw:Math.atan2(6.29,-4.13),pitch:-.12};
     const layers={names:false,landmarks:false,fire:false,routes:false,spawns:false,triggers:false};
     view.Draw(frame,layers,null);const context=canvas.getContext("2d"),written=context.getImageData(0,0,canvas.width,canvas.height).data.slice();
     const signs=map.objects.filter(o=>o.meta?.slogan),texts=signs.map(o=>o.meta.slogan);signs.forEach(o=>o.meta.slogan="");
     view.baseKey="";view.Draw(frame,layers,null);const blank=context.getImageData(0,0,canvas.width,canvas.height).data;
     signs.forEach((o,index)=>o.meta.slogan=texts[index]);
     let changed=0;for(let i=0;i<blank.length;i+=4)if(Math.abs(written[i]-blank[i])+Math.abs(written[i+1]-blank[i+1])+Math.abs(written[i+2]-blank[i+2])>15)changed++;
     view.freeCamera={eye:[108,3,1195],yaw:Math.atan2(-8,-5.4),pitch:-.3};view.center=[100,1189.6];
     view.Draw(frame,{...layers,landmarks:true},null);
     results.push({software,changed,labels:view.visibleLandmarks});
   }
   canvas.remove();return results;
 });
 for(const result of lettering) {
   assert.ok(result.changed>60,`wall writing renders visible characters independently of labels (${JSON.stringify(result)})`);
   assert.ok(result.labels.some(label=>label.id==="LmTianHoleMouth"&&!label.hidden),"the actual shelter entrance annotation is visible");
 }
 assert.deepEqual(errors,[]);
 console.log("ok Beishahe 720p plan/village/aid/shelter interiors/doors/windows/church/mat/drawing screenshots; GPU and software wall writing and entrance labels");
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
