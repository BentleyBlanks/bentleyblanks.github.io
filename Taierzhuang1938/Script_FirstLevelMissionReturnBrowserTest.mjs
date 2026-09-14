import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const here=path.dirname(fileURLToPath(import.meta.url)),output=path.join(here,"_shots","MissionReturn");
await fs.mkdir(output,{recursive:true});
const server=process.env.MISSION_RETURN_PREVIEW?null:await ServeRoot(path.resolve(here,".."),0);
const origin=process.env.MISSION_RETURN_PREVIEW||`http://127.0.0.1:${server.address().port}`;
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on("pageerror",e=>errors.push(String(e)));
async function Move(x,z,frames=210){return page.evaluate(({x,z,frames})=>{
 const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),p=r.Point({x,z});
 g.player.position.copy(p);g.player.body.Teleport(p.x,p.y,p.z);g.player.velocity.set(0,0,0);
 g.player.yaw=0;g.player.pitch=0;g.player.SyncCamera(0);
 g.StepFrames(frames,1/60,false);g.StepFrames(1,1/60,true);
 const el=document.querySelector('.hudMissionReturn'),box=el.getBoundingClientRect();
 return {warning:g.Debug.FirstLevelMission().returnWarning,on:el.classList.contains('on'),
  box:{width:box.width,height:box.height},pointerEvents:getComputedStyle(el).pointerEvents,
  player:{x:g.player.position.x,z:g.player.position.z},stage:r.flow.stage.id};
},{x,z,frames});}
try{
 await page.goto(`${origin}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,{waitUntil:"domcontentloaded",timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state.ready,null,{timeout:180000});
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(8));
 await page.evaluate(()=>window.Tengxian.Debug.SetDebugOption('invincible',true));
 const safe=await Move(48,-20);assert.equal(safe.on,false);
 const brief=await Move(103,-20,30);assert.equal(brief.on,false);
 const warning=await Move(103,-20,65);assert.ok(warning.on);assert.equal(warning.warning.reason,'route');
 assert.deepEqual(warning.box,{width:1280,height:720});assert.equal(warning.pointerEvents,'none');
 await page.waitForTimeout(400);await page.screenshot({path:path.join(output,'Scene_ReturnWarning.png')});
 const urgent=await Move(122,-20,90);assert.equal(urgent.warning.urgent,true);
 await page.waitForTimeout(400);await page.screenshot({path:path.join(output,'Scene_ReturnUrgent.png')});
 // A warning leaves actual keyboard-driven movement available (webdriver fake lock).
 await page.keyboard.down('KeyA');
 await page.evaluate(()=>window.Tengxian.StepFrames(45,1/60,false));
 await page.keyboard.up('KeyA');
 const afterInput=await page.evaluate(()=>window.Tengxian.player.position.x);
 assert.ok(afterInput<urgent.player.x-.5,'movement remains enabled during warning');
 const recovered=await Move(48,-20,2);assert.equal(recovered.on,false);
 await page.waitForTimeout(400);await page.screenshot({path:path.join(output,'Scene_ReturnRecovered.png')});
 await Move(122,-20);
 await page.evaluate(()=>{const g=window.Tengxian;g.player.alive=false;g.StepFrames(1,1/60,false);});
 assert.equal(await page.locator('.hudMissionReturn').getAttribute('aria-hidden'),'true');
 await page.evaluate(()=>window.Tengxian.Debug.FirstLevelJump(1));
 const train=await page.evaluate(()=>{const g=window.Tengxian;g.StepFrames(2,1/60,false);return g.Debug.FirstLevelMission().returnWarning;});
 assert.equal(train,null,'new runtime and scripted opening have no stale warning');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'Data_ReturnWarning.json'),JSON.stringify({safe,brief,warning,urgent,afterInput,recovered,train,errors},null,2));
 console.log('PASS real mission return: 720p overlay, delay, escalation, keyboard movement, return, death and new mission');
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
