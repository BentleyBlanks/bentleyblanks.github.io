// Targeted real-Rapier regression for the wounded gunner's exit. This is a
// physical fixture, not normal-campaign acceptance evidence.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(here,"../tmp/L1FrontRuns/ZhouExitProbe");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.resolve(here,".."),0);
const browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];
page.on("pageerror",error=>errors.push(String(error)));

try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low&scale=small`,
    {waitUntil:"domcontentloaded",timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
  const results=await page.evaluate(async()=>{
    const g=window.Tengxian;
    await g.Debug.FirstLevelJump(3);
    const r=g.Debug.FirstLevelMissionRuntime();
    for(const actor of [...g.ai.soldiers])g.ai.Remove(actor);
    r.enemies.clear();r.spawnQueue=[];
    // Keep the real AI/physics frame, but isolate this short probe from stage
    // progression, combat spawns and dialogue.
    r.Update=function(dt){this.delta=dt;this.time+=dt;this.opening.UpdateZhou();};
    const starts=[
      {id:"west-failure",x:-3.0401633947848508,z:-123.90232699904317},
      {id:"east",x:0,z:-123.9},
      {id:"north",x:-2,z:-125.2},
    ];
    const rows=[];
    for(const start of starts){
      r.flow.facts.delete("zhouGunWounded");
      const actor=g.ai.Spawn("nra",start.x,start.z,{weapon:"Zb26",scriptedNoncombatant:true,
        squadId:`ZhouExit${start.id}`});
      if(!actor)throw new Error(`cannot spawn Zhou exit fixture ${start.id}`);
      actor.missionId=`ZhouExit${start.id}`;actor.castId="zhou";actor.scriptEssential=true;
      r.PlaceActor(actor,start);actor.health=1;actor.lastFire=1;
      r.opening.zhou=actor;r.opening.zhouExitRoute=null;
      r.emplacement.NpcOccupy(r.gunId,actor);
      const trace=[];
      for(let batch=0;batch<80&&!r.Has("zhouGunWounded");batch++){
        g.StepFrames(15,1/60,false);
        if(batch%4===0)trace.push({time:r.time,x:actor.position.x,y:actor.position.y,z:actor.position.z,
          goal:{x:actor.goal.x,z:actor.goal.z},route:r.opening.zhouExitRoute?.map(point=>({...point})),
          stance:actor.stance,health:actor.health,
          body:actor.body?{radius:actor.body.radius,height:actor.body.height}:null});
      }
      rows.push({id:start.id,start,finished:r.Has("zhouGunWounded"),final:{x:actor.position.x,y:actor.position.y,z:actor.position.z},
        capsule:trace.find(sample=>sample.body)?.body||null,trace});
      if(actor.alive!==false&&g.ai.soldiers.includes(actor))g.ai.Remove(actor);
    }
    return rows;
  });
  for(const row of results){
    assert.deepEqual(row.capsule,{radius:.34,height:1.21},`${row.id} uses the production crouched capsule`);
    assert.ok(row.finished,`${row.id} reaches the real rest point through Rapier: ${JSON.stringify(row)}`);
    assert.ok(Math.hypot(row.final.x-2.1,row.final.z+124.6)<=.65,
      `${row.id} completes inside the authored 0.65 m gate: ${JSON.stringify(row.final)}`);
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,"Data_ZhouExitProbe.json"),JSON.stringify({
    kind:"controlled-physics-fixture",
    normalCampaignEvidence:false,
    results,
    errors
  },null,2));
  console.log("ok wounded Zhou clears the supply crate from west/east/north with the real 0.34 m Rapier capsule");
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
