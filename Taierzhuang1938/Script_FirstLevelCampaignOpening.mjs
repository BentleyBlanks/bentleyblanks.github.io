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
      const g=window.Tengxian;
      const probe=window.openingMotionProbe??={previous:{},maxStep:0,maxTurn:0,maxCameraStep:0,minShoulderBehind:Infinity,violations:[],jointTravel:{}};
      for(let frame=0;frame<15;frame++){
        g.StepFrames(1,1/60,false);
        const r=g.Debug.FirstLevelMissionRuntime(),s=r.frontShow.bunker,cam=g.player.camera,Vec=()=>g.player.position.clone();
        for(const a of [...Object.values(s.cast),...r.squad,...r.enemies.values()]){
          if(!a.openingStoryboardLast||a.openingStoryboardHidden||!a.alive)continue;
          const id=a.missionId||a.castId||a.id,previous=probe.previous[id],root=a.actor.root;
          const foot=a.actor.characterRig?.bones.footL.getWorldPosition(Vec());
          if(previous){
            const step=Math.hypot(root.position.x-previous.x,root.position.z-previous.z);
            const turn=Math.abs(Math.atan2(Math.sin(a.yaw-previous.yaw),Math.cos(a.yaw-previous.yaw)));
            probe.maxStep=Math.max(probe.maxStep,step);probe.maxTurn=Math.max(probe.maxTurn,turn);
            if(step>.12&&probe.violations.length<20)probe.violations.push({id,phase:s.phase,step});
            if(foot&&a.openingStoryboardTravel>.2){const local=foot.clone().sub(root.position);probe.jointTravel[id]=(probe.jointTravel[id]||0)+local.distanceTo(Vec().fromArray(previous.foot));}
          }
          probe.previous[id]={x:root.position.x,z:root.position.z,yaw:a.yaw,foot:foot?.sub(root.position).toArray()};
        }
        if(s.CameraActive&&s.playerBody){
          if(probe.camera)probe.maxCameraStep=Math.max(probe.maxCameraStep,cam.position.distanceTo(Vec().fromArray(probe.camera)));
          probe.camera=cam.position.toArray();
          for(const side of ['L','R']){
            const shoulder=s.playerBody.characterRig.bones['upperArm'+side].getWorldPosition(Vec());cam.worldToLocal(shoulder);
            probe.minShoulderBehind=Math.min(probe.minShoulderBehind,shoulder.z);
          }
        }
        if(s.phase==='Ambush'&&s.Age<.5&&!s.Executioner(1).alive)probe.violations.push({phase:s.phase,error:'guard fell before contact'});
        if(s.phase==='Black'&&r.opening.eyeClosure>.1)probe.violations.push({phase:s.phase,error:'strike obscured by black screen'});
        if(s.phase==='Drag'&&s.Age>.8){
          const hand=s.playerBody.characterRig.bones.handL.getWorldPosition(Vec());
          const gap=hand.distanceTo(s.Executioner(0).actor.characterRig.bones.handL.getWorldPosition(Vec()));
          if(gap>.03&&probe.violations.length<20)probe.violations.push({phase:s.phase,error:'drag hands separated',gap});
        }
      }
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
    if(state.graspDistances&&!state.graspDistances.every(distance=>distance<.03)){
      await fs.writeFile(path.join(output,"Data_GraspFailure.json"),JSON.stringify(await page.evaluate(()=>{
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),s=r.frontShow.bunker,Vec=()=>g.player.position.clone();
        const Bones=actor=>Object.fromEntries(["upperArmL","upperArmR","forearmL","forearmR","handL","handR"].map(key=>[key,actor.characterRig.bones[key].getWorldPosition(Vec()).toArray()]));
        return {phase:s.phase,age:s.Age,player:Bones(s.playerBody),luo:Bones(r.companion.Handle("luo").actor),camera:g.player.camera.position.toArray()};
      }),null,2));
      assert.fail(`rescue hand contact at ${state.phaseTime}: ${state.graspDistances}`);
    }
    if(state.phaseTime>=.35&&!captured.has(state.phase)){
      captured.add(state.phase);await page.evaluate(()=>window.Tengxian.StepFrames(2,1/60,true));
      await page.screenshot({path:path.join(output,`Scene_Opening_${state.phase}.png`)});
      console.log("STORYBOARD",state.phase,state.time);
    }
    if(state.phase==="Released")break;
  }
  await fs.writeFile(path.join(output,"Data_OpeningStoryboards.json"),JSON.stringify(frames,null,2));
  const motion=await page.evaluate(()=>window.openingMotionProbe);
  await fs.writeFile(path.join(output,"Data_OpeningMotionContinuity.json"),JSON.stringify(motion,null,2));
  assert.deepEqual(motion.violations,[],"actors move continuously and impacts precede falls");
  assert.ok(motion.minShoulderBehind>.08,"both open sleeve roots remain behind the eye throughout the opening");
  assert.ok(motion.maxCameraStep<.14,"camera transitions do not teleport between storyboard views");
  const final=frames.at(-1);
  assert.equal(final.phase,"Released","interrogation, ambush, pull and kick complete");
  for(const phase of ["Orders","Blast","Advance","Captive","CaptiveShot","Discover","Drag","Butt","Black","Interrogate","Creep","Ambush","Deflect","Pull","Kick"])
    assert.ok(final.beats.includes(phase),`storyboard performed: ${phase}`);
  for(const fact of ["bunkerCollapsed","captivesKilled","playerButtStruck","doorSearchStarted","rescueCallHeard","luoRescueComplete"])
    assert.ok(final.facts.includes(fact),`observed event: ${fact}`);
  assert.equal(final.captives.length,1);assert.ok(final.captives.every(a=>!a.alive));
  const guard=await page.evaluate(()=>{const r=window.Tengxian.Debug.FirstLevelMissionRuntime();return {
    down:!r.enemies.get("BunkerExecutionerB").alive,deathClip:r.enemies.get("BunkerExecutionerB").actor.characterRig.deathClipState?.clip.name,
    guideAlive:r.frontShow.bunker.cast.BunkerInterpreter.alive,
    heFired:r.companion.Handle("heyoutian").lastFire>0,deflectedImpact:r.frontShow.bunker.deflectedImpact,
    rifles:r.frontShow.bunker.rifleProps.length,control:r.controls?.kind||null};});
  await fs.writeFile(path.join(output,"Data_RescuePhysicalEvents.json"),JSON.stringify(guard,null,2));
  assert.ok(guard.down,"the ambushed guard falls");assert.ok(guard.guideAlive,"the interpreter can escape");
  assert.match(guard.deathClip,/DeathCollapse[A-D]/,"the contacted guard uses the existing Kimodo collapse library");
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
