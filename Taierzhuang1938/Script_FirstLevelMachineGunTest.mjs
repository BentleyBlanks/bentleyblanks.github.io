// Diagnostic Support -> MachineGun regression; setup is not normal campaign evidence.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
import {MISSION_ENCOUNTERS} from "./Data_FirstLevelMission.mjs";
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,"_shots/MachineGunRegression");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0);
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],receipts=[];
page.on("pageerror",error=>errors.push(String(error)));
async function Advance(seconds){for(let t=0;t<seconds;t+=1)await page.evaluate(()=>window.Tengxian.StepFrames(60,1/60,false));}
async function Receipt(label){
 const state=await page.evaluate(()=>{
  const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
  return {time:r.time,failed:r.failed,stage:r.flow.stage.id,health:g.player.health,
   soldiers:g.ai.soldiers.map(a=>({id:a.id,missionId:a.missionId,side:a.side,encounter:a.missionEncounter,alive:a.alive,shots:a.fireSequence,position:a.position.toArray(),mode:a.missionAssault?.mode,stance:a.stance})),
   guards:r.guards.map(e=>({id:e.actor.id,progress:e.progress,safe:e.safe,alive:e.actor.alive}))};
 });receipts.push({label,...state});console.log(label,JSON.stringify({time:state.time,failed:state.failed,stage:state.stage,alive:state.soldiers.filter(a=>a.alive&&a.side==="ija").length}));return state;
}
try{
 await page.goto(process.env.MISSION_TEST_URL||`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,{timeout:180000});
 await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
 await page.evaluate(async()=>{
  const g=window.Tengxian;await g.Debug.FirstLevelJump(3);
  const r=g.Debug.FirstLevelMissionRuntime(),{MISSION_STAGES}=await import("./Data_FirstLevelMission.mjs"),{OPENING}=await import("./Data_FirstLevelOpening.mjs");
  for(const [id,a] of r.enemies)if(a.missionEncounter==="intrusion"){r.ai.Remove(a);r.enemies.delete(id);}
  r.flow.index=MISSION_STAGES.findIndex(s=>s.id==="Support");r.flow.Enter();
  r.Record("frontBattleStarted");r.SpawnEncounter("front");for(let i=0;i<100&&r.spawnQueue.length;i++)r.DrainSpawns();
  if(r.spawnQueue.length)throw new Error(`spawn capacity exhausted: ${g.ai.aliveCount}/${g.ai.maxAlive}, queued ${r.spawnQueue.length}`);
  for(const a of r.enemies.values())if(["front","approach","tank"].includes(a.missionEncounter))a.TakeHit(1000,"torso",null);
  // Finish the actual gunner's wound transfer; a bare stage-id edit otherwise
  // leaves Zhou physically occupying the weapon (an impossible normal handover).
  r.opening.zhou.TakeHit(50,"torso",null);r.PlaceActor(r.opening.zhou,OPENING.zhouRest);r.opening.UpdateZhou();
  for(const [i,a] of r.squad.entries()){r.PlaceActor(a,OPENING.frontPosts[i]);r.squadRoutes.set(a.id,[]);}
  const p=r.Point({x:0,z:-127.4});g.player.position.copy(p);g.player.body.Teleport(p.x,p.y,p.z);g.player.yaw=0;g.player.pitch=0;g.player.stance="crouch";g.player.SyncCamera(0);
 });
 const before=await Receipt("RifleForceExhausted");
 assert.ok(!before.soldiers.some(a=>a.encounter==="machineGun"),"rifle stage cannot spend the machine-gun attack early");
 await page.evaluate(async()=>{const r=window.Tengxian.Debug.FirstLevelMissionRuntime(),{MISSION_STAGES}=await import("./Data_FirstLevelMission.mjs");r.flow.index=MISSION_STAGES.findIndex(s=>s.id==="MachineGun");r.flow.Enter();});
 await Advance(1);const handover=await Receipt("MachineGunHandover");
 const initial=handover.soldiers.filter(a=>a.encounter==="machineGun");
 assert.equal(initial.filter(a=>a.alive).length,MISSION_ENCOUNTERS.machineGun?.length||12,"machine-gun attack survives complete exhaustion of rifle-stage enemies");
 await Advance(16);const combat=await Receipt("MachineGunCombat");
 const attackers=combat.soldiers.filter(a=>a.encounter==="machineGun");
 assert.ok(!combat.failed,"the handover remains playable");
 assert.ok(attackers.some(a=>a.alive&&Math.hypot(a.position[0]-initial.find(b=>b.id===a.id).position[0],a.position[2]-initial.find(b=>b.id===a.id).position[2])>2),"distant infantry advances in the live AI");
 assert.ok(attackers.some(a=>a.shots>0),"attackers fire actual rounds");
 assert.ok(combat.soldiers.some(a=>a.side==="nra"&&a.shots>(handover.soldiers.find(b=>b.id===a.id)?.shots||0)),"friendly NPCs return fire");
 await page.evaluate(()=>{const r=window.Tengxian.Debug.FirstLevelMissionRuntime();r.frontDefenders.find(a=>a.alive).TakeHit(1000,"torso",null);});
 await Advance(1);const casualty=await Receipt("FrontGuardCasualty");
 assert.ok(!casualty.failed && casualty.time>combat.time,"an ordinary front-line casualty never silently freezes the entire battle");

 await page.evaluate(()=>{const g=window.Tengxian;g.Debug.Key("KeyF",true);g.StepFrames(45,1/60,false);g.Debug.Key("KeyF",false);g.Debug.Mouse(0,true);});
 await Advance(2);await page.evaluate(()=>window.Tengxian.Debug.Mouse(0,false));
 const firing=await page.evaluate(()=>{const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();return {mounted:g.emplacement.Mounted,shots:g.emplacement.stats.shots,used:r.Has("gunUsed")};});
 assert.ok(firing.shots>0&&firing.used,"real use input mounts and fires the gun: "+JSON.stringify(firing));
 let visible;
 // Cover is allowed to conceal a kneeling man. Observe a full bound/peek cycle,
 // requiring a real exposed target in the gun arc rather than a permanently visible crowd.
 for(let sample=0;sample<10;sample++){
  visible=await page.evaluate(()=>{
   const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),eye=g.player.EyePosition;
   const targets=[...r.enemies.values()].filter(a=>a.alive&&a.missionEncounter==="machineGun")
    .map(a=>({a,p:a.position.clone().add({x:0,y:g.ai.constructor.StanceEye(a.stance,a),z:0})}))
    .filter(({p})=>Math.abs(Math.atan2(eye.x-p.x,eye.z-p.z))<Math.PI/6&&!r.BlocksSight(eye,p));
   if(targets.length){const p=targets[0].p;g.player.yaw=Math.atan2(eye.x-p.x,eye.z-p.z);g.player.pitch=Math.atan2(eye.y-p.y,Math.hypot(eye.x-p.x,eye.z-p.z));g.player.SyncCamera(0);g.StepFrames(1,1/60,true);}
   return {ids:targets.map(({a})=>a.missionId),time:r.time,eye:eye.toArray()};
  });
  if(visible.ids.length)break;
  await Advance(1);
 }
 assert.ok(visible.ids.length,"a live attacker exposes himself inside the mounted gun's firing arc during a bound: "+JSON.stringify(visible));
 receipts.push({label:"VisibleFromGun",...visible,shots:firing.shots});
 await page.screenshot({path:path.join(out,"Scene_MachineGunAttack.png")});
 // Once suppressed/defeated, withdrawal must actually move, including a checkpoint retry.
 await page.evaluate(()=>{const r=window.Tengxian.Debug.FirstLevelMissionRuntime();for(const a of r.enemies.values())if(a.missionEncounter==="machineGun"&&a.alive)a.TakeHit(1000,"torso",null);r.ContinueCheckpoint();r.SpawnEncounter("machineGun");});
 await Advance(8);const retried=await Receipt("MachineGunRetry");
 assert.equal(retried.soldiers.filter(a=>a.encounter==="machineGun").length,attackers.length,"retry never duplicates the committed roster");
 assert.ok(retried.soldiers.filter(a=>a.encounter==="machineGun").every(a=>!a.alive),"casualties stay dead");
 assert.ok(retried.guards.some(a=>a.progress>combat.guards.find(b=>b.id===a.id).progress),"guards physically withdraw after the gun opens fire");
 assert.deepEqual(errors,[]);console.log("PASS finite machine-gun handover, moving and shooting NPCs, withdrawal and retry");
}finally{await fs.writeFile(path.join(out,"Data_MachineGunRegression.json"),JSON.stringify({receipts,errors},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
