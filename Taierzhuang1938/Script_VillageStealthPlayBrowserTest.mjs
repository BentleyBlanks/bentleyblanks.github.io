import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { BeatById, DEFAULT_ENCOUNTER_DOCUMENT } from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";

const root=path.resolve(import.meta.dirname,".."),out=path.join(root,"tmp/TemplePlay");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];page.on("pageerror",error=>errors.push(error.message));
const payload={token:"TempleTest",time:BeatById("09b").start,document:DEFAULT_ENCOUNTER_DOCUMENT};
await page.addInitScript(payload=>{
  localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
  localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
  if(!sessionStorage.getItem("tengxian1938_encounter_play_session_v1"))sessionStorage.setItem("tengxian1938_encounter_play_session_v1",JSON.stringify(payload));
},payload);
async function Ready() {
  await page.waitForFunction(()=>window.Tengxian?.Debug?.EncounterPlay?.State().ready,null,{timeout:420000});
  const boot=page.locator("#bootStart");
  if(await boot.isVisible())await boot.click({timeout:180000});
  await page.waitForFunction(()=>Tengxian.state.running,null,{timeout:180000});
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/index.html?encounterPlay=1&manual=1`);
  await Ready();console.log("ok temple Play loaded");
  const pageMarker=await page.evaluate(()=>window.templePageMarker=crypto.randomUUID());
  let state=await page.evaluate(()=>Tengxian.Debug.EncounterPlay.State());
  assert.equal(state.beat,"09b");assert.ok(state.stealth.locked);
  const pulled=await page.evaluate(()=>{
    const g=Tengxian,z=g.player.position.z;
    g.Debug.Key("KeyW",true);g.StepFrames(54,1/60,false);g.Debug.Key("KeyW",false);g.StepFrames(1,0,true);
    return {state:g.Debug.EncounterPlay.State(),stance:g.player.stance,position:g.player.position.toArray(),z};
  });
  assert.equal(pulled.stance,"crouch");assert.ok(pulled.state.stealth.locked);
  const liu=pulled.state.actors.find(actor=>actor.id==="liu");
  assert.ok(Math.hypot(liu.position[0]-80.9,liu.position[2]-426.9)<0.6,"Liu remains inside the temple beside the player");
  assert.ok(Math.abs(pulled.position[2]-426.28)<.15,"movement stays captured during the short pull");
  await page.screenshot({path:path.join(out,"Scene_ActualTemplePull.png"),timeout:120000});
  const released=await page.evaluate(()=>{Tengxian.StepFrames(66,1/60,false);return Tengxian.Debug.EncounterPlay.State();});
  assert.ok(!released.stealth.locked && !released.failed,"control returns without an alarm");
  const concealed=await page.evaluate(()=>{Tengxian.StepFrames(1800,1/60,false);return Tengxian.Debug.EncounterPlay.State();});
  assert.ok(!concealed.failed&&!concealed.stealth.alarm,"waiting in the authored cover stays safe for the full search");
  assert.equal(concealed.actors.filter(actor=>actor.group==="TempleSearch"&&actor.alive).length,2);
  assert.match(await page.locator(".encounterPlayHud").innerText(),/禁止开火/);
  const fired=await page.evaluate(()=>{
    const g=Tengxian;g.player.yaw=0;g.player.pitch=0;g.StepFrames(4,1/60,false);
    const ammo=g.state.ammo;g.Debug.Fire();g.StepFrames(2,1/60,false);
    return {ammo,after:g.state.ammo,state:g.Debug.EncounterPlay.State()};
  });
  assert.ok(fired.after<fired.ammo,"the real firearm discharges");
  assert.equal(fired.state.stealth.reason,"shot");
  state=await page.evaluate(()=>{Tengxian.StepFrames(156,1/60,false);Tengxian.StepFrames(1,0,true);return Tengxian.Debug.EncounterPlay.State();});
  assert.ok(state.failed);
  assert.match(await page.locator(".encounterPlayHud").innerText(),/后送通道被封锁/);
  assert.match(await page.locator(".encounterHint").innerText(),/R/);
  await page.screenshot({path:path.join(out,"Scene_ActualTempleFailure.png"),timeout:120000});
  console.log("ok real pull, input release and gunshot failure");
  await page.evaluate(()=>Tengxian.Debug.Key("KeyR"));
  await page.waitForFunction(()=>Tengxian.Debug.EncounterPlay.State().startBeat==="09a"&&!Tengxian.Debug.EncounterPlay.State().failed);
  assert.equal(await page.evaluate(()=>window.templePageMarker),pageMarker,"retry keeps the loaded game and models");
  const retried=await page.evaluate(()=>({state:Tengxian.Debug.EncounterPlay.State(),ammo:Tengxian.state.ammo}));
  assert.equal(retried.state.startBeat,"09a");assert.equal(retried.ammo,fired.ammo);
  assert.ok(!retried.state.failed&&!retried.state.stealth.alarm,"retry clears alarm and reloads the checkpoint");
  await page.evaluate(()=>{Tengxian.Debug.Throw("Grenade",.5);Tengxian.StepFrames(90,1/60,false);});
  const grenade=await page.evaluate(()=>Tengxian.Debug.EncounterPlay.State());
  assert.equal(grenade.stealth.reason,"grenade");
  await page.evaluate(()=>Tengxian.StepFrames(160,1/60,false));
  assert.ok((await page.evaluate(()=>Tengxian.Debug.EncounterPlay.State())).failed);
  await page.evaluate(()=>Tengxian.Debug.Key("KeyR"));
  assert.equal(await page.evaluate(()=>Tengxian.combat.projectiles.length),0,"retry clears live grenades");
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?beat=09b`);
  await page.waitForFunction(()=>window.LevelFlow);
  const editor=await page.evaluate(()=>({time:LevelFlow.Inspect().time,document:JSON.stringify(LevelFlow.Inspect().document)}));
  await page.locator("#playGame").click();
  const Playing=()=>page.evaluate(()=>document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian?.Debug.EncounterPlay?.State());
  await page.waitForFunction(()=>{
    const game=document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian;
    return game?.state.running&&game.Debug.EncounterPlay.State().ready&&!game.Debug.EncounterPlay.State().stealth.locked;
  },null,{timeout:420000});
  let game=page.frames().find(frame=>frame.url().includes("encounterPlay=1"));
  await game.evaluate(()=>{Tengxian.player.yaw=0;Tengxian.player.pitch=0;Tengxian.StepFrames(4,1/60,false);Tengxian.Debug.Fire();});
  await page.waitForFunction(()=>document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian?.Debug.EncounterPlay.State().failed,null,{timeout:30000});
  await game.evaluate(()=>Tengxian.Debug.Key("KeyR"));
  await page.waitForFunction(()=>{
    const game=document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian;
    const state=game?.Debug.EncounterPlay?.State();
    return game?.state.running&&state?.ready&&state.startBeat==="09a"&&!state.failed&&document.querySelector(".lfPlayLoading").hidden;
  },null,{timeout:420000});
  assert.equal((await Playing()).stealth.alarm,false);
  await page.screenshot({path:path.join(out,"Scene_EditorPlayRetry.png"),timeout:120000});
  await page.locator("#playGame").click();
  assert.equal(await page.evaluate(()=>LevelFlow.Inspect().time),editor.time);
  assert.equal(await page.evaluate(()=>JSON.stringify(LevelFlow.Inspect().document)),editor.document);
  console.log("ok editor Play retries automatically and Stop restores the untouched authoring snapshot");
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,"Data_Result.json"),JSON.stringify({pulled,released,fired,state,retried,grenade,errors},null,2));
  console.log("ok real grenade failure, checkpoint ammo restoration and clean 720p Play");
} catch(error) {
  console.log(JSON.stringify(await page.evaluate(()=>({boot:document.querySelector("#boot")?.innerText,
    ready:window.Tengxian?.state.ready,game:window.Tengxian?.Debug?.EncounterPlay?.State()})).catch(()=>null)));
  await page.screenshot({path:path.join(out,"Scene_Error.png"),timeout:120000}).catch(()=>{});
  throw error;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
