import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {FIRST_LEVEL_STAGES,FIRST_LEVEL_ENCOUNTER_STARTS,FIRST_LEVEL_DEFERRED_ENCOUNTERS} from "./Data_FirstLevelMissionStages.mjs";
import {MISSION_STAGES} from "./Data_FirstLevelMission.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(here,"_shots","FirstLevelStageJump");
await fs.mkdir(output,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0), browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}), errors=[];
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
      gun:g.viewmodel.weaponId,overlap:g.physics.Overlaps(g.player.position.x,g.player.position.y+.04,g.player.position.z,g.player.radius,Math.max(.62,g.player.eyeHeight+.16))};
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
  // 17 → 18 现在长了：死亡确认之后接收处要真的继续工作（门外那一副担架走进来、
  // 军医转过去救下一个）才算 17 走完，18 又要等传令兵**跑到**接收处才开口。
  // 实拍 deathSceneComplete 在 36 s、BridgeOrders 的对白还要十几秒（End 包 2026.09.20）。
  await WaitStep("BridgeCover",150);
  const results=[];
  for(const number of [1,18,2,17,3,16,4,15,5,14,6,13,7,12,8,11,9,10,14,3,18,1]) {
    const start=await Jump(number);
    let after=await Step();
    if(number===2){
      // 02 一进来班长就在拖人（控制接管 rescue）。倒在木架下的姿势不是站着的胶囊，
      // 所以要等真的还了控制权再量净空。
      for(let seconds=0;after.controls&&seconds<45;seconds++)after=await Step(60);
      assert.ok(!after.controls,"stage 2 rescue returns player control within its deadline");
    }
    if(number===1){
      // 01 受困段整段是控制接管（trapped）：只能小幅转头，不量行走净空。
      assert.equal(after.controls,true,"the trapped take owns the camera on entry");
    }
    assert.ok(after.alive&&after.running,"play resumes "+number);
    if(number!==1)assert.ok(!after.overlap,"player capsule clears stage "+number+": "+JSON.stringify(after.position));
    assert.equal(after.mission.failed,false);
    if(number<14)assert.equal(after.carry,null,"old stretcher is cleared");
    if(number===1){assert.ok(!after.mission.facts.includes("deathSceneComplete"));assert.equal(after.mission.column.loaded,0);}
    if(number===14)await WaitStep("Rescue",40);
    if(number===17)await WaitStep("BridgeCover",150);
    if([4,10,13,14,16,17,18].includes(number))await page.screenshot({path:path.join(output,`Scene_Stage${number}.png`)});
    results.push({number,start,after});
    console.log("ok stage",number,start.stage,"live",after.mission.stage,"facts",after.mission.facts.length);
  }
  // 18 的关尾**换掉半张地图**：铁路桥翻成残骸（5 完好件 + 3 残骸件），北门夜景那一片
  // 连夜天空与五盏点光一起换上。两样都挂在事实上，所以「死亡重试」与「回跳」都得把它们
  // 还回去 —— 还不回去就会得到「夜的天、白天的地」或者一座已经炸掉却又完好的桥。
  // 摆关尾状态走出厂入口（flow.Enter / bridge.Fire / PlaceNightArrival），
  // 收回来走玩家真会按的那两条（阵亡重试、调试选章）。
  {
    // 桥的四个件按**闸门**看（完好件是可走面，不在 battlefield.colliders 里；
    // 口径与 Script_FirstLevelMissionTopologyBrowserTest 的 Visible/Walkable 一致）。
    const World=()=>page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      const Visible=id=>!!g.battlefield.gates.get(id)?.mesh.visible;
      return {stage:r.flow.stage.id,
        night:r.flow.facts.has("nightArrivalPlaced"),blown:r.flow.facts.has("bridgeDestroyed"),
        deck:Visible("RailBridgeDeck"),
        deckWalkable:g.battlefield.walkableSurfaces.some(s=>s.id==="RailBridgeDeck"),
        wreck:Visible("RailBridgeWreckSpan"),
        lights:r.nightLights?.count??0,rear:(r.bridge.State().rearColumn||[]).length};
    });
    await Jump(18);
    const fresh=await World();
    assert.ok(fresh.deck&&fresh.deckWalkable&&!fresh.wreck&&!fresh.blown&&!fresh.night&&fresh.lights===0&&fresh.rear===0,
      "跳进 18：桥完好、没有夜景、没有夜灯、尾队还没起行 "+JSON.stringify(fresh));
    const ended=await page.evaluate(nightIndex=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      r.flow.index=nightIndex;r.flow.Enter();
      r.flow.facts.add("blastZoneCleared");
      r.bridge.blast={set:0,ready:true,fired:false,waitedS:0,stuckS:0,overdue:false,lastInside:null};
      r.bridge.Fire();
      r.BeginNightTransition();r.PlaceNightArrival();
      g.StepFrames(6,1/60,false);
      return {x:+g.player.position.x.toFixed(1),z:+g.player.position.z.toFixed(1)};
    },MISSION_STAGES.findIndex(step=>step.id==="NightMarch"));
    const tail=await World();
    assert.ok(!tail.deck&&!tail.deckWalkable&&tail.wreck&&tail.blown&&tail.night&&tail.lights>=5,
      "关尾状态真的摆起来了（桥没了、夜景与夜灯都在）"+JSON.stringify({tail,ended}));
    // ① 死亡重试：夜景与夜天空退回去重演，桥**不**回来（爆破不可逆）。
    const retried=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      r.OnPlayerDown();const ok=r.Retry();g.StepFrames(6,1/60,false);return ok;
    });
    assert.ok(retried,"18 的死亡重试真的恢复了");
    const afterRetry=await World();
    assert.ok(!afterRetry.night&&afterRetry.lights===0&&!afterRetry.deck&&afterRetry.blown,
      "死亡重试：夜景与夜灯全撤，炸掉的桥不会自己长回来 "+JSON.stringify(afterRetry));
    // ② 回跳到 12 再跳回 18：桥完好、夜景消失、天空还原、尾队重置。
    await Jump(12);
    const back=await World();
    assert.ok(back.deck&&back.deckWalkable&&!back.wreck&&!back.blown&&!back.night&&back.lights===0,
      "从 18 回跳到 12：桥完好、夜景与夜灯一盏不留 "+JSON.stringify(back));
    await Jump(18);
    const again=await World();
    assert.ok(again.deck&&again.deckWalkable&&!again.wreck&&!again.blown&&!again.night&&again.lights===0&&again.rear===0,
      "再跳回 18：桥完好、没有夜景、尾队重置 "+JSON.stringify(again));
    console.log("ok 18 关尾还原：死亡重试退夜景、回跳还桥与天空、尾队重置");
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
