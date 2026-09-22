// Scoped 01–03 normal-input acceptance. No stage facts or positions are injected.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";
import { MISSION_PLACEMENT as P, MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
import { MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { OPENING_STORYBOARDS as Storyboards } from "./Data_OpeningStoryboards.mjs";

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
        probe.births??={};
        for(const actor of r.enemies.values())if(!probe.births[actor.missionId])probe.births[actor.missionId]={
          entity:actor.id,phase:s.phase,stage:r.flow.stage.id,time:r.time,
          distance:Math.hypot(actor.position.x-r.player.position.x,actor.position.z-r.player.position.z)};
        if(["Pull","Kick","Released"].includes(s.phase)&&!s.VanguardCleared()&&probe.violations.length<20)
          probe.violations.push({phase:s.phase,error:"rescue proceeded while vanguard alive"});
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
      return {stage:m.stage,time:m.time,facts:m.facts,voice:m.voice,...show.State(),graspDistances,alive:g.player.alive,
        combat:[...r.squad,...r.enemies.values()].filter(a=>a.castId||a.missionEncounter==="bunkerAssault")
          .map(a=>({id:a.castId||a.missionId,alive:a.alive,health:a.health,x:a.position.x,z:a.position.z,
            weapon:a.weapon?.id,shots:a.lastFire,target:a.target?.isPlayer?"player":a.target?.ref?.missionId||a.target?.ref?.castId,visible:a.targetVisible,suppression:a.suppression}))};
    });
    frames.push(state);
    if(state.phase==="Cover"&&i%20===0)console.log("COUNTERATTACK",state.time,JSON.stringify(state.combat));
    if(!state.alive)await fs.writeFile(path.join(output,"Data_OpeningCombatFailure.json"),JSON.stringify({
      state,damage:await page.evaluate(()=>window.missionDamage),motion:await page.evaluate(()=>window.openingMotionProbe)},null,2));
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
    vanguard:[...r.enemies.values()].filter(a=>a.missionEncounter==="bunkerAssault").map(a=>({id:a.missionId,alive:a.alive,health:a.health,essential:a.scriptEssential})),
    playerShots:r.Inventory().shots,
    front:[...r.enemies.values()].map(a=>({id:a.missionId,entity:a.id})),
    rifles:r.frontShow.bunker.rifleProps.length,control:r.controls?.kind||null};});
  await fs.writeFile(path.join(output,"Data_RescuePhysicalEvents.json"),JSON.stringify(guard,null,2));
  assert.ok(guard.down,"the ambushed guard falls");assert.ok(guard.guideAlive,"the interpreter can escape");
  assert.match(guard.deathClip,/DeathCollapse[A-D]/,"the contacted guard uses the existing Kimodo collapse library");
  assert.ok(guard.heFired,"He Youtian actually fires covering shots");
  assert.deepEqual(guard.vanguard.map(a=>a.id).sort(),[...Storyboards.vanguardIds].sort(),"all four original vanguard soldiers accounted for");
  assert.ok(guard.vanguard.every(a=>!a.alive&&a.health<=0&&!a.essential),"squad has really killed all four before rescue release");
  assert.equal(guard.playerShots,0,"player did not perform the squad's clearing task");
  for(const id of ["approach","front","machineGun","tank","bundleApproach"].flatMap(group=>MISSION_ENCOUNTERS[group].map(a=>a.id))){
    const birth=motion.births[id];
    assert.ok(birth&&birth.stage==="BunkerRescue"&&birth.distance>25,`distant enemy ${id} exists during rescue before the player exits`);
  }
  assert.ok(guard.deflectedImpact?.hit,"the deflected shot strikes the real trench wall");
  assert.equal(guard.rifles,1,"the ambushed guard releases his rifle");
  assert.equal(guard.control,null,"movement returns before rifle pickup");
  await page.evaluate(()=>window.Tengxian.StepFrames(2,1/60,true));
  await page.screenshot({path:path.join(output,"Scene_RescueCleared.png")});
  await Route([{x:P.bunker.rifle.x,z:P.bunker.rifle.z+.6}],"OpeningRifle",{stance:"crouch"});
  await Interact();
  await WaitStage("RearTrench",5);
  const armed=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  assert.ok(armed.facts.includes("rifleRecovered"));assert.equal(armed.emptyHands,false);
  await Route(MISSION_STAGE_ROUTES.rearTrench.slice(0,5),"OpeningRearTrench",{fight:true,stance:"crouch"});
  await CaptureFocus("OpeningCollection",A.collection);
  await WaitStage("Support",120,{fight:true,cover:true});
  const rear=await page.evaluate(()=>window.Tengxian.Debug.FirstLevelMission());
  const continued=await page.evaluate(()=>Object.fromEntries([...window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.values()].map(a=>[a.missionId,a.id])));
  for(const actor of guard.front)assert.equal(continued[actor.id],actor.entity,`${actor.id} remains the same entity when 03 begins`);
  for(const fact of ["rearTrenchEntered","cornerReached","collectionPointSeen","supportOrdersHeard"])assert.ok(rear.facts.includes(fact),fact);
  for(const cue of ["TrenchCurse","CornerCheck","SupportOrder"])assert.ok(rear.voice.played.includes(cue),cue);
  assert.ok(rear.front.collection.litters>=4&&rear.front.collection.people>=8,"casualty collection is present");
  console.log("ok 01–02 normal progression to Support");
}
