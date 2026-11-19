import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
if(!process.env.ENCOUNTER_TEST_BASE) {
  await promisify(execFile)(process.execPath,["Taierzhuang1938/AdvancedTools/Script_EncounterLibrary.mjs"],{cwd:root});
}
const server=process.env.ENCOUNTER_TEST_BASE?null:await ServeRoot(root,0);
const base=process.env.ENCOUNTER_TEST_BASE||"http://127.0.0.1:"+server.address().port;
const browser=await LaunchBrowser();
try {
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  const urls=[],errors=[];
  page.on("request",r=>urls.push(new URL(r.url()).pathname));
  page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    if(!location.href.startsWith("http"))return;
    localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
    localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
  });
  const start=performance.now();
  await page.goto(base+"/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?beat=05b",{waitUntil:"commit"});
  await page.waitForFunction(()=>window.LevelFlow?.Inspect().beat==="05b",null,{timeout:180000});
  const editorMs=performance.now()-start;
  const terrain=await page.evaluate(()=>LevelFlow.Inspect().terrainBuild);
  assert.equal(terrain.source,"library","A fresh browser must hydrate the disk snapshot without a terrain worker");
  assert.equal(terrain.buildMs,0);
  async function Play() {
    const at=performance.now();
    await page.locator("#playGame").click();
    await page.waitForFunction(()=>{
      const game=document.querySelector(".lfPlayHost iframe")?.contentWindow.Tengxian;
      return game?.state.running&&game.Debug.EncounterPlay.State().ready&&document.querySelector(".lfPlayLoading").hidden;
    },null,{timeout:180000});
    const diagnostics=await page.evaluate(()=>{
      const game=document.querySelector(".lfPlayHost iframe").contentWindow.Tengxian;
      return {id:game.Debug.EncounterPlay.State().hostId,warm:game.state.actorShaderWarm};
    });
    return {...diagnostics,ms:performance.now()-at};
  }
  const cold=await Play();
  assert.ok(cold.warm.passProgramsSubmitted>0);
  assert.ok(cold.warm.firstBatch.programs<16,"First draw should reuse post, depth and instanced attachment programs");
  assert.ok(urls.some(url=>/\/Library\/Cast\/[a-f0-9]{64}\.glb$/.test(url)));
  const manifest=await page.evaluate(async()=> (await (await fetch("./Library/Data_Cast.json")).json()).models);
  const sources=Object.keys(manifest).map(file=>"/Taierzhuang1938/"+file.slice(2));
  assert.ok(!urls.some(url=>sources.some(source=>url.endsWith(source))),"Playing an imported character must not download its authoring GLB");
  await page.clock.install();
  await page.evaluate(()=>LevelFlow.Play.Stop());
  await page.clock.fastForward(121000);
  assert.ok(await page.evaluate(()=>LevelFlow.Play.State().cached),"Reading the editor for two minutes retains the host");
  await page.evaluate(()=>document.dispatchEvent(new Event("input",{bubbles:true})));
  await page.clock.fastForward(8.5*60000);
  assert.ok(await page.evaluate(()=>LevelFlow.Play.State().cached),"Editing renews the foreground idle period");
  const repeat=await Play();assert.equal(repeat.id,cold.id);
  await page.evaluate(()=>LevelFlow.Play.Stop());
  await page.locator("#releasePlayCache").click();
  assert.equal(await page.evaluate(()=>LevelFlow.Play.State().cached),false);
  assert.ok(await page.locator("#releasePlayCache").isHidden());
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({editorMs,coldMs:cold.ms,repeatMs:repeat.ms,terrain:terrain.source,warm:cold.warm}));
} finally {
  await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}
