import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {FIRST_LEVEL_STAGES,FIRST_LEVEL_ENCOUNTER_STARTS,FIRST_LEVEL_DEFERRED_ENCOUNTERS} from "./Data_FirstLevelMissionStages.mjs";
import {MISSION_STAGES} from "./Data_FirstLevelMission.mjs";
import {MISSION_TRAIN} from "./Data_FirstLevelMissionTrain.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(here,"_shots","FirstLevelStageJump");
await fs.mkdir(output,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0), browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
page.on("pageerror",error=>{errors.push(String(error));console.log("PAGEERROR",String(error));});
async function Jump(number) {
  await page.evaluate(()=>{window.Tengxian.state.playerShots=123;});
  const state=await page.evaluate(number=>window.Tengxian.Debug.FirstLevelJump(number),number);
  assert.equal(await page.evaluate(()=>window.Tengxian.state.playerShots),0,"old fire cannot satisfy this start's task gates");
  assert.equal(state.phaseNumber,number);assert.equal(state.stage,FIRST_LEVEL_STAGES[number-1].entry);
  assert.equal(state.phaseCount,18);assert.ok(state.remaining.length);
  const index=MISSION_STAGES.findIndex(step=>step.id===state.stage);
  assert.ok(MISSION_STAGES.slice(0,index).flatMap(s=>s.requirements).every(f=>state.facts.includes(f)));
  const spawned=await page.evaluate(()=>[...window.Tengxian.Debug.FirstLevelMissionRuntime().spawned]);
  for(const [id,first] of Object.entries(FIRST_LEVEL_ENCOUNTER_STARTS))
    if(first>number)assert.ok(!spawned.includes(id),"future encounter remains available: "+number+" / "+id);
  for(const id of FIRST_LEVEL_DEFERRED_ENCOUNTERS[number]||[])assert.ok(!spawned.includes(id),"later attack in the current public phase remains available: "+id);
  await page.evaluate(()=>{const g=window.Tengxian;g.Debug.SetDebugOption("invincible",true);g.Debug.SetDebugOption("infiniteAmmo",true);});
  return state;
}
async function Step(frames=120) {
  return page.evaluate(frames=>{
    const g=window.Tengxian;
    g.StepFrames(frames,1/60,false);g.StepFrames(1,1/60,true);
    return {mission:g.Debug.FirstLevelMission(),alive:g.player.Alive,running:g.state.running,
      position:{...g.player.position},carry:g.carry.KindId,controls:g.state.missionControl,
      gun:g.viewmodel.weaponId,overlap:g.physics.Overlaps(g.player.position.x,g.player.position.y+.04,g.player.position.z,g.player.radius,1.7)};
  },frames);
}
async function WaitStep(id,seconds) {
  let result;
  for(let i=0;i<seconds;i+=5){result=await Step(300);if(result.mission.stage===id)break;}
  assert.equal(result.mission.stage,id,JSON.stringify(result));return result;
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,{waitUntil:"domcontentloaded",timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:180000});
  const menu=await page.evaluate(()=>{const g=window.Tengxian;g.Debug.Pause();g.Debug.MenuAct("debug");return [...document.querySelectorAll("#firstLevelStageSelect option")].map(o=>({id:o.value,text:o.textContent}));});
  assert.equal(menu.length,18);
  await page.screenshot({path:path.join(output,"Scene_DebugOptions.png")});
  // Real DOM action, followed by the same awaited agent API for all other starts.
  await page.selectOption("#firstLevelStageSelect","Death");
  await page.locator('[data-action="firstLevelJump"]').click();
  await page.waitForFunction(()=>window.Tengxian?.state.ready&&!window.Tengxian.state.advancing&&window.Tengxian.Debug.FirstLevelMission()?.phaseNumber===17,null,{timeout:180000});
  await WaitStep("FinalDefense",45);
  const results=[];
  for(const number of [1,18,2,17,3,16,4,15,5,14,6,13,7,12,8,11,9,10,14,3,18,1]) {
    const start=await Jump(number), after=await Step();
    assert.ok(after.alive&&after.running,"play resumes "+number);
    assert.ok(!after.overlap,"player capsule clears stage "+number+": "+JSON.stringify(after.position));
    assert.equal(after.mission.failed,false);
    if(number<14)assert.equal(after.carry,null,"old stretcher is cleared");
    if(number===1){assert.ok(!after.mission.facts.includes("deathSceneComplete"));assert.equal(after.mission.column.loaded,0);}
    if(number===2){
      const point=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().safePoint);
      assert.ok(Math.abs(point.trainZ-MISSION_TRAIN.player.z)<.01,"retry stays at the authored carriage-local position");
    }
    if(number===14)await WaitStep("Rescue",40);
    if(number===17)await WaitStep("FinalDefense",45);
    if([4,10,13,14,16,17,18].includes(number))await page.screenshot({path:path.join(output,`Scene_Stage${number}.png`)});
    results.push({number,start,after});
    console.log("ok stage",number,start.stage,"live",after.mission.stage,"facts",after.mission.facts.length);
  }
  const invalid=await page.evaluate(async()=>{const g=window.Tengxian,before=JSON.stringify(g.Debug.FirstLevelMission());let rejected=false;try{await g.Debug.FirstLevelJump(19);}catch{rejected=true;}return rejected&&before===JSON.stringify(g.Debug.FirstLevelMission());});
  assert.ok(invalid,"invalid jumps leave the run untouched");
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,"Data_StageJumps.json"),JSON.stringify(results,null,2));
  console.log("ok all 18 starts, backward/repeated jumps, menu action and air/death continuation");
} catch(error) {
  await page.screenshot({path:path.join(output,"Scene_Failure.png")}).catch(()=>{});
  const state=await page.evaluate(()=>({mission:window.Tengxian?.Debug.FirstLevelMission(),boot:document.querySelector("#bootText")?.textContent})).catch(()=>null);
  await fs.writeFile(path.join(output,"Data_Failure.json"),JSON.stringify(state,null,2));
  throw error;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
