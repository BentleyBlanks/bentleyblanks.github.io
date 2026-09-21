// Scoped 01–03 normal-input acceptance. No stage facts or positions are injected.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";
import { MISSION_PLACEMENT as P, MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";

export async function DriveOpening(ctx){
  const {page,output}=ctx,{Route,Interact,WaitStage,CaptureFocus}=CampaignActions(ctx);
  await page.waitForFunction(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().frontShow.bunker.ready,null,{timeout:60000});
  const frames=[],captured=new Set();
  for(let i=0;i<480;i++){
    const state=await page.evaluate(()=>{
      const g=window.Tengxian;g.StepFrames(15,1/60,false);
      const r=g.Debug.FirstLevelMissionRuntime(),m=g.Debug.FirstLevelMission();
      const show=r.frontShow.bunker;
      let graspDistances;
      if(show.phase==="Pull"&&show.Age>.2&&show.Age<1.9){
        const playerBones=show.playerBody.characterRig.bones,luoBones=r.companion.Handle("luo").actor.characterRig.bones;
        graspDistances=["L","R"].map(side=>playerBones["hand"+side].getWorldPosition(g.player.position.clone())
          .distanceTo(luoBones[side==="L"?"handR":"handL"].getWorldPosition(g.player.position.clone())));
      }
      return {stage:m.stage,time:m.time,facts:m.facts,voice:m.voice,...show.State(),graspDistances,alive:g.player.alive};
    });
    frames.push(state);
    assert.equal(state.error,undefined,"animation library loaded");
    assert.ok(state.alive,"player survives the authored opening");
    if(state.graspDistances)assert.ok(state.graspDistances.every(distance=>distance<.03),"rescue hand contact stays attached during the pull");
    if(state.phaseTime>=.35&&!captured.has(state.phase)){
      captured.add(state.phase);await page.evaluate(()=>window.Tengxian.StepFrames(2,1/60,true));
      await page.screenshot({path:path.join(output,`Scene_Opening_${state.phase}.png`)});
      console.log("STORYBOARD",state.phase,state.time);
    }
    if(state.phase==="Released")break;
  }
  await fs.writeFile(path.join(output,"Data_OpeningStoryboards.json"),JSON.stringify(frames,null,2));
  const final=frames.at(-1);
  assert.equal(final.phase,"Released","interrogation, ambush, pull and kick complete");
  for(const phase of ["Orders","Blast","Advance","Captive","CaptiveShot","Discover","Drag","Butt","Black","Interrogate","Creep","Ambush","Deflect","Pull","Kick"])
    assert.ok(final.beats.includes(phase),`storyboard performed: ${phase}`);
  for(const fact of ["bunkerCollapsed","captivesKilled","playerButtStruck","doorSearchStarted","rescueCallHeard","luoRescueComplete"])
    assert.ok(final.facts.includes(fact),`observed event: ${fact}`);
  assert.equal(final.captives.length,1);assert.ok(final.captives.every(a=>!a.alive));
  const guard=await page.evaluate(()=>{const r=window.Tengxian.Debug.FirstLevelMissionRuntime();return {
    down:!r.enemies.get("BunkerExecutionerB").alive,guideAlive:r.frontShow.bunker.cast.BunkerInterpreter.alive,
    heFired:r.companion.Handle("heyoutian").lastFire>0,deflectedImpact:r.frontShow.bunker.deflectedImpact,
    rifles:r.frontShow.bunker.rifleProps.length,control:r.controls?.kind||null};});
  await fs.writeFile(path.join(output,"Data_RescuePhysicalEvents.json"),JSON.stringify(guard,null,2));
  assert.ok(guard.down,"the ambushed guard falls");assert.ok(guard.guideAlive,"the interpreter can escape");
  assert.ok(guard.heFired,"He Youtian actually fires covering shots");
  assert.ok(guard.deflectedImpact?.hit,"the deflected shot strikes the real trench wall");
  assert.equal(guard.rifles,1,"the ambushed guard releases his rifle");
  assert.equal(guard.control,null,"movement returns before rifle pickup");
  await Route([{x:P.bunker.rifle.x,z:P.bunker.rifle.z+.6}],"OpeningRifle",{stance:"crouch"});
  await Interact();
  await WaitStage("RearTrench",5);
  const armed=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  assert.ok(armed.facts.includes("rifleRecovered"));assert.equal(armed.emptyHands,false);
  await Route(MISSION_STAGE_ROUTES.rearTrench.slice(0,5),"OpeningRearTrench",{fight:true,stance:"crouch"});
  await CaptureFocus("OpeningCollection",A.collection);
  await WaitStage("Support",120,{fight:true,cover:true});
  const rear=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  for(const fact of ["rearTrenchEntered","cornerReached","collectionPointSeen","supportOrdersHeard"])assert.ok(rear.facts.includes(fact),fact);
  for(const cue of ["TrenchCurse","CornerCheck","SupportOrder"])assert.ok(rear.voice.played.includes(cue),cue);
  assert.ok(rear.front.collection.litters>=4&&rear.front.collection.people>=8,"casualty collection is present");
  await Route([...MISSION_STAGE_ROUTES.rearTrench.slice(5),...Routes.support.slice(-1)],"OpeningSupportApproach",
    {fight:true,crawl:true,stance:"crouch",rejoinRoute:[...MISSION_STAGE_ROUTES.rearTrench,...Routes.support.slice(-1)]});
  await Route([{x:5,z:-123},{x:0,z:-123},{x:0,z:-127.4}],"OpeningFiringStep",{stance:"stand"});
  await page.evaluate(()=>{window.MissionInputDriver.priorityTarget="FrontGunner";});
  const support=await WaitStage("MachineGun",120,{fight:true});
  await page.evaluate(()=>{window.MissionInputDriver.priorityTarget=null;});
  await page.evaluate(()=>window.Tengxian.StepFrames(2,1/60,true));
  await page.screenshot({path:path.join(output,"Scene_Opening_DefendersSafe.png")});
  for(const fact of ["frontRifleDefense","rifleWithdrawalResolved"])assert.ok(support.mission.facts.includes(fact),fact);
  const survivors=support.mission.guards.slice(0,2).filter(a=>a.alive);
  assert.ok(survivors.length>0&&survivors.every(a=>a.safe),"every surviving first-wave defender physically reaches safety");
  assert.deepEqual(ctx.errors,[]);
  console.log("ok 01–03 normal progression, F pickup, direct-fire suppression and actual withdrawal");
}
