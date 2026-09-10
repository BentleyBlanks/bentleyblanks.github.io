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
    return {time:r.time,failed:r.failed,stage:r.flow.stage.id,started:r.Has("frontBattleStarted"),
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
  });
  await Place(-32,-20);await Advance(2);
  const initial=await Receipt("SupportEntry");
  assert.equal(initial.enemies.filter(a=>a.encounter==="approach"&&a.alive).length,MISSION_ENCOUNTERS.approach.length);
  assert.ok(initial.enemies.some(a=>a.encounter==="approach"),"approach cannot silently become an empty encounter");
  await Place(-24,-40);await Advance(2);
  const contact=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),eye=g.player.EyePosition;
    const targets=[...r.enemies.values()].filter(a=>a.alive&&a.missionEncounter==="approach"&&!r.BlocksSight(eye,r.Point(a.position,a.stance===2?.35:.95)));
    if(!targets.length)return [];
    const target=r.Point(targets[0].position,.95),p=g.player.position;
    g.player.yaw=Math.atan2(p.x-target.x,p.z-target.z);
    g.player.pitch=Math.atan2(eye.y-target.y,Math.hypot(p.x-target.x,p.z-target.z));
    g.player.SyncCamera(0);g.StepFrames(1,1/60,true);
    return targets.map(a=>a.missionId);
  });
  assert.ok(contact.length,"the approach has visible live enemies from the actual trench route");
  await page.screenshot({path:path.join(out,"Scene_ApproachContact.png")});
  receipts.push({label:"VisibleApproach",enemies:contact});
  await Place(-32,-20);await Advance(180);
  await Place(-24,-60);await Advance(1);
  const delayed=await Receipt("DelayedApproach");
  assert.equal(delayed.failed,false,"the sheltered delay remains playable");
  assert.equal(delayed.started,false,"a slow approach cannot spend the finite main assault");
  assert.equal(delayed.enemies.filter(a=>a.encounter==="front").length,0);
  assert.ok(delayed.enemies.some(a=>a.encounter==="approach"&&a.shots>0),"approach troops participate in real combat");
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
