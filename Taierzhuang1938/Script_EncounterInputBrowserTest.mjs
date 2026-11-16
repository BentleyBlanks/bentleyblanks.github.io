import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.join(root,"tmp/EncounterInput");await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.addInitScript(()=>{
  localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
  localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
});
try {
  const base=process.env.ENCOUNTER_TEST_BASE||`http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?beat=05b`);
  await page.waitForFunction(()=>window.LevelFlow);
  await page.locator("#playGame").click();
  await page.waitForFunction(()=>{const g=document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian;return g?.state.running&&g.Debug.EncounterPlay.State().ready;},null,{timeout:240000});
  const frame=page.frames().find(f=>f.url().includes("encounterPlay=1"));
  await page.locator(".lfPlayLoading").waitFor({state:"hidden"});
  await frame.evaluate(()=>{
    Tengxian.player.SetDebugOptions({invincible:true});
    window.inputProbe=[];
    document.addEventListener("keydown",e=>inputProbe.push(e.code));
  });
  async function Probe(label) {
    const before=await frame.evaluate(()=>({events:inputProbe.length,p:Tengxian.player.position.toArray()}));
    await page.keyboard.down("w");await page.waitForTimeout(400);await page.keyboard.up("w");
    const after=await frame.evaluate(()=>({events:inputProbe.length,p:Tengxian.player.position.toArray(),running:Tengxian.state.running,failed:Tengxian.Debug.EncounterPlay.State().failed,menu:Tengxian.state.menu}));
    const focus=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id}));
    const result={label,before,after,focus};console.log(JSON.stringify(result));return result;
  }
  const initial=await Probe("initial");
  assert.ok(initial.after.events>initial.before.events);
  await page.locator("#pauseGame").click();await page.locator("#playGame").click();
  const resume=await Probe("resume");
  await page.screenshot({path:path.join(out,"Resume.png")});
  assert.ok(resume.after.events>resume.before.events,"Resume must return keyboard events to the game iframe");
  assert.ok(Math.hypot(...resume.after.p.map((n,i)=>n-resume.before.p[i]))>.1,"W must move the player after resume");
  await page.locator("#pauseGame").click();await page.locator("#pauseGame").click();
  const toggle=await Probe("pause button resume");
  assert.ok(toggle.after.events>toggle.before.events);
  await page.locator("#viewportLayout").selectOption("2");
  const layout=await Probe("layout change");
  assert.ok(layout.after.events>layout.before.events,"Layout control must return keyboard focus");
  // Reproduce a misplaced keyboard focus without changing the running game.
  await page.locator("#pauseGame").focus();await page.keyboard.press("Escape");
  assert.equal(await page.locator("#pauseGame").getAttribute("aria-pressed"),"true","Outer document Escape must pause Play");
  assert.equal(await frame.evaluate(()=>Tengxian.state.running),false);
  await page.keyboard.press("Escape");
  const escape=await Probe("outer Escape resume");assert.ok(escape.after.events>escape.before.events);
  for(let interval=1;interval<=3;interval++) {
    await page.waitForTimeout(20000);
    const sustained=await Probe(`continued play ${interval*20}s`);
    assert.ok(sustained.after.events>sustained.before.events,"Running Play must retain keyboard focus over time");
  }
  await page.locator("#stopGame").click();
  assert.equal(await page.locator("#stopGame").isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log("ok  Play keyboard focus: both resume buttons, layout, outer Escape and sustained play");
} finally {await browser.close();await new Promise(r=>server.close(r));}
