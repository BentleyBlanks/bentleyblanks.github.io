// Scoped 01–03 normal-input acceptance. No stage facts or positions are injected.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";
import { MISSION_PLACEMENT as P, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
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
        g.StepFrames(1,1/60,frame===14);
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
          const acting=a.actor.characterRig?.openingActorPerformanceState;
          if(acting&&!acting.protected){
            probe.acting??={};const key=acting.cue+"/"+acting.role;
            const bones=a.actor.characterRig.bones,head=bones.head.quaternion;
            const hand=root.worldToLocal(bones.handR.getWorldPosition(Vec()));
            const row=probe.acting[key]??={head:head.toArray(),hand:hand.toArray(),headRadians:0,handMetres:0,speakingFrames:0};
            row.headRadians=Math.max(row.headRadians,head.angleTo(head.clone().fromArray(row.head)));
            row.handMetres=Math.max(row.handMetres,hand.distanceTo(Vec().fromArray(row.hand)));
            if(acting.speaking)row.speakingFrames++;
          }
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
          if(probe.cameraRotation)probe.maxCameraTurn=Math.max(probe.maxCameraTurn||0,cam.quaternion.angleTo(cam.quaternion.clone().fromArray(probe.cameraRotation))*180/Math.PI);
          probe.camera=cam.position.toArray();
          probe.cameraRotation=cam.quaternion.toArray();
          for(const side of ['L','R']){
            const shoulder=s.playerBody.characterRig.bones['upperArm'+side].getWorldPosition(Vec());cam.worldToLocal(shoulder);
            probe.minShoulderBehind=Math.min(probe.minShoulderBehind,shoulder.z);
          }
        }
        if(probe.wasCameraActive&&!s.CameraActive&&probe.cameraRotation)
          probe.releaseCameraTurn=cam.quaternion.angleTo(cam.quaternion.clone().fromArray(probe.cameraRotation))*180/Math.PI;
        probe.wasCameraActive=s.CameraActive;
        if(s.phase==='Ambush'&&s.Age<.5&&!s.Executioner(1).alive)probe.violations.push({phase:s.phase,error:'guard fell before contact'});
        if(s.phase==='Black'&&r.opening.eyeClosure>.1)probe.violations.push({phase:s.phase,error:'strike obscured by black screen'});
        if(['Captive','CaptiveShot','Discover','Drag','Butt','Interrogate','Creep'].includes(s.phase)){
          const he=r.companion.Handle('heyoutian');
          if(he.position.z<-123)probe.violations.push({phase:s.phase,error:'He Youtian exposed before the ambush'});
        }
        for(const [side,hand] of Object.entries(s.firstPersonState?.hands||{})){
          if(!s.CameraActive)continue;
          probe.maxWristBend=Math.max(probe.maxWristBend||0,hand.wristBend);
          probe.maxWristTwist=Math.max(probe.maxWristTwist||0,Math.abs(hand.wristTwist));
          probe.maxHandRotationStep=Math.max(probe.maxHandRotationStep||0,hand.rotationStepDegrees||0);
          probe.maxPartnerHandRotationStep=Math.max(probe.maxPartnerHandRotationStep||0,hand.partnerRotationStepDegrees||0);
          if(Number.isFinite(hand.partnerWristBend))probe.maxPartnerWristBend=Math.max(probe.maxPartnerWristBend||0,hand.partnerWristBend);
          const paired=s.phase==='Drag'&&s.Age>.8&&side==='l'||s.phase==='Pull'&&s.Age>.35&&s.Age<2.3;
          const valid=hand.wristBend<=42.1&&Math.abs(hand.wristTwist)<1&&hand.reachRatio<=.971&&hand.shoulderBehind>.08
            &&(!Number.isFinite(hand.partnerWristBend)||hand.partnerWristBend<=42.1)
            &&(!Number.isFinite(hand.partnerRotationStepDegrees)||hand.partnerRotationStepDegrees<20);
          const contact=!paired||(hand.contactError<.005&&hand.partnerContactError<.005&&hand.palmGap<.022
            &&hand.palmOpposition<-.85&&Math.abs(hand.partnerWristTwist)<1);
          if((!valid||!contact)&&probe.violations.length<20)probe.violations.push({phase:s.phase,age:s.Age,side,hand});
        }
      }
      const r=g.Debug.FirstLevelMissionRuntime(),m=g.Debug.FirstLevelMission();
      const show=r.frontShow.bunker;
      return {stage:m.stage,time:m.time,facts:m.facts,voice:m.voice,...show.State(),firstPerson:show.firstPersonState,alive:g.player.alive,
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
    if(state.phaseTime>=.35&&!captured.has(state.phase)){
      captured.add(state.phase);
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
  assert.ok(motion.maxCameraTurn<10,"camera orientations blend continuously between shots");
  assert.ok(motion.maxHandRotationStep<12,"palms acquire/release contact without a one-frame flip");
  assert.ok(motion.maxPartnerHandRotationStep<20,"the helper's palms approach contact without an orientation jump");
  assert.ok(motion.releaseCameraTurn<5,"returning control retains the last presented view");
  for(const key of ["BunkerBanter/yaowa","BunkerBanter/luo","BunkerBanter/runner","BunkerKilling/interpreter","RescueCall/interpreter"]){
    const acting=motion.acting[key];
    assert.ok(acting?.speakingFrames>10,`${key}: the actual speaking actor receives dialogue gestures`);
    assert.ok(acting.headRadians>.06||acting.handMetres>.055,`${key}: visible acting continues during the exchange`);
  }
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
  await page.evaluate(()=>{
    const s=window.Tengxian.Debug.FirstLevelMissionRuntime().frontShow.bunker,update=s.UpdatePerformances;
    window.openingRearActing={};window.openingRearHeard={};
    s.UpdatePerformances=function(){
      const current=this.r.voice.current;
      if(current?.phase==="playing"){
        const index=current.plan.lines.findIndex(([start,end])=>current.sourceTime>=start&&current.sourceTime<end);
        const who=current.cue.lines[index]?.who;
        if(['guard','zhou','luo'].includes(who)){
          const key=current.cue.id+'/'+who,row=window.openingRearHeard[key]??={frames:0,visibleFrames:0};
          row.frames++;if(this.SpeakerActor(who)?.actor.poseVisible)row.visibleFrames++;
        }
      }
      for(const role of ['guard','zhou','luo']){
        const actor=this.SpeakerActor(role),rig=actor?.actor?.characterRig,state=rig?.openingActorPerformanceState;
        if(!state?.speaking)continue;
        const key=state.cue+'/'+role,head=rig.bones.head.quaternion;
        const row=window.openingRearActing[key]??={frames:0,head:head.toArray(),turn:0};
        row.frames++;row.turn=Math.max(row.turn,head.angleTo(head.clone().fromArray(row.head)));
      }
      return update.apply(this,arguments);
    };
  });
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

export async function CheckOpeningActing(ctx){
  const {page,output}=ctx;
  const rearActing=await page.evaluate(()=>window.openingRearActing);
  const heard=await page.evaluate(()=>window.openingRearHeard);
  await fs.writeFile(path.join(output,"Data_OpeningRearActing.json"),JSON.stringify(rearActing,null,2));
  await fs.writeFile(path.join(output,"Data_OpeningRearHeard.json"),JSON.stringify(heard,null,2));
  // Culled actors legitimately skip detailed bone updates. Check every audible
  // speaker actually rendered nearby, including the required collection report.
  const visible=Object.keys(heard).filter(key=>heard[key].visibleFrames>10);
  assert.ok(visible.includes('SupportOrder/guard'),"the collection report has its real visible speaker");
  assert.ok(visible.some(key=>key.startsWith('Front')&&key.endsWith('/luo')),"Luo performs visible front commands");
  for(const key of visible){
    assert.ok(rearActing[key]?.frames>10,`${key}: actual visible 02–03 speaker has an active performance`);
    assert.ok(rearActing[key].turn>.03,`${key}: actual visible 02–03 speaker visibly turns/nods`);
  }
  assert.deepEqual(ctx.errors,[]);
  console.log("ok 01–03 normal progression, continuous hands and visible dialogue performances");
}
