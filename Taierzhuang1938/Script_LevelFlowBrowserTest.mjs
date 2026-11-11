import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser, ServeProject } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { FLOW_TIMELINE, FLOW_DURATION } from "./Script_LevelFlowModel.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.join(root,"tmp","LevelFlow");
fs.mkdirSync(out,{recursive:true});
const server=await ServeProject(root);
const base=`http://127.0.0.1:${server.address().port}/Taierzhuang1938/`;
const browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",(error)=>errors.push(error.message));
  await page.goto(`${base}Tool_LevelFlow.html?beat=03a`);
  await page.waitForFunction(()=>window.LevelFlow);
  assert.equal(await page.locator(".lfStage").count(),10);
  for(const beat of FLOW_TIMELINE) {
    await page.evaluate((time)=>window.LevelFlow.Seek(time),beat.start+beat.duration*0.55);
    assert.equal(await page.locator("#beatTitle").textContent(),beat.title);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight);
    assert.equal(overflow,false,`${beat.id} fits at 720p`);
  }
  const Capture=async(id,name)=>{
    await page.evaluate((id)=>window.LevelFlow.JumpBeat(id),id);
    await page.screenshot({path:path.join(out,`${name}.png`)});
  };
  await Capture("03a","Drag");
  const before=await page.evaluate(()=>window.LevelFlow.Inspect());
  await page.evaluate(()=>window.LevelFlow.Seek(1500));
  await page.evaluate((time)=>window.LevelFlow.Seek(time),before.time);
  assert.deepEqual(await page.evaluate(()=>window.LevelFlow.Inspect()),before);
  await page.locator("#flowMap").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal((await page.evaluate(()=>window.LevelFlow.Inspect())).time,before.time+1);
  await page.click("#playFlow");
  await page.waitForFunction((time)=>window.LevelFlow.Inspect().time>time+0.5,before.time);
  await page.click("#playFlow");
  assert.equal((await page.evaluate(()=>window.LevelFlow.Inspect())).playing,false);
  await page.click('[data-stage="06"]');
  await page.selectOption("#cameraMode","tracking");
  await Capture("06b","TankDrag");
  await page.click("#expandCamera");
  assert.ok(await page.locator("#cameraPanel").evaluate((element)=>element.classList.contains("expanded")));
  await page.screenshot({path:path.join(out,"CameraExpanded.png")});
  await page.click("#expandCamera");
  await page.selectOption("#cameraMode","player");
  await Capture("09d","VillageStealth");
  await page.click("#sourceDetails summary");
  assert.ok((await page.locator("#sourcePassage").textContent()).includes("捂住她的嘴"));
  await page.click("#sourceDetails summary");
  await Capture("10d","StreetFight");
  await page.click('[data-layer="fire"]');
  assert.equal((await page.evaluate(()=>window.LevelFlow.Inspect())).layers.fire,false);
  await page.click('[data-layer="fire"]');
  const scaleBefore=await page.locator("#mapScale").textContent();
  await page.hover("#flowMap",{position:{x:160,y:260}});
  await page.mouse.wheel(0,-200);
  assert.notEqual(await page.locator("#mapScale").textContent(),scaleBefore);
  await page.evaluate((time)=>window.LevelFlow.Seek(time),FLOW_DURATION);
  assert.equal((await page.evaluate(()=>window.LevelFlow.Inspect())).beat,"10j");
  for(const width of [1024,800]) {
    await page.setViewportSize({width,height:720});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]);
  // Exercise the public editor entry through its normal Open method. The menu
  // registry is additionally covered by ToolsHomeTest and ModuleGraphTest.
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(async()=>{
    const {LevelFlowEntry}=await import("./Script_EditorLevelFlow.mjs");
    const button=document.createElement("button");button.id="entryFixture";button.textContent="Open";
    button.style.cssText="position:fixed;top:0;left:0;z-index:100";
    button.onclick=()=>LevelFlowEntry.Open();document.body.append(button);
  });
  const popupPromise=page.waitForEvent("popup");
  await page.click("#entryFixture");
  const popup=await popupPromise;
  await popup.waitForFunction(()=>window.LevelFlow);
  assert.ok(popup.url().includes("Tool_LevelFlow.html"));
  await popup.close();
  console.log("ok  LevelFlow browser: all 68 beats rendered at 1280x720, rewind, playback, keyboard, layers, camera modes, resize and editor popup");
} finally {
  await browser.close();
  await new Promise((resolve)=>server.close(resolve));
}
