// Targeted Support fixture; stage setup and teleports are diagnostic, not campaign evidence.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {MISSION_ENCOUNTERS} from "./Data_FirstLevelMission.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,"_shots/FrontPresence");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],receipts=[];
page.on("pageerror",error=>errors.push(String(error)));
async function Place(x,z){
  await page.evaluate(({x,z})=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),p=r.Point({x,z});
    g.player.position.copy(p);g.player.body.Teleport(p.x,p.y,p.z);
    g.player.yaw=0;g.player.pitch=0;g.player.SyncCamera(0);
  },{x,z});
}
async function Advance(seconds){
  for(let time=0;time<seconds;time+=2)await page.evaluate(frames=>window.Tengxian.StepFrames(frames,1/60,false),Math.min(2,seconds-time)*60);
}
async function Receipt(label){
  const state=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    return {time:r.time,failed:r.failed,playerHealth:g.player.health,squad:r.squad.map(a=>({id:a.castId,health:a.health,position:a.position.toArray()})),stage:r.flow.stage.id,started:r.Has("frontBattleStarted"),
      enemies:[...r.enemies.values()].map(a=>({id:a.missionId,encounter:a.missionEncounter,alive:a.alive,health:a.health,shots:a.fireSequence,position:a.position.toArray()}))};
  });
  receipts.push({label,...state});console.log(label,JSON.stringify(state));return state;
}
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
  await page.evaluate(async()=>{
    const g=window.Tengxian;await g.Debug.FirstLevelJump(3);
    const r=g.Debug.FirstLevelMissionRuntime(),{MISSION_STAGES}=await import("./Data_FirstLevelMission.mjs");
    const {OPENING}=await import("./Data_FirstLevelOpening.mjs");
    // Support follows a cleared trench and a squad already at the dressing
    // recess. Leaving the checkpoint's uncleared intruders/old squad positions
    // would test an impossible overlap of two encounters.
    for(const [id,actor] of r.enemies)if(actor.missionEncounter==="intrusion"){r.ai.Remove(actor);r.enemies.delete(id);}
    for(const [i,actor] of r.squad.entries())r.PlaceActor(actor,OPENING.shelterPosts[i]);
    r.flow.index=MISSION_STAGES.findIndex(stage=>stage.id==="Support");r.flow.Enter();
    // 2026.09.19 重构之后 03 的入口就在前沿边上：调试跳转落地的那一帧人离 front
    // 锚点 (0,-124) 不到 frontEngageDistanceM，UpdateFront 当场就记下
    // frontBattleStarted 并把主力放出来。这条夹具量的是「人还在后交通壕那一段」，
    // 所以把主力与它的事实退回待命，随后由真实走位重新触发。
    for(const [id,actor] of r.enemies)if(actor.missionEncounter==="front"){r.ai.Remove(actor);r.enemies.delete(id);}
    r.flow.facts.delete("frontBattleStarted");
  });
  // 后交通壕上的两个点，都在 frontEngageDistanceM（26 m）之外：
  // HOLD (-24,-60) 离前沿 68 m，STEP (-8,-78) 离前沿 46 m，两处都在 approach 组的火力里。
  const HOLD={x:-24,z:-60},STEP={x:-8,z:-78};
  await Place(HOLD.x,HOLD.z);await Advance(2);
  const initial=await Receipt("SupportEntry");
  assert.equal(initial.enemies.filter(a=>a.encounter==="approach"&&a.alive).length,MISSION_ENCOUNTERS.approach.length);
  assert.ok(initial.enemies.some(a=>a.encounter==="approach"),"approach cannot silently become an empty encounter");
  // Before making contact, a sheltered delay keeps the squad in the recess too. Sending them
  // ahead alone would test an unassisted assault against the new mobile sections.
  await page.evaluate(async(hold)=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    r.squadMarch?.Dispose();r.squadMarch=null;
    // 这一段量的是遭遇组的账（主力放没放、有没有复活），不是班里人在开阔沟里
    // 硬挨三分钟能不能活。新空间的等候位没有屋顶，不垫血的话随机死一个必要角色
    // 就直接 failed，量到的就成了「运气」。
    g.player.health=1e9;
    for(const a of r.squad){a.health=1e9;a.maxHealth=1e9;}
    for(const [i,a] of r.squad.entries()){
      // 一起停在玩家这一段沟里：把班里人单独放出去，量到的就是「没人配合的强攻」。
      const post={x:hold.x+(i%2?1:-1),z:hold.z+(i<2?-3:2)};
      r.PlaceActor(a,post);r.squadRoutes.set(a.id,[]);a.missionContactPost=null;
      r.Defend(a,post,0,0);
    }
  },HOLD);
  await Place(HOLD.x,HOLD.z);await Advance(180);
  await Place(STEP.x,STEP.z);await Advance(1);
  const delayed=await Receipt("DelayedApproach");
  assert.equal(delayed.failed,false,"the sheltered delay remains playable");
  assert.equal(delayed.started,false,"a slow approach cannot spend the finite main assault");
  assert.equal(delayed.enemies.filter(a=>a.encounter==="front").length,0);
  assert.ok(delayed.enemies.some(a=>a.encounter==="approach"&&a.shots>0),"approach troops participate in real combat");
  // 在后交通壕这一段上找一个真看得见 approach 组的站位。壕沟是压着地面走的，
  // 站在哪一截决定看不看得见对面，所以按路线上的点依次试，而不是钉死一个老坐标。
  let contact=[];
  for(const spot of [HOLD,STEP,{x:-24,z:-40},{x:-24,z:-23}]){
    await Place(spot.x,spot.z);await Advance(2);
    contact=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),eye=g.player.EyePosition;
    const targets=[...r.enemies.values()].filter(a=>a.alive&&a.missionEncounter==="approach"&&!r.BlocksSight(eye,r.Point(a.position,a.stance===2?.35:.95)));
    if(!targets.length)return [];
    const target=r.Point(targets[0].position,.95),p=g.player.position;
    g.player.yaw=Math.atan2(p.x-target.x,p.z-target.z);
    g.player.pitch=Math.atan2(eye.y-target.y,Math.hypot(p.x-target.x,p.z-target.z));
    g.player.SyncCamera(0);g.StepFrames(1,1/60,true);
    return targets.map(a=>a.missionId);
    });
    console.log("VISIBLE_FROM",JSON.stringify({spot,seen:contact.length}));
    if(contact.length)break;
  }
  assert.ok(contact.length,"the approach has visible live enemies from the actual trench route");
  await page.screenshot({path:path.join(out,"Scene_ApproachContact.png")});
  receipts.push({label:"VisibleApproach",enemies:contact});
  await Place(-8,-112);await Advance(1);
  const arrived=await Receipt("LastTrenchBend");
  const front=arrived.enemies.filter(a=>a.encounter==="front");
  assert.ok(arrived.started);
  assert.equal(front.length,MISSION_ENCOUNTERS.front.length);
  assert.ok(front.every(a=>a.alive),"the authored main force is still available when the player arrives");
  await page.evaluate(()=>window.Tengxian.StepFrames(1,1/60,true));
  await page.screenshot({path:path.join(out,"Scene_LastTrenchBend.png")});
  // Kill one through normal damage, leave and re-enter the trigger. The same
  // roster entry must remain dead; proximity is not a casualty replacement loop.
  await page.evaluate(()=>{
    const r=window.Tengxian.Debug.FirstLevelMissionRuntime();
    [...r.enemies.values()].find(a=>a.missionEncounter==="front").TakeHit(1000,"torso",null);
  });
  await Place(-24,-60);await Advance(1);await Place(-8,-112);await Advance(1);
  const returned=await Receipt("ReturnedToFront");
  assert.deepEqual(returned.enemies.filter(a=>a.encounter==="front").map(a=>a.id),front.map(a=>a.id));
  assert.equal(returned.enemies.find(a=>a.id===front[0].id).alive,false,"defeated soldiers never respawn");
  assert.deepEqual(errors,[]);
  console.log("PASS finite approach combat, delayed main assault and no proximity respawns");
}finally{
  await fs.writeFile(path.join(out,"Data_PresenceRegression.json"),JSON.stringify({receipts,errors},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
