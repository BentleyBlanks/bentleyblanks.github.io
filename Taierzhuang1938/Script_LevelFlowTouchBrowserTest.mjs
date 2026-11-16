import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"tmp","EncounterEditor");fs.mkdirSync(output,{recursive:true});
const server=await ServeRoot(root),browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
    localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?t=424`);
  await page.waitForFunction(()=>window.LevelFlow);
  const session=await page.context().newCDPSession(page);
  const State=()=>page.evaluate(()=>LevelFlow.Inspect());
  const Touch=async(type,points=[])=>{
    await session.send("Input.dispatchTouchEvent",{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
    await page.evaluate(()=>new Promise(requestAnimationFrame));
  };
  const Near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} / ${b}`);
  assert.equal(await page.locator("#mapReadout,.lfViewStatus").count(),0,"removed readouts leave no nodes");
  assert.equal(await page.locator(".lfMapLegend:visible").count(),0,"map HUD starts hidden");
  await page.screenshot({path:path.join(output,"TouchNavigationHudHidden.png")});
  const layers=page.locator('.lfViewPane[data-viewport="0"] .lfViewLayers');
  await layers.locator("summary").click();await layers.locator('[data-layer="hud"]').check();await layers.locator("summary").click();
  assert.equal(await page.locator(".lfMapLegend:visible").count(),1);
  await page.screenshot({path:path.join(output,"TouchNavigationHudShown.png")});
  const saved=await page.evaluate(()=>LevelFlow.Inspect().viewports);
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),saved);
  assert.equal((await State()).layers.hud,true,"HUD preference round-trips with the viewport");
  delete saved.views[0].layers.hud;
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),saved);
  assert.equal((await State()).layers.hud,false,"old snapshots default to a hidden HUD");
  await page.evaluate(()=>{LevelFlow.SetLayout(2);LevelFlow.Select({type:"actor",id:"winter"});});
  const original=await page.evaluate(()=>LevelFlow.Packet());
  for(const type of ["battle","oblique","scene","chase","eye"]) {
    await page.evaluate(type=>LevelFlow.SetViewType(0,type),type);
    const box=await page.locator("#flowMap").boundingBox(),x=box.x+box.width*0.55,y=box.y+box.height*0.6;
    const before=await State(),selection=await page.evaluate(()=>LevelFlow.Packet().context.selection);
    await Touch("touchStart",[[1,x-40,y]]);
    await Touch("touchStart",[[1,x-40,y],[2,x+40,y]]);
    const start=await State();
    await Touch("touchMove",[[1,x-64,y],[2,x+64,y]]);
    const enlarged=await State();
    if(["scene","chase","eye"].includes(type)) {
      Near(enlarged.viewports.views[0].focusDistance,start.viewports.views[0].focusDistance/1.6,`${type} spreads to zoom in`);
      assert.equal(enlarged.viewports.views[0].type,"scene");
    } else Near(enlarged.viewports.views[0].scale,start.viewports.views[0].scale*1.6,`${type} spreads to zoom in`);
    await Touch("touchMove",[[1,x-32,y],[2,x+32,y]]);
    const reduced=await State();
    if(type==="battle"||type==="oblique") Near(reduced.viewports.views[0].scale,start.viewports.views[0].scale*0.8,`${type} pinches to zoom out`);
    else Near(reduced.viewports.views[0].focusDistance,start.viewports.views[0].focusDistance/0.8,`${type} pinches to zoom out`);
    await Touch("touchMove",[[1,x-2,y+18],[2,x+62,y+18]]);
    const panned=await State();
    assert.notDeepEqual(panned.viewports.views[0].center,reduced.viewports.views[0].center,`${type} two fingers pan`);
    if(panned.viewports.views[0].freeCamera) {
      Near(panned.viewports.views[0].freeCamera.eye[1],reduced.viewports.views[0].freeCamera.eye[1],`${type} touch pan stays on XZ`);
      Near(panned.viewports.views[0].freeCamera.pitch,reduced.viewports.views[0].freeCamera.pitch,`${type} pan preserves pitch`);
    }
    const angle=Math.PI/6;
    await Touch("touchMove",[[1,x+30-32*Math.cos(angle),y+18-32*Math.sin(angle)],[2,x+30+32*Math.cos(angle),y+18+32*Math.sin(angle)]]);
    const rotated=await State();
    if(type!=="battle") {
      const current=rotated.viewports.views[0],prior=panned.viewports.views[0];
      Near(current.freeCamera?.yaw??current.yaw,(prior.freeCamera?.yaw??prior.yaw)+angle,`${type} clockwise twist follows the fingers`);
      Near(current.freeCamera?.pitch??current.pitch,prior.freeCamera?.pitch??prior.pitch,`${type} twist preserves pitch`);
    }
    await Touch("touchMove",[[1,x+30-32*Math.cos(-angle),y+18-32*Math.sin(-angle)],[2,x+30+32*Math.cos(-angle),y+18+32*Math.sin(-angle)]]);
    if(type!=="battle") {
      const current=(await State()).viewports.views[0],prior=panned.viewports.views[0];
      Near(current.freeCamera?.yaw??current.yaw,(prior.freeCamera?.yaw??prior.yaw)-angle,`${type} counterclockwise twist follows the fingers`);
    }
    await Touch("touchEnd",[[2,x+30+32*Math.cos(-angle),y+18+32*Math.sin(-angle)]]);
    const released=await State();
    await Touch("touchMove",[[2,x+80,y+60]]);
    assert.deepEqual((await State()).viewports.views[0],released.viewports.views[0],"remaining finger cannot become a stray drag");
    await Touch("touchEnd");
    assert.deepEqual(await page.evaluate(()=>LevelFlow.Packet().context.selection),selection,"pinching does not select units");
    assert.deepEqual((await State()).document,before.document,"gestures do not edit the scene");
    assert.deepEqual((await State()).viewports.views[1],before.viewports.views[1],"gesture only affects its viewport");
  }
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),original.context.viewports);
  const box=await page.locator("#flowMap").boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  for(const cancel of ["cancel","blur","escape"]) {
    await Touch("touchStart",[[1,x-40,y],[2,x+40,y]]);
    await Touch("touchMove",[[1,x-55,y],[2,x+55,y]]);
    if(cancel==="cancel") await Touch("touchCancel");
    if(cancel==="blur") await page.evaluate(()=>window.dispatchEvent(new Event("blur")));
    if(cancel==="escape") await page.keyboard.press("Escape");
    if(cancel!=="cancel") await Touch("touchEnd");
    assert.equal(await page.locator("#flowMap").getAttribute("data-navigation-action"),null,`${cancel} clears touch navigation`);
  }
  await page.getByRole("button",{name:"手形工具",exact:true}).click();
  const beforeMouse=(await State()).viewports.views[0];
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+25);await page.mouse.up();
  const afterMouse=(await State()).viewports.views[0];
  assert.notDeepEqual(afterMouse.freeCamera.eye,beforeMouse.freeCamera.eye,"mouse works after touch cancellation");
  Near(afterMouse.freeCamera.eye[1],beforeMouse.freeCamera.eye[1],"LMB hand drag preserves height");
  await page.getByRole("button",{name:"选择工具",exact:true}).click();
  await page.evaluate(()=>{
    LevelFlow.SetViewType(0,"battle");
    const layout=LevelFlow.Inspect().viewports,player=LevelFlow.Inspect().actors.find(actor=>actor.id==="player");
    Object.assign(layout.views[0],{center:[...player.p],scale:8,mode:"manual"});
    LevelFlow.RestoreViewports(layout);LevelFlow.Select(null);
  });
  const tapPoint=await page.evaluate(()=>LevelFlow.ToScreen(LevelFlow.Inspect().actors.find(actor=>actor.id==="player").p));
  await Touch("touchStart",[[1,box.x+tapPoint[0],box.y+tapPoint[1]]]);await Touch("touchEnd");
  assert.equal((await page.evaluate(()=>LevelFlow.Packet().context.selection))?.id,"player","single-finger tapping still selects a unit");
  await page.evaluate(layout=>LevelFlow.RestoreViewports(layout),original.context.viewports);
  await Touch("touchStart",[[1,x-40,y],[2,x+40,y]]);
  await Touch("touchMove",[[1,x-55,y],[2,x+55,y]]);
  await Touch("touchStart",[[1,x-55,y],[2,x+55,y],[3,x+75,y+30]]);
  const threeFinger=(await State()).viewports.views[0];
  await Touch("touchEnd",[[2,x+55,y],[3,x+75,y+30]]);
  assert.deepEqual((await State()).viewports.views[0],threeFinger,"replacing a contact rebases without moving the camera");
  await Touch("touchMove",[[2,x+40,y],[3,x+90,y+30]]);await Touch("touchEnd");
  await Touch("touchStart",[[1,x-40,y],[2,x+40,y]]);
  await page.evaluate(()=>LevelFlow.SetViewType(0,"battle"));
  const switched=(await State()).viewports.views[0];
  await Touch("touchMove",[[1,x-60,y],[2,x+60,y]]);await Touch("touchEnd");
  assert.deepEqual((await State()).viewports.views[0],switched,"changing view type cancels the old gesture");
  assert.deepEqual(errors,[]);
  console.log("ok  Native touch pinch in/out, ground-plane pan, twist, release/cancel recovery, per-viewport HUD and legacy snapshots");
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
