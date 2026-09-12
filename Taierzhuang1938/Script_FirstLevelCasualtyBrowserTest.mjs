// Controlled production-damage regression, not a normal campaign completion.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,"_shots","FirstLevelCasualties");
await fs.mkdir(out,{recursive:true});
const server=await ServeRoot(path.dirname(here),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&menu=0&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
  await page.locator("#bootStart").click();
  await page.evaluate(()=>window.Tengxian.StepFrames(1,1/60,true));
  const result=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    const candidates=r.train.entries.map(e=>e.actor).filter(a=>!a.castId&&a!==r.trainWounded);
    const ordinary=candidates.sort((a,b)=>a.position.distanceTo(g.player.position)-b.position.distanceTo(g.player.position))[0];
    const witness=candidates.find(a=>a!==ordinary&&a.squadId===ordinary.squadId);
    if(!witness)throw new Error("ordinary squad fixture requires two real train actors");
    // Controlled positions provide an unobstructed witness, using real actors.
    r.PlaceActor(ordinary,{x:-69,z:95});r.PlaceActor(witness,{x:-69,z:97});
    g.player.position.set(-69,r.battlefield.GroundHeight(-69,94),94);
    r.squad.push(ordinary);
    const before=g.ai.CountSide("nra"),pool=g.state.nraPool,health=g.player.health,stage=r.flow.stage.id;
    const current=r.voice.current;r.voice.current=null;
    ordinary.TakeHit(1000,"torso");
    const subtitle=r.hud.el.subtitle.textContent;
    r.voice.current=current;
    r.opening.Update(0);
    return {id:ordinary.id,alive:ordinary.alive,essential:!!ordinary.scriptEssential,
      before,after:g.ai.CountSide("nra"),poolBefore:pool,poolAfter:g.state.nraPool,
      stageBefore:stage,stageAfter:r.flow.stage.id,failed:r.failed,playerHealth:g.player.health,health,
      receipts:r.State().ordinaryCasualties.filter(e=>e.actorId===ordinary.id),subtitle,
      witnessAlive:witness.alive};
  });
  assert.equal(result.alive,false);assert.equal(result.essential,false);
  assert.equal(result.after,result.before-1,"actual ordinary firepower is lost");
  assert.equal(result.poolAfter,result.poolBefore-1,"the original death callback still deducts exactly once");
  assert.equal(result.failed,false);assert.equal(result.playerHealth,result.health);
  assert.equal(result.stageAfter,result.stageBefore);
  assert.equal(result.receipts.length,1);assert.equal(result.witnessAlive,true);
  assert.match(result.subtitle,/有弟兄倒下了/);
  await page.screenshot({path:path.join(out,"Scene_OrdinaryCasualty.png")});
  await fs.writeFile(path.join(out,"Data_OrdinaryCasualty.json"),JSON.stringify(result,null,2));
  const story=await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),pool=g.state.nraPool;
    r.opening.SpawnZhou();
    const actors=[...r.squad.filter(a=>a.castId),r.opening.zhou];
    const rows=actors.map(actor=>{
      for(const [part,kind] of [["head","bullet"],["torso","blast"],["torso","thrust"],["head","bullet"]])
        actor.TakeHit(1000,part,null,{kind});
      return {id:actor.castId,alive:actor.alive,health:actor.health,essential:actor.scriptEssential,
        suppression:actor.suppression,damageSequence:actor.damageSequence};
    });
    r.opening.Update(0);
    return {rows,failed:r.failed,poolBefore:pool,poolAfter:g.state.nraPool};
  });
  assert.deepEqual(story.rows.map(a=>a.id).sort(),["heyoutian","liuwencai","luo","yaowa","zhou"]);
  assert.ok(story.rows.every(a=>a.alive&&a.health===1&&a.essential&&a.suppression>0&&a.damageSequence>=4),
    "all opening story actors survive repeated lethal combat while retaining hit reactions");
  assert.equal(story.failed,false);assert.equal(story.poolAfter,story.poolBefore);
  await fs.writeFile(path.join(out,"Data_StorySurvival.json"),JSON.stringify(story,null,2));
  assert.deepEqual(errors,[]);
  console.log("ok production ordinary damage, squad membership, casualty feedback and preserved death accounting",JSON.stringify(result));
  console.log("ok opening story survival with real damage",JSON.stringify(story));
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
