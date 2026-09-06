// Archived P0–P2 regression fixture; current campaign acceptance is Script_FirstLevelMissionBrowserTest.mjs.
// Real pause-menu action, full sequential debug chain and playable handoffs.
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.join(root,"Taierzhuang1938/_shots/P012NextProgress");
await fs.mkdir(out,{recursive:true});
const server=process.env.P012_DEBUG_PREVIEW_URL?null:await ServeRoot(root,0);
const base=process.env.P012_DEBUG_PREVIEW_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto(`${base}/Taierzhuang1938/?whitebox=p012-archive&manual=1&quality=medium&scale=small`,{timeout:120000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:240000});
  await page.locator("#bootStart").click();
  await page.evaluate(()=>{const g=window.Tengxian;g.StepFrames(1);g.Debug.Pause();g.Debug.MenuAct("debug");});
  const button=page.locator('[data-action="p012NextProgress"] button');
  assert.equal(await button.isEnabled(),true);
  await page.screenshot({path:path.join(out,"Scene_DebugOptions.png")});
  const initial=await page.evaluate(()=>window.Tengxian.ai.soldiers.filter(s=>s.castId).map(s=>[s.castId,s.id]));
  const trace=[];
  for(let next=1;next<=25;next++) {
    await button.click();
    const sample=await page.evaluate(()=>{
      const g=window.Tengxian,flow=g.Debug.P012(),mem=g.setpieces.mem;
      return {flow,scene:g.Debug.P012Scene(),player:g.player.position.toArray(),
        playerAlive:g.player.Alive,running:g.state.running,ammo:g.state.ammo,clips:g.state.clips,
        weapon:g.state.slots.primary,grenades:g.state.grenades,carry:g.carry.KindId,
        cast:g.ai.soldiers.filter(s=>s.castId).map(s=>[s.castId,s.id]),
        error:document.querySelector('[data-action="p012NextProgress"] small')?.textContent,
        escort:mem.column?.members.map(m=>({id:m.handle.id,alive:m.handle.alive,role:m.role,at:m.handle.position.toArray()})),
        litters:mem.column?.litters.map(l=>({prop:l.propLitter,body:l.propBody,front:l.front.handle.id,rear:l.rear.handle.id,dropped:l.dropped})),
        dragged:mem.p012WoundedDrag?.delivered,obstacle:mem.p012AirObstacle,
        recovered:mem.p012LitterRecovered,airDone:mem.p012AirPassComplete,
        strafe:g.strafe?.View?.(),setpieceErrors:g.setpieces.log.filter(e=>e.ok===false),
        notes:mem.p012RecoveryReason};
    });
    trace.push(sample);
    console.log(`jump ${next}: ${sample.flow.beat} ${sample.error||""}`);
    await fs.writeFile(path.join(out,"Data_DebugProgress.json"),JSON.stringify(trace,null,2));
    assert.equal(sample.flow.beatIndex,next,sample.error);
    assert.equal(sample.running,false,"menu jump must preserve pause");
    assert.equal(sample.playerAlive,true);
    assert.deepEqual(sample.cast,initial,"named NPC identities survive the jump");
    assert.equal(sample.setpieceErrors.length,0,JSON.stringify(sample.setpieceErrors));
    if(next===2){assert.ok(sample.weapon);assert.ok(sample.clips>0);assert.equal(sample.ammo,0);assert.equal(sample.grenades,0);}
    if(next===12)assert.equal(sample.dragged,true);
    if(next===2){
      const reload=await page.evaluate(()=>{const g=window.Tengxian;g.Debug.MenuAct("resume");
        g.Debug.Key("KeyR",true);g.Debug.Key("KeyR",false);g.StepFrames(240,1/60,false);
        for(let i=0;i<900&&g.state.cutscene;i++)g.StepFrames(1,1/60,false);
        g.Debug.Pause();g.Debug.MenuAct("debug");return {ammo:g.state.ammo,beat:g.Debug.P012().beatIndex};});
      assert.ok(reload.ammo>0,"normal R reload works after skipping issue");assert.equal(reload.beat,2);
    }
    if(next===5){
      const pickup=await page.evaluate(()=>{const g=window.Tengxian;g.Debug.MenuAct("resume");
        g.Debug.Key("KeyF",true);g.StepFrames(60,1/60,false);g.Debug.Key("KeyF",false);
        g.Debug.Pause();g.Debug.MenuAct("debug");return g.carry.KindId;});
      assert.equal(pickup,"ammoCrate","normal F can start carrying after a jump");
    }
    if(next===12){
      const guide=await page.evaluate(()=>{const g=window.Tengxian,before=g.Debug.P012Scene().guidePosition;
        g.Debug.MenuAct("resume");g.StepFrames(120,1/60,false);g.Debug.Pause();g.Debug.MenuAct("debug");
        return {before,after:g.Debug.P012Scene().guidePosition};});
      assert.ok(Math.hypot(guide.before.x-guide.after.x,guide.before.z-guide.after.z)<.5,"Luo stays at volunteer handoff instead of walking back to the old casualty");
    }
    if(next===14)await page.evaluate(()=>{const g=window.Tengxian;
      g.ai.soldiers.find(s=>s.alive&&s.side==="ija").Kill();});

    if(next===13)assert.equal(sample.escort.length,10);
    if(next===18){assert.equal(sample.obstacle.resolved,true);assert.ok(sample.escort.some(m=>!m.alive));}
    if(next===19)assert.equal(sample.carry,"stretcher");
    if(next===20){assert.equal(sample.airDone,true);assert.equal(sample.recovered,true);}
    if(next>=20)assert.equal(sample.litters[0].prop,trace[12].litters[0].prop,"same original litter");
    if(next===24){
      const regrip=await page.evaluate(()=>{const g=window.Tengxian;g.Debug.MenuAct("resume");
        g.StepFrames(420,1/60,false);const registered=!!g.interact.Point("ch1_regrip");
        g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);g.StepFrames(1,1/60,false);
        g.Debug.Pause();g.Debug.MenuAct("debug");return {registered,carry:g.carry.KindId,signal:g.story.Signalled("P012Regripped")};});
      assert.equal(regrip.registered,true);assert.equal(regrip.carry,"stretcher");assert.equal(regrip.signal,true);
    }
    if([2,5,11,13,15,17,18,19,20,22,24].includes(next)) {
      // A live frame must keep its next objective usable and actor budgets stable.
      const live=await page.evaluate(()=>{const g=window.Tengxian,before=g.Debug.P012().spawnedTotal;
        g.Debug.MenuAct("resume");g.StepFrames(2,1/60,false);g.Debug.Pause();g.Debug.MenuAct("debug");
        return {beat:g.Debug.P012().beatIndex,before,after:g.Debug.P012().spawnedTotal,alive:g.player.Alive};});
      assert.equal(live.beat,next,JSON.stringify(live));assert.equal(live.alive,true);
      assert.equal(live.after,live.before,"resuming does not duplicate the active wave");
    }
  }
  assert.equal(await page.evaluate(()=>window.Tengxian.Debug.P012NextProgress()),false);
  assert.equal(await page.evaluate(()=>window.Tengxian.Debug.P012().complete),true);
  assert.deepEqual(errors,[]);
  console.log("ok  25 menu jumps, live handoffs, inventory, NPCs, casualties, finite waves and terminal guard");
  await fs.writeFile(path.join(out,"Data_DebugProgress.json"),JSON.stringify(trace,null,2));
} finally { await browser.close();if(server)await new Promise(resolve=>server.close(resolve)); }
