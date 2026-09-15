import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { MISSION_CIVILIAN_AFTERMATH } from "./Data_FirstLevelMissionCivilianAftermath.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FirstLevelOpening, OpeningRecoveryTime, SampleOpeningPerception } from "./Script_FirstLevelOpening.mjs";
import { FirstLevelOpeningBarrage } from "./Script_FirstLevelOpeningBarrage.mjs";
import { MISSION_AFTERMATH, FRONT_BREACHES, FRONT_ASSAULT, FRONT_COVER, FRONT_FIELD_MEN, FRONT_RESERVES, FRONT_ASSAULT_STARTS, FrontAssaultLane, FrontReserveLane } from "./Data_FirstLevelMissionFront.mjs";
import { COVER } from "./Data_Tuning_AiCover.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { CollectBulletNearMisses,ApplyBulletNearMisses } from "./Script_BallisticSuppression.mjs";
import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { CARRIAGE_SOUND, CARRIAGE_SOUND_ASSETS } from "./Data_FirstLevelCarriageSound.mjs";
import { FirstLevelCarriageSound } from "./Script_FirstLevelCarriageSound.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { MISSION_TRAIN, MissionTrainMotion } from "./Data_FirstLevelMissionTrain.mjs";
import { FirstLevelMissionTrain } from "./Script_FirstLevelMissionTrain.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { TransferBeatReady, GuardCrossingPair, FrontReplacementSlots } from "./Script_FirstLevelMissionPacing.mjs";
import { FIRST_LEVEL_STAGES, ResolveFirstLevelStage, FirstLevelStageForStep } from "./Data_FirstLevelMissionStages.mjs";
import { BuildFirstLevelCheckpoint } from "./Script_FirstLevelMissionCheckpoint.mjs";
import { FirstLevelMissionColumn, MissionRouteNextIndex, MissionCarryRoutePoint, MissionGuideSpeed, MissionGuideRoute, MissionSquadRoute, MissionSquadPace } from "./Script_FirstLevelMissionColumn.mjs";
import { MISSION_STAGES, MISSION_TUNING as R, FIRST_LEVEL_MISSION_PHASE, MISSION_TACTICS, MISSION_ENCOUNTERS, MISSION_PURSUIT_ROUTE } from "./Data_FirstLevelMission.mjs";
import { MISSION_LAYOUT, MISSION_ROUTES, MISSION_ANCHORS as A, MISSION_PLACEMENT as P, MISSION_RAILWAY, MISSION_SUPPLIES } from "./Data_FirstLevelMissionLayout.mjs";
import { MakeRailwayProfile } from "./Script_RoadPath.mjs";
import { MISSION_TERRAIN, SampleMissionTerrain, MissionPathDistance } from "./Data_FirstLevelMissionTerrain.mjs";
import { CreateP012Terrain } from "./Data_FirstLevelP012Terrain.mjs";
import { MISSION_DIALOGUE, MissionVoicePrompt } from "./Data_FirstLevelMissionDialogue.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";

// Exercise the real dynamic voice recipes and admission rules. Only WebAudio's
// device nodes/decoder are stand-ins; LoadVoices, Play, SetListener, movement and
// the simultaneous mission tracks run their production implementations.
{
  const {AudioEngine}=await import("./Script_Audio.mjs");
  const manifest=JSON.parse(fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json",import.meta.url)));
  const cues=MISSION_DIALOGUE.filter(cue=>["TrainPack","TrainBanter"].includes(cue.id));
  const buffers=new Map(cues.map(cue=>[manifest.cues[cue.id].sha256,
    {duration:manifest.cues[cue.id].seconds,key:`Mission${cue.id}`} ]));
  const Param=()=>({value:0,setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;},
    cancelScheduledValues(){},linearRampToValueAtTime(value){this.value=value;}});
  const Node=()=>({connect(node){assert.ok(node,"every audio edge has a destination");return node;},disconnect(){}});
  const sources=[];
  const ctx={currentTime:0,listener:{setPosition(){},setOrientation(){}},
    createGain:()=>({...Node(),gain:Param()}),
    createBiquadFilter:()=>({...Node(),frequency:Param(),Q:Param()}),
    createPanner:()=>({...Node(),positionX:Param(),positionY:Param(),positionZ:Param()}),
    createBufferSource:()=>{const source={...Node(),playbackRate:Param(),
      start(...args){this.started=args;},stop(at){if(at==null)this.stopped=true;}};sources.push(source);return source;},
    decodeAudioData:async bytes=>{const buffer=buffers.get(crypto.createHash("sha256").update(new Uint8Array(bytes)).digest("hex"));
      assert.ok(buffer,"the dynamic recipe loads the actual authored MP3 bytes");return buffer;},
  };
  const audio=new AudioEngine();audio.ctx=ctx;audio.sfxBus=Node();audio.storyDuck=ctx.createGain();audio.reverbs={street:Node()};
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=async url=>new Response(fs.readFileSync(new URL(url)));
    assert.equal(await audio.LoadVoices(new URL("./Audio/FirstLevel/",import.meta.url).href,
      cues.map(cue=>({key:`Mission${cue.id}`,file:cue.file,kind:"story",version:manifest.cues[cue.id].sha256}))),2);
  }finally{globalThis.fetch=originalFetch;}
  const Camera=(x,y,z)=>({matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]}});
  const position={x:-76.2,y:2.54,z:201};
  audio.SetListener(Camera(-77,2.8,341.9));
  assert.equal(audio.Play("voice.MissionTrainBanter",{position,priority:true}),null,
    "a listener left at the old rendered frame reproduces the missing briefing");
  assert.equal(audio.drops.distance,1,"the real voice distance rule, not decoding or node budget, rejects it");
  audio.SetListener(Camera(-77,2.8,201.7));
  // Even an exhausted device budget cannot consume a nearby priority dialogue.
  audio.nodeBudget=1;
  const voice=new FirstLevelMissionVoice({audio,Clock:()=>ctx.currentTime,Position:()=>position,
    hud:{SayLines(){},Say(){}}});voice.manifest=manifest;
  try{
    voice.Enqueue("TrainPack");voice.Update(0);
    const Step=count=>{for(let i=0;i<count;i++){ctx.currentTime+=1/60;voice.Update(1/60);}};
    Step(360);
    const main=audio.storyVoice,parallel=voice.current.parallel[0];
    assert.ok(main&&parallel?.voice,"both complete recordings acquire real AudioEngine voice handles");
    assert.ok(audio.activeVoices.has(main)&&audio.activeVoices.has(parallel.voice),"the briefing does not replace the story slot");
    assert.deepEqual(sources.map(source=>source.buffer.key),["MissionTrainPack","MissionTrainBanter"]);
    assert.ok(sources.every(source=>source.started&&source.playbackRate.value===1),"both loaded recipes schedule a source without changing pitch");
    assert.ok(parallel.voice.distance<2&&parallel.voice.panner,"the briefing stays spatial at the current listener");
    assert.ok(audio.stats.priorityOverBudget>0&&audio.drops.starved===0,"priority protects both tracks from budget rejection");
    const before=voice.State();voice.Pause();ctx.currentTime+=10;voice.Update(10);
    assert.equal(voice.State().sourceTime,before.sourceTime);
    assert.equal(voice.State().parallel[0].sourceTime,before.parallel[0].sourceTime);
    assert.ok(sources.every(source=>source.stopped),"pause actually stops both scheduled AudioBufferSources");
    voice.Resume();
    assert.equal(sources[2].started[1],before.sourceTime,"the banter resumes at its retained source offset");
    assert.equal(sources[3].started[1],before.parallel[0].sourceTime,"the briefing resumes at its own source offset");
    assert.ok(audio.storyVoice&&voice.current.parallel[0].voice);
    assert.equal(audio.errorCount,0);assert.deepEqual(audio.voiceErrors,[]);
  }finally{
    voice.Dispose();for(const timer of audio.timers)clearTimeout(timer);audio.timers.clear();
  }
  console.log("ok real AudioEngine dialogue admission: stale listener repro, simultaneous sources, budget and pause/resume");
}
if(process.argv.includes("--opening-audio"))process.exit(0);

// Run the production projectile and mission adapter in Node. Vendor .js files
// are browser ES modules inside this repository's CommonJS package boundary.
// No renderer, browser, scene or GPU is created by this clock/ballistics fixture.
{
  const {registerHooks}=await import("node:module");
  const vendorRoot=new URL("./vendor/",import.meta.url).href;
  const hooks=registerHooks({load(url,context,next){
    if(url.startsWith(vendorRoot)&&url.endsWith(".js"))
      return {format:"module",source:fs.readFileSync(new URL(url),"utf8"),shortCircuit:true};
    return next(url,context);
  }});
  let CombatSystem,FirstLevelMissionRuntime,Vector3;
  try {
    ({CombatSystem}=await import("./Script_Combat.mjs"));
    ({FirstLevelMissionRuntime}=await import("./Script_FirstLevelMissionRuntime.mjs"));
    ({Vector3}=await import("three"));
  } finally {hooks.deregister();}
  {
    const flow=new FirstLevelMissionFlow(),said=[];
    const ordinary={id:901,side:"nra",alive:false,squadId:"TestSquad",position:new Vector3()};
    const witness={id:902,side:"nra",alive:true,squadId:"TestSquad",position:new Vector3(2,0,0)};
    const r={flow,time:1,failed:false,completed:false,opening:{},voice:{current:null},
      ai:{soldiers:[ordinary,witness]},player:{position:new Vector3()},hud:{Say:(...args)=>said.push(args)},
      Point:p=>p,BlocksSight:()=>false,Record:(id,detail)=>flow.Record(id,detail)};
    const Notify=actor=>FirstLevelMissionRuntime.prototype.OnOrdinaryCasualty.call(r,actor);
    Notify(ordinary);Notify(ordinary);
    assert.equal(flow.log.filter(e=>e.id==="ordinaryCasualty901").length,1,"one real casualty receipt per actor");
    assert.equal(said.length,1,"a nearby living squadmate reacts once");
    assert.equal(r.failed,false);
    Notify({...ordinary,id:903});assert.equal(said.length,1,"reactions are throttled");
    r.time+=R.casualtyReactionGapS;r.voice.current={};
    Notify({...ordinary,id:904});assert.equal(said.length,1,"mission dialogue is never overwritten");
    r.voice.current=null;r.BlocksSight=()=>true;
    Notify({...ordinary,id:905});assert.equal(said.length,1,"a wall prevents a false witness reaction");
    r.BlocksSight=()=>false;witness.alive=false;
    Notify({...ordinary,id:906});assert.equal(said.length,1,"dead squadmates do not speak");
    witness.alive=true;
    Notify({...ordinary,id:908,position:new Vector3(100,0,0)});
    assert.equal(said.length,1,"distant casualties stay outside the local subtitle channel");
    Notify({...ordinary,id:909,squadId:"OtherSquad"});
    assert.equal(said.length,1,"another group does not pretend to be a squad witness");
    for(const castId of OPENING.requiredSquadCast)Notify({...ordinary,id:castId,castId});
    Notify({...ordinary,id:907,side:"ija"});Notify({...witness,alive:true});
    assert.equal(flow.log.filter(e=>e.id?.startsWith("ordinaryCasualty")).length,7,
      "ordinary casualty receipts exclude living actors, enemies and required companions");
  }
  {
    const flow=new FirstLevelMissionFlow();flow.Start();
    const r={flow,squad:[{id:1,alive:false,castId:null}],Has:id=>flow.Has(id),Record:(id,d)=>flow.Record(id,d),
      OnPlayerDown:()=>{r.failed=true;},MissionFailure:()=>{},failed:false};
    const opening=new FirstLevelOpening(r);
    opening.barrage.Update=()=>{};opening.FireWindows=()=>{};opening.UpdateZhou=()=>{};
    opening.Update(1/60);
    assert.equal(r.failed,false,"an ordinary member in the player's squad does not fail the opening");
    r.squad.push({id:2,castId:OPENING.requiredSquadCast[0],alive:false});
    opening.Update(1/60);assert.equal(r.failed,true,"the existing required-companion contract is preserved");
  }
  for(const survivors of [0,1,3]){
    const flow=new FirstLevelMissionFlow();flow.index=MISSION_STAGES.findIndex(s=>s.id==="MachineGun");flow.started=true;
    const guards=Array.from({length:4},(_,i)=>({actor:{id:i,alive:i<survivors},safe:true,progress:1,route:[{}]}));
    const r={flow,guards,time:0,Has:id=>flow.Has(id),Record:(id,d)=>flow.Record(id,d)};
    flow.Record("frontAttackRepelled");
    FirstLevelMissionRuntime.prototype.UpdateGuards.call(r,1/60);
    assert.equal(flow.log.find(e=>e.id==="guardWithdrawalResolved").detail.survived,survivors,
      "withdrawal counts only living survivors, including casualties after reaching cover");
    flow.Update(1/60);assert.equal(flow.stage.id,"Tank","partial or total ordinary losses never strand withdrawal");
  }
  {
    const guards=[[-3.15,-124.16],[-3.13,-123.53]].map(([x,z],i)=>({
      actor:{id:77+i,alive:true,position:{x,z}},safe:true,crossing:true,progress:4,
      route:Array.from({length:7},()=>({x:6,z:-124})),
    }));
    const speeds=new Map(),r={guards,time:1,flow:{stage:{id:'Tank'}},ai:{SetStance(){}},
      Has:()=>true,Record(){},Say(){},MoveActor:(actor,point,speed)=>speeds.set(actor.id,speed)};
    FirstLevelMissionRuntime.prototype.UpdateGuards.call(r,1/60);
    assert.equal([...speeds.values()].filter(speed=>speed>0).length,1,
      'recorded converging guard pair grants one passage instead of mutual yield');
    assert.equal([...speeds.values()].filter(speed=>speed===0).length,1,
      'the other man still yields instead of both ignoring separation');
  }
  const StanceRequest=(stage,facts)=>{
    const input={stanceRequested:"stand",crouchPressed:true,pronePressed:true};
    FirstLevelMissionRuntime.prototype.BeforePlayer.call({flow:{stage:{id:stage}},
      Has:id=>facts.has(id),meal:{Restore(){}},ReceivingFood:false,controls:null,player:{stance:"stand",position:{x:0,z:0},yaw:0,velocity:{x:0,z:0}}},1/60,input);
    return input;
  };
  const freeStance={stanceRequested:"stand",crouchPressed:true,pronePressed:true};
  for(const phase of FIRST_LEVEL_STAGES.filter(phase=>phase.number>=3)){
    const saved=BuildFirstLevelCheckpoint(phase.number),facts=new Set(saved.facts);
    assert.ok(facts.has("trainNearShellImpact"),`${phase.id}: a completed derailment includes its near-shell impact`);
    const legacy=new Set(facts);legacy.delete("trainNearShellImpact");
    for(const stage of phase.steps){
      assert.deepEqual(StanceRequest(stage,facts),freeStance,`${stage}: the current checkpoint permits standing`);
      assert.deepEqual(StanceRequest(stage,legacy),freeStance,`${stage}: an old save missing the impact still permits standing`);
      assert.deepEqual(StanceRequest(stage,new Set(["trainProneOrder"])),freeStance,
        `${stage}: a stale carriage order never owns a later gameplay stage`);
    }
  }
  for(const stage of ["Train","Unloading"]){
    assert.deepEqual(StanceRequest(stage,new Set()),freeStance,`${stage}: the player stays free before the order`);
    assert.deepEqual(StanceRequest(stage,new Set(["trainProneOrder"])),
      {stanceRequested:"crouch",crouchPressed:false,pronePressed:false},`${stage}: the real incoming barrage still forces crouching`);
    assert.deepEqual(StanceRequest(stage,new Set(["trainProneOrder","trainNearShellImpact"])),freeStance,
      `${stage}: impact ends the crouch order before derailment controls take over`);
    assert.deepEqual(StanceRequest(stage,new Set(["trainProneOrder","luoRescueComplete"])),freeStance,
      `${stage}: completed rescue releases an old save even when the impact fact is absent`);
  }
  console.log("ok carriage crouch scope: live barrage, completed rescue, all later stages and legacy saves");
  if(process.argv.includes("--opening-stance"))process.exit(0);
  {
    const voice=new FirstLevelMissionVoice({audio:{StopStoryVoice(){}},hud:{Say(){}}});
    const gunner={alive:true,position:{x:25,z:-161}};
    const guard={safe:false,crossing:false,actor:{alive:true,position:{x:0,z:0}}};
    const r=Object.create(FirstLevelMissionRuntime.prototype);
    Object.assign(r,{voice,time:0,flow:{stage:{id:"Support"}},guards:[guard],enemies:new Map([["FrontGunner",gunner]]),
      player:{position:{x:0,z:0},EyePosition:{},camera:{}},Has:()=>true,BlocksSight:()=>false,
      Point:()=>({clone:()=>({project:()=>({x:2,y:0,z:0})})})});
    voice.played.add("FrontCoverCall");voice.finished.add("FrontCoverCall");
    r.UpdateFrontDialogue();r.time=R.frontDialogueReminderS;r.UpdateFrontDialogue();
    assert.ok(voice.queue.includes("FrontReminder"),"unseen friends get one source-authored reminder");
    r.time=R.frontDialogueFallbackS;r.UpdateFrontDialogue();
    assert.ok(voice.queue.includes("FrontFallback")&&!voice.queue.includes("FrontReminder"),"fallback replaces the stale queued reminder");
    gunner.alive=false;guard.crossing=true;r.UpdateFrontDialogue();
    assert.ok(!voice.queue.some(id=>["FrontBlockade","FrontReminder","FrontFallback"].includes(id)),
      "destroying the actual blocking gun cancels false blockade dialogue");
    assert.ok(voice.queue.includes("FrontCrossing"),"a real crossing after gun destruction receives its new exchange");
    assert.ok(!voice.finished.has("FrontFallback"),"cancelled dialogue is never falsely marked heard");
  }
  const Make=()=>{
    const facts=new Set(["trainFirstShellLaunched"]),rays=[],impacts=[],sounds=[];
    const fixture={clock:0,wallX:null};
    const combat=Object.create(CombatSystem.prototype);
    Object.assign(combat,{shells:[],shellSerial:0,shellVisuals:{Create(){},Step(){},Update(){},Retire(){}},
      Blast:point=>impacts.push(point.clone()),host:{audio:{Play:(key,options)=>sounds.push({key,...options})},battlefield:{
        GroundHeight:()=>0,
        Raycast:(from,direction,distance)=>{
          rays.push({from:from.clone(),direction:direction.clone(),distance});
          const floor=direction.y<0?-from.y/direction.y:Infinity;
          const wall=fixture.wallX!=null&&Math.abs(direction.x)>1e-8?(fixture.wallX-from.x)/direction.x:Infinity;
          const at=Math.min(floor>=0?floor:Infinity,wall>=0?wall:Infinity);
          return at<=distance?{t:at}:null;
        },
      }}});
    const runtime={time:0,Has:id=>facts.has(id),Record:id=>facts.add(id),combat,
      Point:(p,y=0)=>new Vector3(p.x,y,p.z),trainShellStartedAt:null,shellTrainOffset:0,
      carriageSound:{Handle:()=>false},opening:{Derail:()=>facts.add("trainNearShellImpact")},
      player:{Suppress(){}},squad:[],column:{},
    };
    const voice=new FirstLevelMissionVoice({
      audio:{PlayStoryVoice:()=>({voice:{t:fixture.clock}}),StopStoryVoice(){}},hud:{Say(){}},
      Clock:()=>fixture.clock,Ready:id=>facts.has(id),
      Event:(...args)=>FirstLevelMissionRuntime.prototype.VoiceEvent.call(runtime,...args),
    });
    runtime.voice=voice;
    voice.manifest=JSON.parse(fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json",import.meta.url)));
    voice.Enqueue("TrainShelling");voice.Update(0);
    voice.current.cue={...voice.current.cue,lines:Array.from({length:3},()=>({who:"luo",text:"Fixture"}))};
    voice.current.plan={lines:[[0,0],[0,0],[0,2.4]],segments:[
      {start:0,end:2.4,wait:0,events:[{at:1,id:"TrainNearShell"}]},
      {start:2.4,end:3,wait:0,gate:"trainNearShellImpact"}],tail:0};
    voice.BeginSegment();
    fixture.Step=(audioSeconds,dt=.05)=>{fixture.clock+=audioSeconds;runtime.time+=dt;voice.Update(dt);combat.StepShells(dt);};
    return Object.assign(fixture,{runtime,voice,combat,facts,rays,impacts,sounds});
  };
  const slow=Make(),cue=MISSION_DIALOGUE.find(cue=>cue.id==="TrainShelling");
  const plan=slow.voice.current.plan;
  const launchAt=plan.segments[0].events[0].at,impactAt=plan.lines[2][1];
  // Ten rendered frames per real second, with Main's simulation dt cap of .05.
  while(slow.clock<launchAt+.15)slow.Step(.1);
  assert.equal(slow.combat.shells.length,1,"the source-timed near shell is a real live projectile");
  const shell=slow.combat.shells[0],pausedAge=shell.age,pausedPosition=shell.position.toArray(),pausedRays=slow.rays.length;
  slow.voice.Pause();for(let i=0;i<30;i++)slow.Step(.1);
  assert.equal(shell.age,pausedAge,"a paused source cannot advance the story projectile on simulation dt");
  assert.deepEqual(shell.position.toArray(),pausedPosition,"pause freezes the actual ballistic position");
  assert.equal(slow.rays.length,pausedRays,"a frozen projectile does not cast zero-length collision rays");
  slow.voice.Resume();
  for(let i=0;i<30&&!slow.impacts.length;i++)slow.Step(.1);
  assert.equal(slow.impacts.length,1,"the real impact occurs despite simulation advancing at half audio speed");
  assert.ok(Math.abs(slow.voice.current.sourceTime-impactAt)<1e-8,"the retained-source projectile reaches its authored endpoint");
  assert.ok(slow.facts.has("trainNearShellImpact"),"the collision releases the actual injury-dialogue gate");
  assert.ok(slow.rays.length>=160,"catch-up retains the full substepped collision path");
  assert.equal(slow.combat.shells.length,0,"the shell retires once after impact");

  const late=Make();late.Step(launchAt+.8);
  assert.ok(Math.abs(late.combat.shells[0].age-.8)<1e-8,"a delayed launch frame catches up from the authored launch time");
  assert.ok(late.rays.length>=95,"late launch traces its whole path instead of teleporting to the current point");
  late.Step(impactAt-late.voice.current.sourceTime);
  assert.equal(late.impacts.length,1,"a source held exactly at the gate can still physically reach the ground");
  assert.ok(late.impacts[0].distanceTo(late.rays[0].from)>20,"impact is reached through the real travelled trajectory");

  const blocked=Make();blocked.wallX=-59.7;blocked.Step(impactAt);
  assert.equal(blocked.impacts.length,1,"a catch-up interval still hits intervening world geometry");
  assert.ok(Math.abs(blocked.impacts[0].x-blocked.wallX)<1e-8&&blocked.impacts[0].y>0,
    "the nearer wall receives the hit instead of a forced explosion at the authored ground target");
  blocked.Step(1);assert.equal(blocked.impacts.length,1,"a blocked projectile cannot impact again after the clock advances");

  const ordinary=Make();
  const normal=ordinary.combat.FireShell(new Vector3(0,28,0),new Vector3(26,0,0),{flight:1.4,incoming:false});
  ordinary.combat.StepShells(.05);
  assert.ok(Math.abs(normal.age-.05)<1e-8,"ordinary combat shells retain their simulation-dt clock");
  const ranging=Make();Object.assign(ranging.runtime,{time:20,trainClockLead:19});
  const barrage=new FirstLevelOpeningBarrage(ranging.runtime);
  barrage.startedAt=20;barrage.nextShotAt=Infinity;barrage.Update();
  assert.equal(ranging.combat.shells[0].target.z,MISSION_TRAIN.cars[OPENING.derailCar].z+
    MissionTrainMotion(39+OPENING.barrage.firstFlightS).offsetM+OPENING.barrage.shells[0].z,
    "the first ranging shell follows the audio-led moving train even when simulation runs slower");
  console.log("ok source-timed near shell: 10fps cap, pause/resume, late launch, real obstruction and ordinary dt");
}
// The upstream sensory recovery can outlast the carriage roll. Observe the
// actual perception function and Opening.Update together, including an early
// rescue request; a separate timer must not consume the failed rise unseen.
{
  const summaries=[];
  for(const dt of [1/10,1/60,1/144]){
    const facts=new Set(['trainDerailed','trainStopped','luoRescueRequested']),events=[],controls=[];
    const luo={alive:true,castId:'luo',position:{...OPENING.rescueGuide,y:0}};
    const runtime={time:OPENING.derailSeconds,flow:{stage:{id:'Unloading'}},squad:[luo],spawned:new Set(['surface']),
      Has:id=>facts.has(id),Record:(id,detail)=>{if(!facts.has(id))events.push({id,time:runtime.time,detail});facts.add(id);},
      companion:{Handle:()=>luo},player:{position:{...OPENING.playerFall,y:0}},
      audio:{SetConcussion(){},Play(){return null;}},ai:{SetStance(){}},MoveActor(){},Point:(point,y)=>({...point,y}),
      BeginControl:(kind,duration)=>controls.push({kind,duration,time:runtime.time})};
    const opening=new FirstLevelOpening(runtime);opening.derailAt=0;
    opening.barrage.Update=()=>{};opening.UpdateEscapePressure=()=>{};opening.FireWindows=()=>{};opening.UpdateZhou=()=>{};
    const samples=[];
    for(let frame=0;frame<20/dt&&opening.rescueAt==null;frame++){
      opening.Update(dt);
      const perception=SampleOpeningPerception(runtime.time),action={...luo.missionCarriageAction};
      samples.push({time:runtime.time,eyeClosure:perception.eyeClosure,recoveryAt:opening.luoRecoveryAt,action});
      if(opening.luoRecoveryAt==null){
        assert.ok(perception.eyeClosure>OPENING.luoRecoveryMaxEyeClosure);
        assert.equal(action.clipId,'LuoStaggerRecover');assert.equal(action.seconds,0,'blackout holds the first frame on the ground');
        assert.equal(action.transitionSeconds,0,'the zero-time hold samples the ground pose instead of freezing a pending idle crossfade');
        assert.ok(!facts.has('trainLuoRecovering')&&!facts.has('trainLuoStanding')&&!controls.length,'closed eyes never consume recovery or unlock an early rescue request');
      }else if(action.clipId==='LuoStaggerRecover'){
        assert.ok(perception.eyeClosure<=OPENING.luoRecoveryMaxEyeClosure,'the whole recovery plays with the lids sufficiently open');
        assert.ok(!controls.length,'the pending request cannot skip the final standing recovery');
      }
      if(action.clipId==='LuoStaggerRecover'){
        const before={...luo.missionCarriageAction},started=opening.luoRecoveryAt;
        opening.Update(0);
        assert.deepEqual(luo.missionCarriageAction,before,'a paused mission clock freezes the recovery sample');
        assert.equal(opening.luoRecoveryAt,started);
      }
      runtime.time+=dt;
    }
    const started=events.find(event=>event.id==='trainLuoRecovering'),standing=events.find(event=>event.id==='trainLuoStanding');
    assert.ok(samples.some(sample=>sample.recoveryAt==null),'the real stretched blackout requires an observable hold');
    assert.ok(started&&standing&&controls.length===1,'reopening eventually completes one full recovery and one rescue');
    assert.ok(SampleOpeningPerception(started.time).eyeClosure<=OPENING.luoRecoveryMaxEyeClosure);
    assert.ok(SampleOpeningPerception(started.time-dt).eyeClosure>OPENING.luoRecoveryMaxEyeClosure,'recovery starts at the first visible sample, not an unrelated fixed delay');
    // The authored failed first attempt descends between source 1.45 and 1.85s.
    const failed=samples.filter(sample=>sample.action.clipId==='LuoStaggerRecover'&&sample.action.seconds>=1.45&&sample.action.seconds<=1.85);
    assert.ok(failed.length&&failed.every(sample=>SampleOpeningPerception(sample.time).eyeClosure<=OPENING.luoRecoveryMaxEyeClosure),'the complete failed-rise window remains visible with the actual perception curve');
    assert.ok(standing.time-started.time>=OPENING.luoRecoverySeconds,'visibility waiting never shortens the 4.8 second authored clip');
    assert.ok(controls[0].time>=standing.time&&opening.rescueAt>=standing.time,'helping starts only after Luo has recovered his own footing');
    summaries.push({fps:1/dt,start:started.time,standing:standing.time,maxFailedEyeClosure:Math.max(...failed.map(sample=>sample.eyeClosure))});
  }
  console.log('ok visible complete Luo recovery after blackout, early rescue held, pause-safe',JSON.stringify(summaries));
}
// Exercise the real source-clock player/camera path with a stationary rescuer.
// Endpoints alone missed the old crossing; sample every frame of the pull and
// allow a small physical settling offset from Luo's nominal spill destination.
{
  const {Vector3,PerspectiveCamera}=await import('three');
  const cue=MISSION_DIALOGUE.find(cue=>cue.id==='TrainShelling');
  const manifest=JSON.parse(fs.readFileSync(new URL('./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json',import.meta.url)));
  const plan=MissionVoiceTimeline(cue,manifest.cues.TrainShelling.seconds),indices=OPENING.rescueDialogueLines;
  const sourceStart=plan.lines[indices.reach][0],sourceEnd=plan.lines[indices.steady][1];
  const liftAt=plan.segments.flatMap(segment=>segment.events||[]).find(event=>event.id==='TrainRescueLift').at;
  const steadyAt=plan.segments.flatMap(segment=>segment.events||[]).find(event=>event.id==='TrainRescueSteady').at;
  const summaries=[];
  for(const fps of [10,60,144]){
    const dt=1/fps,moves=[],contacts=[],teleports=[],facts=new Set(['trainDerailed','trainStopped','trainLuoStanding','luoRescueRequested']);
    const luo={alive:true,castId:'luo',position:new Vector3(OPENING.rescueGuide.x+.07,0,OPENING.rescueGuide.z-.07)};
    const rightHand=new Vector3();
    luo.actor={characterRig:{bones:{handR:{getWorldPosition(out){
      // A distinct world-space right-hand marker proves ApplyCamera still
      // consumes that bone instead of the old procedural rescue target.
      return out.copy(rightHand.set(luo.position.x-.2,luo.position.y+.7,luo.position.z-.3));
    }},handL:{getWorldPosition(){assert.fail('rescue must keep the authored right-hand contact');}}}}};
    const position=new Vector3(OPENING.playerFall.x,0,OPENING.playerFall.z),camera=new PerspectiveCamera();
    const runtime={time:20,flow:{stage:{id:'Unloading'}},squad:[luo],spawned:new Set(['surface']),
      Has:id=>facts.has(id),Record:id=>facts.add(id),companion:{Handle:()=>luo},
      player:{position,camera,velocity:new Vector3(),body:{Teleport:(...point)=>teleports.push(point)}},
      battlefield:{trainOffsetM:0,GroundHeight:(x,z)=>SampleMissionTerrain(x,z)},
      voice:{current:{cue,plan,sourceTime:sourceStart}},
      audio:{SetConcussion(){},Play(){return null;}},ai:{SetStance(){}},
      MoveActor:(actor,point,speed)=>moves.push({actor,point:{...point},speed}),
      Point:(point,y)=>new Vector3(point.x,y,point.z),BeginControl(){},
      viewmodel:{ReachWorld:(point,weight)=>contacts.push({point:point.clone(),weight})}};
    const opening=new FirstLevelOpening(runtime);opening.derailAt=0;opening.luoRecoveryAt=0;
    opening.playerFrom=position.clone();opening.eyeFrom=position.clone();opening.lookFrom={yaw:0,pitch:0};
    opening.barrage.Update=()=>{};opening.UpdateEscapePressure=()=>{};opening.FireWindows=()=>{};opening.UpdateZhou=()=>{};
    let minGap=Infinity,pullSamples=0;
    const Sample=source=>{
      runtime.voice.current.sourceTime=source;opening.Update(Math.min(dt,.05));opening.ApplyCamera();
      const gap=Math.hypot(camera.position.x-luo.position.x,camera.position.z-luo.position.z);
      minGap=Math.min(minGap,gap);
      assert.ok(gap>=1,'the whole camera path clears Luo even when physical settling offsets his stationary root');
      assert.equal(position.y,runtime.battlefield.GroundHeight(position.x,position.z),'the player remains supported by the shared ground sampler');
      assert.deepEqual(teleports.at(-1),position.toArray(),'player collision body follows the same source-timed path as the camera');
      assert.deepEqual(contacts.at(-1).point.toArray(),rightHand.toArray(),'the viewmodel reaches the actual right-hand world position');
      if(source<=liftAt){
        assert.equal(position.x,OPENING.playerFall.x,'reach and grip cannot drag the player early');
        assert.equal(position.z,OPENING.playerFall.z);assert.equal(opening.RescueLift(),0);
      }else if(source<steadyAt)pullSamples++;
      runtime.time+=Math.min(dt,.05);
    };
    for(let source=sourceStart;source<sourceEnd;source+=dt)Sample(source);
    Sample(sourceEnd);
    assert.ok(pullSamples>=Math.max(1,Math.floor((steadyAt-liftAt)/dt)-1),'the clearance assertion samples the full current lifting interval at every frame rate');
    assert.ok(moves.every(move=>move.speed===0&&move.point.x===luo.position.x&&move.point.z===luo.position.z),
      'the authored brace never depends on AI movement keeping up with the player');
    assert.equal(position.x,OPENING.rescueEnd.x);assert.equal(position.z,OPENING.rescueEnd.z);
    assert.ok(position.distanceTo(luo.position)>=1&&position.distanceTo(luo.position)<1.7,
      'standing retains the full one-metre body clearance after moving the rescuer clear of the station step');
    const paused={position:position.toArray(),camera:camera.position.toArray(),action:{...luo.missionCarriageAction}};
    runtime.time+=5;opening.Update(0);opening.ApplyCamera();
    assert.deepEqual(position.toArray(),paused.position,'stalled source time freezes the rescue translation');
    assert.deepEqual(camera.position.toArray(),paused.camera,'stalled source time freezes the camera path');
    assert.deepEqual(luo.missionCarriageAction,paused.action,'stalled source time freezes the authored hand action');
    summaries.push({fps,minGap,finalGap:Math.hypot(position.x-luo.position.x,position.z-luo.position.z),pullSamples});
  }
  console.log('ok rescue corridor, stationary support, right-hand contact and grip-before-pull',JSON.stringify(summaries));
}
// Test the full rescue capsule, not just the ground under its root. A prior
// apparently clear root sat outside the last step while its rounded capsule
// penetrated the edge and could not start the subsequent normal guide walk.
{
  const {registerHooks}=await import('node:module'),vendorRoot=new URL('./vendor/',import.meta.url).href;
  const hooks=registerHooks({load(url,context,next){
    if(url.startsWith(vendorRoot)&&url.endsWith('.js'))return {format:'module',source:fs.readFileSync(new URL(url),'utf8'),shortCircuit:true};
    return next(url,context);
  }});
  let PhysicsWorld,InitPhysics,FirstLevelWhiteboxField,CompileWhiteboxWalkableSurfaces;
  try{
    ({PhysicsWorld,InitPhysics}=await import('./Script_Physics.mjs'));
    ({FirstLevelWhiteboxField,CompileWhiteboxWalkableSurfaces}=await import('./Script_FirstLevelWhiteboxField.mjs'));
  }finally{hooks.deregister();}
  await InitPhysics();
  const field=Object.create(FirstLevelWhiteboxField.prototype);
  const world=new PhysicsWorld({groundAt:(x,z)=>field.GroundHeight(x,z)});
  const boxes=MISSION_LAYOUT.blocks.filter(block=>block.solid!==false).map(block=>({id:block.id,
    c:[block.x,block.y,block.z],h:[block.w/2,block.h/2,block.d/2],ry:block.ry||0}));
  Object.assign(field,{physics:world,terrain:CreateP012Terrain(MISSION_LAYOUT),trainOffsetM:0,
    walkableSurfaces:CompileWhiteboxWalkableSurfaces(MISSION_LAYOUT),
    derailMeshes:[{rotation:{},position:{}}],derailColliders:boxes.filter(box=>box.id.startsWith(`StationCar${OPENING.derailCar}`)),
    _GridRemove(){},_GridInsert(){}});
  try{
    for(const box of boxes)world.AddSolid(box);
    field.SetCarDerailment(OPENING.derailCar,OPENING.derailRollRad,OPENING.derailPivot);
    const statics=boxes.map(box=>({id:box.id,collider:world.world.getCollider(box._physicsHandle)}));
    const step=statics.find(box=>box.id===`StationExitStep${OPENING.derailCar}_3`).collider;
    const body=world.MakeCharacter({radius:.34,height:1.78});
    const Contacts=()=>statics.flatMap(box=>{
      const contact=body.collider.contactCollider(box.collider,.1);
      return contact?[{id:box.id,distance:contact.distance}]:[];
    });
    const Penetrations=()=>Contacts().filter(contact=>contact.distance<-.0001);
    // Captured stuck production pose: keep a failing control so this regression
    // cannot silently become another point-only or collision-disabled check.
    const old={x:-72.4482121635021,y:.24757269917590968,z:89.10015593110694};
    body.Teleport(old.x,old.y,old.z);world.Step(1/60);
    const oldDepth=body.collider.contactCollider(step,0)?.distance;
    assert.ok(oldDepth<-.02,'the real Rapier capsule reproduces the recorded step-edge penetration');
    const oldHits=Penetrations();assert.ok(oldHits.some(hit=>hit.id==='StationExitStep1_3'));
    const nominal={...OPENING.rescueGuide,y:field.GroundHeight(OPENING.rescueGuide.x,OPENING.rescueGuide.z)};
    const samples=[];
    for(const height of [1.21,1.78]){
      body.SetSize(.34,height);body.Teleport(nominal.x,nominal.y,nominal.z);world.Step(1/60);
      assert.deepEqual(Penetrations(),[],'the current crouching/standing rescue capsule clears every actual solid box');
      const stepClearance=body.collider.contactCollider(step,.2)?.distance;
      assert.ok(stepClearance>.04,'the last step has positive clearance beyond the controller contact skin');
      samples.push({height,stepClearance});
    }
    const movement=[];
    for(const fps of [30,60,144]){
      const dt=1/fps;body.Teleport(nominal.x,nominal.y,nominal.z);body.grounded=true;world.Step(dt);
      // Hold through the performance, then let the ordinary character
      // controller move north-east along the real first guide route leg.
      for(let frame=0;frame<fps;frame++){body.Move(0,-.6*dt,0);world.Step(dt);}
      assert.deepEqual(Penetrations(),[],'stationary rescue support cannot settle into a step');
      const start=body.position.clone(),target=OPENING.approachRoute[0];
      for(let frame=0;frame<fps*2;frame++){
        const dx=target.x-body.position.x,dz=target.z-body.position.z,length=Math.hypot(dx,dz),travel=R.walkSpeedMps*dt;
        body.Move(dx/length*travel,-.6*dt,dz/length*travel);world.Step(dt);
        assert.deepEqual(Penetrations(),[],'the post-rescue guide walk stays outside the step and overturned carriage');
      }
      const distance=Math.hypot(body.position.x-start.x,body.position.z-start.z);
      assert.ok(distance>R.walkSpeedMps*2*.9,'the normal capsule controller immediately resumes the guide walk after rescue');
      assert.ok(body.position.z<start.z-3,'Luo clears the station-step depth toward the actual trench approach');
      movement.push({fps,distance,position:body.position.toArray()});
    }
    console.log('ok real Rapier rescue landing and subsequent guide movement',JSON.stringify({solids:boxes.length,oldDepth,nominal,samples,movement}));
  }finally{world.Dispose();}
}
if(process.argv.includes("--opening-clock")||process.argv.includes("--opening-recovery")||process.argv.includes("--opening-rescue"))process.exit(0);

assert.ok(P.stationCasualties.every(person=>person.health>0),"station shelling does not manufacture dead recruits at muster");
{
  const wall=MISSION_LAYOUT.blocks.find(block=>block.id==="TrenchRallyEast");
  assert.equal(wall.cover.faceZ,0,"rally cover normal is perpendicular to its long wall");
  assert.ok(wall.cover.points.length>=OPENING.trenchCoverPosts.length,"the squad has distinct shelter slots along the existing wall");
  for(const point of wall.cover.points){
    assert.equal(point.x,wall.x);
    assert.ok(Math.abs(point.z-wall.z)<wall.d/2,"every cover slot lies on actual wall geometry");
  }
}
{
  for(const curve of [OPENING.blinks,OPENING.hearing]){
    const onset=curve.find(([,value])=>value===1)[0];
    assert.equal(OpeningRecoveryTime(onset,onset),onset,"impact onset remains synchronized with the physical wreck");
    for(const [at] of curve.filter(([at])=>at>onset)){
      assert.ok(Math.abs(OpeningRecoveryTime(onset+(at-onset)*2,onset)-at)<1e-9,
        "every post-impact eyelid/hearing beat lasts twice as long");
    }
  }
  assert.equal(OPENING.dizzySeconds*R.openingRecoveryScale,8,"standing recovery lasts eight seconds");
  let previous=1;
  for(let time=1.95;time<=24;time+=1/60){
    const sample=SampleOpeningPerception(time);
    assert.ok(sample.eyeClosure<=previous+1e-9,"after impact the lids reopen without repeated shutter beats");
    assert.ok(Object.values(sample).every(Number.isFinite),"all sensory channels remain finite");
    assert.ok(Math.abs(sample.pitch)<.02&&Math.abs(sample.roll)<.02,"settling stays below a 1.15 degree horizon offset");
    previous=sample.eyeClosure;
  }
  assert.equal(SampleOpeningPerception(2.5).eyeClosure,1,"the impact still fully blacks out");
  assert.equal(SampleOpeningPerception(7).eyeClosure,0,"the rescue view remains open");
  assert.ok(SampleOpeningPerception(10).focus>0&&SampleOpeningPerception(14).amount>0,"sustained recovery is carried by vision, not repeated blackouts");
  assert.deepEqual(SampleOpeningPerception(30),{eyeClosure:0,amount:0,focus:0,pitch:0,roll:0},"every sensory channel has a neutral endpoint");
}
for(const person of MISSION_CIVILIAN_AFTERMATH) {
  assert.ok(["male","female"].includes(person.variant) && person.side==="civilian");
  assert.ok(Object.values(MISSION_ROUTES).every(route=>MissionPathDistance(person,route)>=2.4),"civilian bodies leave stretcher and player routes clear: "+person.id);
  const wall=MISSION_LAYOUT.blocks.find(b=>b.id===person.houseId+"West");
  assert.ok(wall && Math.hypot(person.x-wall.x,person.z-wall.z)<26,"civilian remains belong to an actual nearby house");
  for(const other of [...MISSION_AFTERMATH,...MISSION_CIVILIAN_AFTERMATH])
    if(other!==person)assert.ok(Math.hypot(person.x-other.x,person.z-other.z)>=1.9,"new civilian bodies do not overlap existing remains");
}
for(const point of [MISSION_TRAIN.guideMuster,...MISSION_TRAIN.cars.flatMap(car=>car.muster)])
  assert.ok(MISSION_AFTERMATH.every(body=>Math.hypot(body.x-point.x,body.z-point.z)>=1.8),"living recruits never muster on historical bodies");
{
  const beat={earliestS:35,latestS:60,loaded:4,restS:12};
  assert.equal(TransferBeatReady(beat,{seconds:35,loaded:4,previousClearedAt:30}),false,"vehicle event cannot erase the breathing window");
  assert.equal(TransferBeatReady(beat,{seconds:44,loaded:4,previousClearedAt:30}),true);
  assert.equal(TransferBeatReady(beat,{seconds:59,loaded:0,previousClearedAt:10}),false);
  assert.equal(TransferBeatReady(beat,{seconds:60,loaded:0,previousClearedAt:10}),true,"casualties or delayed loading cannot starve the next finite attack");
  assert.equal(TransferBeatReady(beat,{seconds:600,loaded:20,previousClearedAt:null}),false,"an uncleared previous attack never stacks another wave");
  assert.deepEqual(GuardCrossingPair([{id:1,alive:false},{id:2,alive:true},{id:3,alive:true}],2),[2],"a fallen partner does not strand the surviving crossing man");
  assert.deepEqual(GuardCrossingPair([{id:1,alive:true,safe:true},{id:2,alive:false},{id:3,alive:true}],2),[3]);
  assert.equal(FrontReplacementSlots({alive:149,queued:1,spawned:0},R),0,"queued men reserve live capacity");
  assert.equal(FrontReplacementSlots({alive:24,queued:0,spawned:5},{...R,waveBudget:6}),1,"last finite replacement is not rounded up to a squad");
  assert.equal(FrontReplacementSlots({alive:0,queued:0,spawned:R.waveBudget},R),0,"no infinite replacement loop");
  for(const spec of MISSION_ENCOUNTERS.front)assert.ok(spec.x>MISSION_LAYOUT.bounds.minX && spec.x<MISSION_LAYOUT.bounds.maxX && spec.z>MISSION_LAYOUT.bounds.minZ && spec.z<MISSION_LAYOUT.bounds.maxZ,"every simultaneous soldier starts inside the playable heightfield");
}
{
  for (const time of [0,10,20,R.trainTravelM/R.trainCruiseSpeedMps-1]) {
    const a=MissionTrainMotion(time),b=MissionTrainMotion(time+.1);
    assert.ok(Math.abs((a.offsetM-b.offsetM)/.1-6)<1e-6,"train keeps real cruise speed before shell impact");
  }
  for (const impactAt of [24,26,28]) {
    const start=MissionTrainMotion(impactAt),stop=MissionTrainMotion(impactAt,impactAt,start.offsetM);
    let previous=start;
    for(let t=.01;t<=stop.brakeSeconds+.02;t+=.01) {
      const current=MissionTrainMotion(impactAt+t,impactAt,start.offsetM);
      assert.ok(current.offsetM<=previous.offsetM && current.offsetM>=0);
      assert.ok(current.speedMps<=previous.speedMps && current.speedMps>=0);
      previous=current;
    }
    assert.equal(previous.offsetM,0);assert.ok(previous.stopped);
    assert.equal(stop.speedMps,start.speedMps,"impact does not accelerate or jerk the train");
  }
  assert.ok(MISSION_TRAIN.cars.at(-1).z+R.trainTravelM+8<MISSION_LAYOUT.bounds.maxZ,"whole train begins inside the extended approach");
}
const flow = new FirstLevelMissionFlow();
{
  const { TEXT } = await import("./Data_Text_Menu.mjs");
  for (let index = 0; index < MISSION_STAGES.length; index++) {
    const probe = new FirstLevelMissionFlow(); probe.index = index; probe.Start();
    const stage = probe.stage, before = probe.Snapshot();
    const progress = probe.ObjectiveProgress();
    assert.deepEqual(probe.Snapshot(), before, "reading pause progress must not change mission state");
    assert.deepEqual(progress.conditions.filter(row => row.id !== "minimumSeconds").map(row => row.id), stage.requirements);
    for (const row of progress.conditions) assert.ok(TEXT[`menu.condition.${row.id}`], `missing condition text: ${row.id}`);
    if (stage.minimumSeconds) {
      stage.requirements.forEach(id => probe.Record(id));
      probe.Update(stage.minimumSeconds - .5);
      assert.equal(probe.stage.id, stage.id);
      assert.equal(probe.ObjectiveProgress().conditions.at(-1).complete, false, "timer remains an independent gate");
      probe.Update(.5);
      assert.notEqual(probe.stage.id, stage.id);
    } else if (stage.requirements.length) {
      probe.Record(stage.requirements[0]);
      assert.equal(probe.ObjectiveProgress().conditions[0].complete, true);
      assert.ok(probe.ObjectiveProgress().conditions.slice(1).every(row => !row.complete));
      const restored = new FirstLevelMissionFlow(); restored.Restore(probe.Snapshot());
      assert.deepEqual(restored.ObjectiveProgress(), probe.ObjectiveProgress());
    } else assert.ok(progress.complete && !progress.conditions.length);
  }
}

{
 const calls=[],moved=[],stopped=[],levels=[];
 const actor={alive:true,position:{x:-78.65,y:1,z:92.8}};
 const audio={Ambience:id=>calls.push(id),SetAmbienceLayerLevel:(...args)=>levels.push(args),
  Play:(id,options)=>{calls.push({id,...options});return {duration:7};},
  MoveVoice:(_voice,position)=>moved.push({...position}),StopVoice:voice=>stopped.push(voice)};
 const sound=new FirstLevelCarriageSound(audio,()=>[{actor,carIndex:1,slot:CARRIAGE_SOUND.cheerSlots[0]}]);
 sound.Start();sound.Handle(CARRIAGE_SOUND.reactions[0].id);
 assert.equal(calls[0],CARRIAGE_SOUND.preset);
 assert.equal(calls[1].id,CARRIAGE_SOUND.cheerCue);
 assert.equal(calls[1].position.y,2.2,'rear reactions come from mouth height');
 actor.position.z-=6;sound.Update(1);
 assert.equal(moved[0].z,actor.position.z,'the source follows the moving train passenger');
 sound.Handle('CarriageUneasy');assert.equal(levels.at(-1)[1],CARRIAGE_SOUND.uneasyScale);
 sound.Impact();assert.equal(stopped.length,1);assert.equal(calls.at(-1),'trainInterior');
 sound.Stopped();assert.equal(calls.at(-1),'firstLevelFront','rolling wheels stop with the actual train');
 sound.Start();assert.equal(levels.at(-1)[1],1,'restart restores the lively crowd');
 const manifest=JSON.parse(fs.readFileSync(new URL('./Audio/Amb/Data_AmbManifest.json',import.meta.url)));
 for(const asset of CARRIAGE_SOUND_ASSETS){
  const entry=manifest.carriageSources[asset.id];
  const bytes=fs.readFileSync(new URL('./Audio/Amb/'+asset.file,import.meta.url));
  assert.equal(entry.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(entry.promptHash,crypto.createHash('sha256').update(asset.prompt).digest('hex'));
  assert.equal(entry.requests,1);assert.ok(entry.continuous&&entry.seconds>2);
 }
}
assert.equal(FIRST_LEVEL_STAGES.length,18);
assert.deepEqual(FIRST_LEVEL_STAGES.flatMap(stage=>stage.steps),MISSION_STAGES.slice(0,-1).map(step=>step.id));
for (const phase of FIRST_LEVEL_STAGES) {
  const saved=BuildFirstLevelCheckpoint(phase.number), step=MISSION_STAGES[saved.index];
  assert.equal(ResolveFirstLevelStage(phase.id),phase);
  assert.equal(FirstLevelStageForStep(step.id),phase);
  assert.ok(MISSION_STAGES.slice(0,saved.index).flatMap(s=>s.requirements).every(f=>saved.facts.includes(f)));
  assert.ok(step.requirements.some(f=>!saved.facts.includes(f)),"destination must still require gameplay: "+phase.id);
  const column=new FirstLevelMissionColumn(); column.Restore(saved.column);
  const before=column.Snapshot();column.Update(.1);assert.ok(Number.isFinite(column.zhou.x));
  assert.deepEqual(BuildFirstLevelCheckpoint(phase.id).column,before,"cached starts cannot be mutated by a run");
  if(phase.number>=11)assert.ok(column.gateOpen&&column.litters.every(l=>l.passedGate));
  if(phase.number>=13)assert.equal(column.loadEvents.length,R.zhouQueueIndex);
  if(phase.number===14)assert.equal(column.zhou.state,"carried");
  if(phase.number===17)assert.equal(column.zhou.state,"placed");
  if(phase.number===18)assert.equal(column.zhou.health,0);
}
for(const value of [0,19,-1,1.5,"Complete","Carry",null])assert.throws(()=>ResolveFirstLevelStage(value));
console.log("ok 18 Notion stages, complete prior facts, live destination gates and independent reconstructed columns");
flow.Start();
for (const stage of MISSION_STAGES.slice(0, -1)) {
  assert.equal(flow.stage.id, stage.id);
  flow.Update(600);
  assert.equal(flow.stage.id, stage.id, "Elapsed time alone cannot pass a mission");
  for (const fact of stage.requirements) flow.Record(fact);
  const snapshot = flow.Snapshot(),
    restored = new FirstLevelMissionFlow();
  restored.Restore(snapshot);
  assert.deepEqual(restored.State(), flow.State());
  flow.Update(1);
}
assert.equal(flow.completed, true);
console.log("ok all mission gates require recorded gameplay facts and restore exactly");
{
  const Position=(x,z)=>({x,y:0,z,clone:()=>({x,y:0,z,project(){this.x=0;this.y=0;this.z=0;}})});
  const enemies=[...Array(8)].map((_,i)=>({id:i+1,missionId:`Enemy${i}`,alive:true,
    position:Position(0,i===7?3:40+i),stance:0,missionEncounter:"front"}));
  const r={time:0,flow:{stage:{id:"Support"}},enemies:new Map(enemies.map(a=>[a.id,a])),
    player:{position:Position(0,0),EyePosition:Position(0,0),camera:{}},Point:p=>p,BlocksSight:()=>false};
  const opening=new FirstLevelOpening(r);
  for(let slot=0;slot<8;slot++){
    r.time=slot*OPENING.fireSlotSeconds;opening.FireWindows();
    assert.equal(enemies[7].missionFireHold,false,"close enemy keeps a firing window across distant rotations");
    assert.ok(enemies.filter(a=>!a.missionFireHold).length<=OPENING.playerFireLimit);
  }
  r.BlocksSight=(from)=>from===enemies[7].position;opening.FireWindows();
  assert.equal(enemies[7].missionFireHold,true,"wall-blocked close enemy cannot displace visible shooters");
  for(const [i,a] of enemies.entries())a.missionFireGroup=i===6?'Rail':'Flank';
  for(let slot=0;slot<8;slot++){
    r.time=slot*OPENING.fireSlotSeconds;opening.FireWindows();
    assert.ok(enemies.filter(a=>!a.missionFireHold).some(a=>a.missionFireGroup==='Rail'),
      "the second visible direction cannot be starved by a larger first team");
    assert.ok(enemies.filter(a=>!a.missionFireHold).length<=OPENING.playerFireLimit);
  }
}
{
  const facts=new Map(),calls=[];
  const r={column:{zhou:{id:"Zhou",health:100,visible:false}},Has:id=>facts.has(id),Record:(id,detail)=>facts.set(id,detail),
    Point:p=>p,MoveActor:()=>calls.push("move"),OnPlayerDown:()=>calls.push("fail"),MissionFailure:id=>calls.push(id),
    emplacement:{NpcVacate:()=>calls.push("vacate")},ai:{SetStance(){},Remove:()=>calls.push("remove")}};
  const opening=new FirstLevelOpening(r);
  opening.zhou={id:54,alive:true,health:80,lastFire:5,position:{...OPENING.zhouGunSeat},yaw:0};
  opening.UpdateZhou();
  assert.ok(calls.includes("move")&&!facts.has("zhouGunWounded"),"an early actual wound makes Zhou leave the gun, not wait under fire for later gates");
  opening.zhou.position={...OPENING.zhouRest};opening.UpdateZhou();
  assert.equal(r.column.zhou.health,80,"representation transfer preserves actual injury");
  assert.ok(facts.get("zhouGunWounded").alive&&calls.includes("remove"));
  facts.clear();calls.length=0;opening.zhou.alive=false;opening.zhou.health=0;
  opening.UpdateZhou();
  assert.ok(facts.has("zhouGunKilled")&&!facts.has("zhouGunWounded")&&calls.includes("fail"),"actual death fails the mission instead of becoming a living litter");
}
{
  const facts=new Set(['frontRifleDefense','rifleWithdrawalResolved']),shells=[];
  const r={time:100,Has:id=>facts.has(id),Record:id=>facts.add(id),Point:(p,y=0)=>({...p,y}),
    RespondToGrenade:()=>false,RespondToContact:()=>false,Defend(){},
    combat:{FireShell:(from,to,options)=>shells.push({from,to,options})}};
  const opening=new FirstLevelOpening(r);
  opening.zhou={id:54,alive:true,health:100,lastFire:5,position:{...OPENING.zhouGunSeat},yaw:0};
  opening.UpdateZhou();shells[0].options.OnImpact();
  assert.ok(facts.has('zhouGunBlast')&&!facts.has('zhouGunWounded'),'a harmless physical impact cannot grant the wound');
  r.time+=OPENING.zhouShell.retryAfterS-.01;opening.UpdateZhou();assert.equal(shells.length,1);
  r.time+=.02;opening.zhou.position.x+=1;opening.UpdateZhou();assert.equal(shells.length,2);
  assert.notDeepEqual(shells[1].from,shells[0].from,'a missed round is corrected to a steeper source');
  assert.equal(shells[1].to.x,opening.zhou.position.x+OPENING.zhouShell.offsetX,'correction observes the moving gunner');
  assert.equal(opening.zhou.health,100);assert.ok(!facts.has('zhouGunWounded'),'retry neither injects damage nor bypasses the gate');
}
for(const [index,step] of MISSION_STAGES.filter(s=>!["TrenchEntry","Shelter"].includes(s.id)).entries()){
  const legacy={version:1,index,time:42,stageTime:2,facts:[],log:[]};
  const restored=new FirstLevelMissionFlow();restored.Restore(legacy);
  assert.equal(restored.stage.id,step.id,"v1 index migrates through the old stage order");
  restored.Restore({...legacy,log:[{kind:"stage",id:step.id,time:40}]});
  assert.equal(restored.stage.id,step.id,"v1 log preserves the named stage");
}
const stable=new FirstLevelMissionFlow();stable.Restore({version:2,stageId:"Shelter",index:0,time:1,stageTime:0,facts:["trenchCleared"],log:[]});
assert.equal(stable.stage.id,"Shelter","v2 stable stage id overrides positional index");
const terrain = CreateP012Terrain(MISSION_LAYOUT);
for (const [x, z] of [
  [-24, -53],
  [-8, -106],
  [12, -124],
  [A.retreatA.x, A.retreatA.z],
])
  assert.ok(SampleMissionTerrain(x, z) < -0.8, "Excavated soil is below natural ground");
for (const point of Object.values(A)) assert.ok(Number.isFinite(terrain.SampleHeight(point.x, point.z)));
assert.ok(!MISSION_LAYOUT.blocks.some((block) => block.semantic === "ground"));
assert.equal(FIRST_LEVEL_MISSION_PHASE.whitebox.fullMission, true);
assert.ok(SampleMissionTerrain(135,90)>2.8 && SampleMissionTerrain(-204,90)>3.8,
  "Peripheral earth banks frame the plain through the same physical heightfield");
console.log("ok shared terrain, excavated trenches, structural floors only");
// The railway is a PCG spec on the shared heightfield, not boxes at an absolute height
// (the old rails sat at y=0.76 over ~0 m soil and floated 0.7 m above their sleepers).
{
  assert.equal(MISSION_LAYOUT.railway, MISSION_RAILWAY, "the whitebox field builds the layout's railway spec");
  assert.ok(!MISSION_LAYOUT.blocks.some(block => /^Rail(?:Sleeper)?-?\d/.test(block.id)), "no hand-placed rail or sleeper boxes");
  const railway = MakeRailwayProfile(MISSION_RAILWAY, (x, z) => terrain.SampleHeight(x, z));
  for (let s = 0; s <= railway.path.length; s += 1) {
    const p = railway.path.At(s), soil = terrain.SampleHeight(p.x, p.z);
    const railTop = railway.RailTopAt(s) - soil;
    assert.ok(railTop > 0.2 && railTop < 0.42, `rail top stays low on the soil at z=${p.z.toFixed(1)}: ${railTop.toFixed(3)}`);
  }
  const wheels = MISSION_LAYOUT.blocks.filter(block => /^Station(?:Car\dWheel|EngineWheel)/.test(block.id));
  assert.equal(wheels.length, 3 * 8 + 8, "every car and engine wheel is seated");
  for (const wheel of wheels)
    assert.ok(Math.abs(wheel.y - wheel.h / 2 - railway.RailTopNear(wheel.x, wheel.z)) < 0.01, `${wheel.id} stands on the rail top`);
  console.log("ok railway is a low PCG track and the parked train stands on it");
}
const tacticalRoutes = Object.fromEntries(Object.entries(MISSION_TACTICS).map(([id, plan]) => [id,
  [Object.values(MISSION_ENCOUNTERS).flat().find(spec => spec.id === id), ...plan.points]]));
for(const spec of [...MISSION_ENCOUNTERS.retreat,...MISSION_ENCOUNTERS.air])
  tacticalRoutes[spec.id+"Pursuit"]=[spec,...MISSION_PURSUIT_ROUTE.slice(MissionRouteNextIndex(MISSION_PURSUIT_ROUTE,spec))];
// Bounding-assault lanes: every front rifleman and every wave drop point must rush between lines without cutting a cover block.
// FRONT_ASSAULT_STARTS is the single roster the cover rows are built around and the runtime spawns
// from; walking it here is what keeps the three in step.
assert.deepEqual(MISSION_ENCOUNTERS.front,[...FRONT_FIELD_MEN,...FRONT_RESERVES],"the front encounter roster includes every assault and supporting actor");
const reserveLanes=Object.fromEntries(FRONT_RESERVES.map(spec=>[spec.id,[spec,...FrontReserveLane(spec.x,spec.z)]]));
assert.equal(Object.keys(reserveLanes).length,R.frontReserveCount);
const assaultLanes=Object.fromEntries(FRONT_ASSAULT_STARTS.map(start=>
  ["Assault"+start.id,[start,...FrontAssaultLane(start.x,start.z)]]));
assert.ok(Object.values(assaultLanes).every(route=>route.length>=2&&route.at(-1).z===FRONT_ASSAULT.lines.at(-1)),"every assault lane ends on the last bound line");
assert.ok(Object.keys(assaultLanes).length>=24,"most front riflemen and every wave drop point get a bounding lane: "+Object.keys(assaultLanes).length);
const reliefRoutes=Object.fromEntries(P.reliefPositions.map((point,i)=>["Relief"+i,[MISSION_TRAIN.cars[2].muster[i],...P.reliefApproach,{x:point.x,z:-123},point]]));
for (const [name, route] of Object.entries({ ...MISSION_ROUTES, ...Object.fromEntries(MISSION_TERRAIN.trenches.filter(t=>t.role).map(t=>[t.id,t.points])), ...tacticalRoutes, ...assaultLanes, ...reserveLanes, ...reliefRoutes, ...Object.fromEntries(P.guardWithdrawalRoutes.map((route,i)=>["Guard"+i,route])) })) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      distance = Math.hypot(a.x - b.x, a.z - b.z);
    for (let d = 0; d <= distance; d += 0.4) {
      const t = d / distance,
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t,
        y = SampleMissionTerrain(x, z);
      for (const box of MISSION_LAYOUT.blocks) {
        if (MISSION_LAYOUT.walkableSurfaces.some((surface) => surface.id === box.id)) continue;
        const dx=x-box.x, dz=z-box.z, cosine=Math.cos(box.ry||0), sine=Math.sin(box.ry||0);
        const blocked =
          Math.abs(dx*cosine-dz*sine) < box.w / 2 + 0.35 &&
          Math.abs(dx*sine+dz*cosine) < box.d / 2 + 0.35 &&
          box.y + box.h / 2 > y + 0.3 &&
          box.y - box.h / 2 < y + (["bundle","bundleReturn","ordersRejoin"].includes(name) && box.id.startsWith("BundleCrawl") ? .88 : 1.7);
        assert.equal(
          blocked,
          false,
          `${name} capsule route intersects ${box.id} at ${x.toFixed(1)},${z.toFixed(1)}`,
        );
      }
    }
  }
}
const frontCover=MISSION_LAYOUT.blocks.filter(block=>block.id.startsWith("FrontCover"));
for(const wall of [...["FrontTraverseBlastScreen","BundleParapet","FlankParapet","MachineGunSideCover-1","MachineGunSideCover1"]
  .map(id=>{const found=MISSION_LAYOUT.blocks.find(b=>b.id===id);assert.ok(found,"hand-built cover survives generic route cleanup: "+id);return found;}),...frontCover]){
  for(const x of [-1,0,1])for(const z of [-1,0,1])assert.ok(wall.y-wall.h/2<=SampleMissionTerrain(wall.x+x*wall.w/2,wall.z+z*wall.d/2),"cover foundations follow the slope: "+wall.id);
}
console.log("ok authored capsule routes clear walls, crates and gun supports");
// ---------------------------------------------------------------------------
// Front assault cover (docs/Data_FrontCover.md)
// ---------------------------------------------------------------------------
// The gate behind "far enemies take cover": a bound line the AI can reach with nothing to kneel
// behind is the open-field pose the capture caught. These assertions hold the two halves together
// - the cover has to be there, and the rush lane still has to get past it.
{
  const columns=FRONT_ASSAULT.blockedX.map(([a,b])=>[a,b]).sort((left,right)=>left[0]-right[0]);
  assert.deepEqual(columns,FRONT_COVER.columns.map(column=>[...column.x]),"blockedX is exactly the cover columns, in order");
  for(const [index,[a,b]] of columns.entries()){
    // A bound moves at most 2 x lateralM in x and ClearLaneX only ever pushes a man 0.6 m clear,
    // so a column this wide cannot be straddled: both ends of every rush stay on one side of it.
    assert.ok(b-a>=FRONT_COVER.minColumnM,`cover column ${FRONT_COVER.columns[index].id} is at least minColumnM wide: ${(b-a).toFixed(1)}`);
    assert.ok(b-a>2*FRONT_ASSAULT.lateralM,"a lane jitter cannot step over a cover column");
    if(index)assert.ok(columns[index-1][1]<a,"cover columns never overlap");
    const build=FRONT_COVER.columns[index].coverX||FRONT_COVER.columns[index].x;
    assert.ok(build[0]>=a&&build[1]<=b,"a column only ever builds inside its own lane span");
  }
  for(const [name,route] of Object.entries(assaultLanes))for(const point of route.slice(1)){
    assert.ok(point.x>=FRONT_ASSAULT.xRange[0]&&point.x<=FRONT_ASSAULT.xRange[1],name+" bounds inside the assault span");
    for(const [a,b] of columns)assert.ok(!(point.x>a&&point.x<b),`${name} never bounds into a cover column at x=${point.x.toFixed(1)}`);
  }
  // Every bank is a crouch-and-hide cover: too tall to walk over, too low to hide a standing man.
  const points=frontCover.map(block=>({x:block.x,z:block.z,h:block.h}));
  assert.ok(points.length>=90,"the four rows are actually built: "+points.length);
  for(const block of frontCover){
    assert.ok(block.h>TRAVERSAL.stepMax&&block.h<COVER.tallM,`${block.id} stays in the crouch-and-hide band: ${block.h.toFixed(2)}`);
    assert.ok(block.h>=COVER.minUsefulM,block.id+" registers as a usable cover point");
    assert.ok(block.cover&&block.d/2<COVER.standoffM-.2,block.id+" is thin enough that its hide position clears the face");
  }
  for(const row of FRONT_COVER.rows){
    assert.ok(row.z>row.line&&row.z-row.line<=2.5,`the ${row.id} row sits 0-2.5 m south of its line, between the man and the Chinese line`);
    const xs=points.filter(point=>Math.abs(point.z-row.z)<.6).map(point=>point.x).sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++)assert.ok(xs[i]-xs[i-1]>=COVER.minAllySpacingM,
      `${row.id} cover points stay minAllySpacingM apart so a squad line can hold neighbours: ${(xs[i]-xs[i-1]).toFixed(2)}`);
  }
  // Coverage: how much of a bound line has a registered cover point inside assaultCoverSearchM.
  // Before this pass the four lines read 30 / 68 / 48 / 57 %; the capture that started it found
  // 2 of 31 live Japanese in the 46-74 m band holding a cover point at all.
  const registered=MISSION_LAYOUT.blocks.filter(block=>block.cover&&block.h>=COVER.minUsefulM);
  let covered=0,samples=0;
  for(const line of FRONT_ASSAULT.lines){
    const near=registered.filter(block=>Math.abs(block.z-line)<=R.assaultCoverSearchM);
    let hit=0,count=0;
    for(let x=FRONT_ASSAULT.xRange[0];x<=FRONT_ASSAULT.xRange[1];x+=1){
      count++;
      if(near.some(block=>Math.hypot(block.x-x,block.z-line)<=R.assaultCoverSearchM))hit++;
    }
    covered+=hit;samples+=count;
    assert.ok(hit/count>=.7,`bound line ${line} has cover within assaultCoverSearchM over 70% of its span: ${(hit/count*100).toFixed(1)}%`);
  }
  assert.ok(covered/samples>=.7,"the whole assault front is covered: "+(covered/samples*100).toFixed(1)+"%");
  // The tank advances by interpolation with no collision response, so its lane stays clear of the
  // new banks whichever target it is tracking. Half hull width is 1.2 m: the collider in
  // Script_FirstLevelMissionView is h=[1.075,1.28,2.15] and it drives along its own length.
  // (FieldRuin1 already stands in the default advance; that predates this pass and is left alone.)
  for(const destinationX of [R.tankPursuitBounds.minX,36,R.tankPursuitBounds.maxX]){
    const from=P.tankStart,to={x:destinationX,z:R.tankFirstFireZ},length=Math.hypot(to.x-from.x,to.z-from.z);
    for(let travelled=0;travelled<=length;travelled+=.25){
      const t=travelled/length,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      for(const block of frontCover)assert.ok(Math.abs(block.x-x)>=block.w/2+1.2||Math.abs(block.z-z)>=block.d/2+1.2,
        `${block.id} stands in the tank advance to x=${destinationX}`);
    }
  }
}
console.log("ok four cover rows fill the assault front, the rush lanes still clear them and the tank lane stays open");
// Each waiting team occupies an authored work area, with clear paths for both bearer ends.
import {MISSION_CROWD_AREAS as areas} from './Data_FirstLevelMissionCrowd.mjs';import {MISSION_LAYOUT as crowdLayout} from './Data_FirstLevelMissionLayout.mjs';import {SampleMissionTerrain as crowdGround} from './Data_FirstLevelMissionTerrain.mjs';import {MissionCarryRoutePoint as crowdPoint,MissionRouteLength as crowdLength} from './Script_FirstLevelMissionColumn.mjs';
const bad=[];for(const a of areas)for(const [kind,points] of [['litter',a.pockets],['walker',a.walkerPockets]])for(const [i,p] of points.entries()){const routes=[[a.trigger,{x:a.trigger.x,z:a.entryZ},{x:p.x,z:a.entryZ},p],[p,{x:p.x,z:a.exitZ},a.merge]];for(const route of routes)for(let d=0;d<crowdLength(route);d+=.3){const c=crowdPoint(route,d);for(const offset of kind==='litter'?[-1.28,0,1.28]:[0]){const x=c.x-Math.sin(c.yaw)*offset,z=c.z-Math.cos(c.yaw)*offset,y=crowdGround(x,z);for(const b of crowdLayout.blocks){if(b.solid===false||crowdLayout.walkableSurfaces.some(s=>s.id===b.id))continue;const dx=x-b.x,dz=z-b.z,co=Math.cos(b.ry||0),si=Math.sin(b.ry||0);if(Math.abs(dx*co-dz*si)<b.w/2+.32&&Math.abs(dx*si+dz*co)<b.d/2+.32&&b.y+b.h/2>y+.3&&b.y-b.h/2<y+1.7)bad.push({area:a.id,kind,i,box:b.id,x,z});}}}}
assert.deepEqual(bad,[],"all staging routes clear real walls and furniture, including both bearers");
assert.ok(areas.every(a=>a.walkerPockets.length===R.walkingWoundedCount+R.medicCount+R.civilianCount));
const c = new FirstLevelMissionColumn();
assert.equal(c.litters.length,R.litterCount,"one squad escorts the tuned litter count (seven since 2026-09-16)");
assert.equal(c.walkers.filter(w=>w.kind==="medic").length,0,"no uniformed escort besides the squad walks with the column");
assert.ok(c.litters.every(l=>l.bearers.length===2),"each litter has exactly two bearer slots");
assert.deepEqual(c.walkers.map(w=>w.kind),["civilian","civilian"],"only the two rescue civilians accompany the litters (2026-09-16: medics cut)");
function CheckStagingClearance(column){
  const teams=column.litters.filter(l=>l.staging);
  for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++)
    assert.ok(Math.hypot(teams[i].x-teams[j].x,teams[i].z-teams[j].z)>2,"arriving and departing litters do not pass through resting teams");
}
c.Activate();
for (let i = 0; i < 6000; i++){c.Update(0.1);if(i%5===0)CheckStagingClearance(c);}
assert.equal(c.State().gatePassed, 0);
assert.ok(c.litters.every(l=>l.staging?.mode==="resting"&&l.staging.area==="courtyard"));
assert.ok(Math.max(...c.litters.map(l=>l.x))-Math.min(...c.litters.map(l=>l.x))>25,"waiting litters occupy the width of the sheltered yard");
assert.ok(c.walkers.every(w=>w.staging?.mode==="resting"),"walkers reach separate waiting places");
const waitingStart=c.walkers.map(w=>({x:w.x,z:w.z})),waitingTravel=c.walkers.map(()=>0);
for(let frame=0;frame<240;frame++){c.Update(.1);c.walkers.forEach((w,i)=>waitingTravel[i]=Math.max(waitingTravel[i],Math.hypot(w.x-waitingStart[i].x,w.z-waitingStart[i].z)));}
assert.ok(waitingTravel.filter(d=>d>.15).length>=Math.ceil(c.walkers.length*.75),"waiting wounded and medics make staggered short steps");
assert.ok(waitingTravel.every(d=>d<1.1),"waiting people remain near their assigned places");
c.gateOpen = true;
for (let i = 0; i < 6000; i++){c.Update(0.1);if(i%5===0)CheckStagingClearance(c);}
assert.equal(c.State().gatePassed, R.litterCount);
c.loading = true;
let transferReadyAt=null;
for (let i = 0; i < 6000; i++){c.Update(0.1);if(transferReadyAt===null&&c.TransferReady())transferReadyAt=(i+1)*.1;}
// 2026-09-16: with the medics cut there is no triage walk to the loading crew any more, so the
// physical load lands at ~118 s instead of ~132 s; the stage clock (transferSeconds) still holds
// the planned two-to-four-minute pacing, this only guards the column against stalling or racing.
assert.ok(transferReadyAt>=110&&transferReadyAt<=240,"physical staging and loading fit the planned roughly two-to-four-minute transfer");
assert.equal(c.State().loaded, R.zhouQueueIndex);
assert.equal(c.departed, 2);
assert.equal(c.QueueAhead(), 0);
assert.equal(c.zhou.loaded, false);
assert.ok(c.vehicles.slice(0, 2).every((cart) => cart.z > 180));
assert.equal(c.vehicles[2].load.length, R.zhouQueueIndex % R.cartCapacity);
const zhouBefore = { x: c.zhou.x, z: c.zhou.z };
assert.ok(c.BeginZhouBoarding());
for (let i = 0; i < 50; i++) c.Update(0.1);
assert.ok(Math.hypot(c.zhou.x - zhouBefore.x, c.zhou.z - zhouBefore.z) > R.boardingWitnessM);
assert.equal(
  c.zhou.loaded,
  false,
  "Zhou is physically taken to the loading bay before the raid interrupts boarding",
);
const saved = c.Snapshot(),
  copy = new FirstLevelMissionColumn();
copy.Restore(saved);
assert.deepEqual(copy.State(), c.State());
c.AirDamage();
const originalBearerBodies=structuredClone(c.bearerCasualties);
// The raid fells up to two of the litters still waiting behind Zhou plus Zhou's own rear bearer;
// with seven litters and five loaded ahead of him only one litter is left to fell (2026-09-16).
const raidLitters=Math.min(2,R.litterCount-R.zhouQueueIndex-1);
assert.equal(originalBearerBodies.length,raidLitters+1,"every raid casualty is recorded where they fell");
assert.equal(c.litters.filter((l) => l.state === "fallen").length, raidLitters);
assert.ok(c.vehicles.some((cart) => cart.overturned));
c.zhou.state = "waiting";
c.zhou.bearers = [75, 75];
for (const litter of c.litters) if (litter.state === "fallen") litter.state = "waiting";
c.StartRetreat();
for (const point of [A.retreatA, A.retreatB, A.retreatC]) {
  const living = c.litters.filter((l) => !l.loaded && l.health > 0),
    pass = c.RetreatLimit(point) - 12,
    cap = pass + living.length * R.litterSpacingM + 5;
  for (let i = 0; i < 4000; i++) c.Update(0.1, { maxProgress: cap });
  assert.ok(
    living.every((l) => l.progress > pass),
    "Every surviving litter must physically pass the rearguard position",
  );
}
c.StartReception();
for (let i = 0; i < 4000; i++) c.Update(0.1);
assert.ok(c.litters.filter((l) => !l.loaded && l.health > 0).every((l) => l.received));
assert.ok(Math.hypot(c.zhou.x - A.zhouPickup.x, c.zhou.z - A.zhouPickup.z) < 0.01);
c.StartFinalExit();
for (let i = 0; i < 4000; i++) c.Update(0.1);
assert.ok(c.walkers.filter((w) => w.kind === "medic" && w.health > 0).every((w) => w.escaped));
assert.deepEqual(c.bearerCasualties.slice(0,originalBearerBodies.length),originalBearerBodies,"fallen bearers stay at the original position after rescue and departure");
console.log(
  "ok tuned litter count, closed gate, physical load queue, 2 departing carts, interrupted transfer, three passages, reception and actual rear exit",
);
// 2026-09-16: no medics ride along any more, so a litter that loses a bearer with nobody left to
// replace him is dragged on by the surviving bearer instead of parking the whole retreat.
{
  const short = new FirstLevelMissionColumn();
  short.Activate(); short.gateOpen = true;
  for (const walker of short.walkers) walker.health = 0;
  const litter = short.litters.at(-1);
  litter.bearers[1] = 0;
  const before = litter.progress;
  for (let i = 0; i < 300; i++) short.Update(.1, { moving: true, routeSafe: true });
  assert.ok(litter.dragging, "a bearer-short litter with no helper left is dragged, not parked");
  assert.ok(litter.progress > before + 5, "the dragged litter still advances");
  assert.ok(short.litters.slice(0, -1).every(l => !l.dragging), "full crews are never flagged as dragging");
  litter.bearers[1] = 100;
  short.Update(.1, { moving: true, routeSafe: true });
  assert.ok(!litter.dragging, "a refilled crew stops dragging");
}
// Survivor counts change the number of useful loads; missing people cannot fill a cart.
for (const lost of Array.from({length:R.zhouQueueIndex+1},(_,i)=>i)) {
  const reduced = new FirstLevelMissionColumn();
  reduced.Activate(); reduced.gateOpen = true; reduced.loading = true;
  for (let i = 0; i < lost; i++) reduced.litters[i].health = 0;
  for (let i = 0; i < 10000; i++) reduced.Update(.1);
  assert.ok(reduced.TransferReady(), 'Surviving transport reaches a real departure after '+lost+' losses');
  assert.ok(reduced.litters.slice(0, R.zhouQueueIndex).filter(l => l.health > 0).every(l => l.loaded));
  assert.ok(reduced.litters.slice(0, lost).every(l => l.health === 0 && !l.loaded), 'Casualties are never manufactured as passengers');
  assert.ok(reduced.BeginZhouBoarding());
}
const movingCartColumn = new FirstLevelMissionColumn();
movingCartColumn.Activate(); movingCartColumn.gateOpen = true; movingCartColumn.loading = true;
let sawApproach = false, sawLift = false;
for (let i = 0; i < 10000; i++) {
  movingCartColumn.Update(.1);
  sawApproach ||= movingCartColumn.vehicles.some(cart => cart.state === 'approaching' && cart.approachProgress > 0);
  sawLift ||= movingCartColumn.litters.some(l => l.liftFraction > 0 && l.liftFraction < 1);
}
assert.ok(sawApproach && sawLift, 'Next cart drives into the bay and litters visibly lift aboard');
console.log('ok partial survivor loads, sequential bay arrivals and continuous boarding');
const rescueColumn=new FirstLevelMissionColumn();
rescueColumn.Activate();rescueColumn.gateOpen=true;
for(let i=0;i<5000;i++)rescueColumn.Update(.1);
const walkerPoints=rescueColumn.walkers.map(w=>[w.x,w.z]);
for(let i=0;i<walkerPoints.length;i++)for(let j=i+1;j<walkerPoints.length;j++)
  assert.ok(Math.hypot(walkerPoints[i][0]-walkerPoints[j][0],walkerPoints[i][1]-walkerPoints[j][1])>1,'walking wounded hold distinct queue positions');
const lostBearerLitter=rescueColumn.litters[4];lostBearerLitter.bearers[0]=0;
rescueColumn.Update(.1);
const helper=rescueColumn.walkers.find(w=>w.rescueTarget?.litter===lostBearerLitter.id);
assert.ok(helper&&lostBearerLitter.bearers[0]===0,'requesting a helper does not instantly replace a casualty');
let approachTravel=0;
for(let i=0;i<3000&&!helper.assigned;i++){
  const before={x:helper.x,z:helper.z};rescueColumn.Update(.1);
  const step=Math.hypot(helper.x-before.x,helper.z-before.z);approachTravel+=step;
  assert.ok(step<=R.bearerApproachMps*.1+R.bearerReachM+R.litterSpeedMps*.1+.001,'helper walks every metre to the actual handle');
}
assert.ok(helper.assigned===lostBearerLitter.id&&approachTravel>3,'the same medical worker takes the vacant handle');
rescueColumn.StartRetreat();for(let i=0;i<7000;i++)rescueColumn.Update(.1);
assert.ok(Math.hypot(helper.x-lostBearerLitter.x,helper.z-lostBearerLitter.z)<1.7,'assigned helper travels with the same litter');
rescueColumn.StartReception();for(let i=0;i<4000;i++)rescueColumn.Update(.1);
rescueColumn.StartFinalExit();for(let i=0;i<4000;i++)rescueColumn.Update(.1);
assert.ok(helper.escaped&&lostBearerLitter.escaped,'medical identity completes the physical rear exit with its patient');
console.log('ok separate queues, physical medical approach and continuous bearer identity');
const lateRecovery=new FirstLevelMissionColumn();lateRecovery.Restore(saved);
lateRecovery.StartRetreat();for(let i=0;i<6000;i++)lateRecovery.Update(.1);
lateRecovery.StartReception();lateRecovery.Update(.1);
for(const mode of ['reception','exit']) {
  if(mode==='exit')lateRecovery.StartFinalExit();
  const patient=lateRecovery.litters.find(l=>!l.loaded&&!l.zhou&&l.health>0&&!(mode==='reception'?l.received:l.escaped));
  assert.ok(patient,'a surviving patient still travels in '+mode);
  const before={x:patient.x,z:patient.z};patient.bearers[0]=0;
  lateRecovery.Update(.1);
  assert.equal(Math.hypot(patient.x-before.x,patient.z-before.z),0,'a litter cannot travel without its bearer in '+mode);
  const substitute=lateRecovery.walkers.find(w=>w.rescueTarget?.litter===patient.id);
  assert.ok(substitute,'an available medical worker responds in '+mode);
  for(let i=0;i<5000&&patient.bearers[0]<=0;i++)lateRecovery.Update(.1);
  assert.ok(patient.bearers[0]>0&&substitute.assigned===patient.id,'actual replacement resumes '+mode);
  for(let i=0;i<6000;i++)lateRecovery.Update(.1);
  assert.ok(mode==='reception'?patient.received:patient.escaped,'the same patient finishes '+mode);
}
console.log('ok bearer casualties recover during reception and the final exit');
const localThreatColumn=new FirstLevelMissionColumn();localThreatColumn.Restore(saved);
// 2026-09-16: with seven litters only one unloaded patient waits behind Zhou before the raid, so
// take the raid first (it unloads the third cart) to get the two lanes this check needs, as in play.
localThreatColumn.AirDamage();
localThreatColumn.zhou.state="waiting";localThreatColumn.zhou.bearers=[75,75];
for(const litter of localThreatColumn.litters)if(litter.state==="fallen")litter.state="waiting";
localThreatColumn.StartRetreat();for(let i=0;i<6000;i++)localThreatColumn.Update(.1);
localThreatColumn.StartReception();for(let i=0;i<6000;i++)localThreatColumn.Update(.1);
localThreatColumn.StartFinalExit();
const departingPatients=localThreatColumn.litters.filter(l=>!l.zhou&&!l.loaded&&l.health>0);
localThreatColumn.Update(.2,{routeSafe:false,SafeAt:entry=>entry.id!==departingPatients[0].id});
assert.equal(departingPatients[0].exitProgress,0,'a patient in a threatened lane holds');
assert.ok(departingPatients[1].exitProgress>0,'sheltered patients still advance while another lane is threatened');
console.log('ok final evacuation responds to local threats without freezing the whole ward');
const casualtyColumn = new FirstLevelMissionColumn();
casualtyColumn.litters[0].health = 0;
casualtyColumn.litters[1].health = 12;
casualtyColumn.AirDamage();
assert.equal(casualtyColumn.litters[0].health, 0, "An air-raid event never revives a previous casualty");
assert.equal(casualtyColumn.litters[1].health, 12, "An air-raid event never heals an injured patient");
assert.equal(new Set(MISSION_DIALOGUE.map((cue) => cue.id)).size, MISSION_DIALOGUE.length);
for (const cue of MISSION_DIALOGUE) {
  assert.ok(MissionVoicePrompt(cue).includes(cue.lines[0].text));
  assert.ok(cue.lines.every((line) => MissionVoicePrompt(cue).includes(line.text)));
}
if (process.argv.includes("--audio")) {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json", import.meta.url), "utf8"),
  );
  for (const cue of MISSION_DIALOGUE) {
    const entry = manifest.cues[cue.id];
    const aligned=MISSION_VOICE_ALIGNMENT[cue.id];
    assert.equal(aligned.sha256,entry.sha256,cue.id+' timing is bound to this recording');
    assert.equal(aligned.lines.length,cue.lines.length);
    aligned.lines.forEach(([start,end],i)=>{
      assert.ok(start>=0 && end>=start && end<=entry.seconds+.02,cue.id+' source interval');
      if(start===end)assert.ok(aligned.note,'ambiguous interval must be explained');
      if(i)assert.ok(start>=aligned.lines[i-1][1],cue.id+' subtitles do not overlap');
    });
    assert.ok(entry?.continuous && entry.requests === 1 && entry.seconds > 0.5, cue.id);
    assert.equal(entry.speechRate??0,cue.speechRate??0,cue.id+' generation delivery rate matches the source');
    const sourceJson='['+cue.lines.map(line=>'{"who": '+JSON.stringify(line.who)+', "text": '+JSON.stringify(line.text)+'}').join(', ')+']';
    assert.equal(aligned.scriptSha256,crypto.createHash('sha256').update(sourceJson).digest('hex'),cue.id+' alignment uses the current complete text');
    const bytes=fs.readFileSync(new URL('./Audio/FirstLevel/'+cue.file,import.meta.url));
    assert.equal(bytes.length,entry.bytes,cue.id+' bytes');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,cue.id+' content hash');
    assert.equal(crypto.createHash('sha256').update(MissionVoicePrompt(cue)).digest('hex'),entry.promptHash,cue.id+' current complete script');
    if(cue.id==='ZhouDeath')assert.ok(entry.seconds>=8 && entry.seconds<=12.1,'whole death exchange fits the authored short scene');
  }
  const {VOICE_LINES}=await import("./Data_Voice.mjs");
  const barks=VOICE_LINES.filter(line=>line.side==="ija"&&line.kind!=="story");
  const barkManifest=JSON.parse(fs.readFileSync(new URL("./Audio/Data_SichuanBarkManifest.json",import.meta.url),"utf8"));
  assert.equal(barkManifest.model,"seed-audio-1.0");
  for(const line of barks){
    const entry=barkManifest.cues[line.key];
    assert.equal(line.dialect,"sichuan",line.key+" enemy barks use the requested dialect too");
    assert.equal(entry.text,line.text);assert.equal(entry.version,line.version);
    assert.equal(entry.dialect,line.dialect);assert.equal(entry.seconds,line.dur);
    assert.equal(entry.sha256,crypto.createHash("sha256").update(fs.readFileSync(new URL("./Audio/"+line.file,import.meta.url))).digest("hex"));
  }
  console.log(`ok all ${barks.length} autonomous enemy barks use current Sichuan recordings`);
}
console.log(process.argv.includes("--audio")
  ? `ok all ${MISSION_DIALOGUE.length} continuous audio assets, current script/file hashes and short death-scene duration`
  : "ok continuous dialogue prompts; audio assets require --audio acceptance");
// Source-range playback preserves pauses, queued cues and physical event gates.
{
  const offsets=[], done=[];
  const voice=new FirstLevelMissionVoice({
    audio:{PlayStoryVoice:(_key,options)=>{offsets.push(options.offset||0);return {duration:1};},StopStoryVoice(){}},
    hud:{Say(){}},Done:id=>done.push(id),
  });
  voice.manifest={cues:{ThreeMagazines:{seconds:3.109},TwoMagazines:{seconds:2.429}}};
  voice.Enqueue("ThreeMagazines");voice.Enqueue("TwoMagazines");
  voice.Update(0);voice.Update(.3);voice.Pause();voice.Update(10);
  assert.equal(voice.current.time,.3);
  voice.Resume();
  for(let i=0;i<400;i++)voice.Update(1/60);
  assert.deepEqual(done,["ThreeMagazines","TwoMagazines"]);
  assert.deepEqual(offsets,[0,.3,0]);
}
{
  const events=[],sources=[],done=[],facts=new Set();
  const voice=new FirstLevelMissionVoice({
    audio:{PlayStoryVoice:(key,options)=>{sources.push({key,...options});return {};},StopStoryVoice(){}},
    hud:{Say(){}},Done:id=>done.push(id),Ready:id=>facts.has(id),
    Event:id=>{if(id!=="TrainDialogueLine")events.push(id);},
  });
  voice.manifest=JSON.parse(fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json",import.meta.url)));
  const Step=()=>{for(let i=0;i<3600;i++)voice.Update(1/60);};
  voice.Enqueue("WreckImpact");Step();
  assert.equal(sources.length,0,"injury cries require a real impact");
  facts.add("trainNearShellImpact");Step();
  assert.deepEqual(done,["WreckImpact"]);
  voice.Enqueue("TrainShelling");Step();
  assert.equal(sources.length,1,"the rescue waits for Luo to regain his footing");
  facts.add("trainStopped");Step();assert.equal(sources.length,1);
  facts.add("trainLuoStanding");voice.Update(0);voice.Update(.2);
  voice.Pause();const paused=voice.State();voice.Update(10);assert.deepEqual(voice.State(),paused);voice.Resume();Step();
  assert.deepEqual(done,["WreckImpact","TrainShelling"]);
  assert.equal(events.filter(id=>id==="TrainRescue").length,1,"pause cannot repeat the physical rescue");
  voice.Enqueue("WreckExit");Step();assert.equal(done.length,2,"exit speech waits until player control is restored");
  facts.add("luoRescueComplete");Step();assert.deepEqual(done,["WreckImpact","TrainShelling","WreckExit"]);
  for(const key of ["MissionWreckImpact","MissionWreckExit"]){
    const takes=sources.filter(s=>s.key===key);assert.equal(takes.length,1);assert.equal(takes[0].offset,0);
  }
}
console.log("ok paused audio ranges, subtitle source timing, queued cues and shell-impact gates");

{
  let clock=0;const sources=[],parallelSources=[],rows=[],lineEvents=[],events=[],done=[];
  const audio={PlayStoryVoice:(key,options)=>{sources.push({key,...options});return {voice:{t:clock}};},
    StopStoryVoice(){},Play:(key,options)=>{const voice={key,t:clock,...options};parallelSources.push(voice);return voice;},
    StopVoice:voice=>{voice.stopped=true;},MoveVoice(){}};
  const voice=new FirstLevelMissionVoice({audio,Clock:()=>clock,
    hud:{SayLines:lines=>rows.push(lines.map(line=>({...line})))},Done:id=>done.push(id),
    Event:(id,cue,detail)=>{if(id==="TrainDialogueLine")lineEvents.push({cue,...detail});else events.push(id);},
  });
  voice.manifest=JSON.parse(fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json",import.meta.url)));
  voice.Enqueue("TrainPack");voice.Update(0);
  const Step=count=>{for(let i=0;i<count;i++){clock+=1/60;voice.Update(1/60);}};
  Step(480);const before=voice.State();voice.Pause();clock+=10;voice.Update(10);
  assert.equal(voice.State().sourceTime,before.sourceTime,"pausing freezes the packing source");
  assert.equal(voice.State().parallel[0].sourceTime,before.parallel[0].sourceTime,"pausing also freezes the simultaneous counting source");
  assert.ok(parallelSources[0].stopped,"pause stops the live companion voice");
  voice.Resume();Step(4200);
  assert.deepEqual(done,["TrainBanter","TrainPack"],"the complete counting exchange finishes before the packing exchange");
  assert.equal(sources.length,2,"the intact packing exchange only restarts to resume from pause");
  assert.equal(parallelSources.length,2,"the intact counting exchange only restarts to resume from pause");
  assert.equal(parallelSources[1].offset,before.parallel[0].sourceTime,"the simultaneous source resumes at its own exact offset");
  assert.ok(rows.some(lines=>lines.length===2&&lines.some(line=>["顺子","幺娃"].includes(line.speaker))&&lines.some(line=>line.speaker==="刘文财")),"both speaking actors have visible separate subtitles");
  for(const line of rows.flat())assert.equal(line.emphasis,["顺子","幺娃"].includes(line.speaker)?"lead":"aside",
    `${line.speaker}: packing leads the subtitle stack and the overlapping counting is an aside`);
  const utterances=rows.flat().filter(line=>line.started).map(line=>line.text);
  for(const id of ["TrainPack","TrainBanter"])for(const line of MISSION_DIALOGUE.find(cue=>cue.id===id).lines)
    assert.ok(utterances.includes(line.text),`${id}: every complete spoken line is retained in subtitle audit`);
  assert.equal(events.filter(id=>id==="TrainIncomingFire").length,0,"packing and counting cannot independently fire the volley");
  assert.equal(lineEvents.filter(event=>event.active&&event.cue==="TrainBanter").length,5,"every optional banter line emits an actor action");
  const late=new FirstLevelMissionVoice({audio,hud:{SayLines(){}},Position:()=>({x:0,z:0}),Listener:()=>({x:0,z:0})});
  late.manifest=voice.manifest;late.Enqueue("TrainPack");late.Update(0);
  late.current.sourceTime=late.manifest.cues.TrainPack.seconds-1;
  late.UpdateParallel(0);
  assert.equal(late.current.parallel.length,0,"late proximity cannot start a counting take that would be cut short");
  console.log("ok complete simultaneous packing/counting, dual subtitles, source-clock actions and pause/resume");
}

// Regression: 40 real recruit bodies plus Luo, stable carriage-local positions, all three doors.
assert.equal(MISSION_LAYOUT.blocks.filter(block=>/^StationCar\d.*Bench/.test(block.id)).length,0,"freight cars contain no bench geometry or bench colliders");
for(const preparedAnimation of [false,true]) {
  const dt = 1/60, actors = [];
  const Make = () => { const a = { id: actors.length, alive: true, position: {x:0,y:1.17,z:0}, goal:{x:0,z:0} }; actors.push(a); return a; };
  const originals = Array.from({length:6}, Make), guide = Make();
  let offset = R.trainTravelM, player = {...MISSION_TRAIN.player,z:MISSION_TRAIN.player.z+offset};
  const train = new FirstLevelMissionTrain({ Originals:()=>originals, Guide:()=>guide, Spawn:Make,
    Offset:()=>offset, Place:(a,p)=>Object.assign(a.position,p), Hold:a=>Object.assign(a.goal,a.position),
    Move:(a,p,speed)=>{assert.equal(a.missionTrainLife.weight,0,"passengers stand before physical walking");const d=Math.hypot(p.x-a.position.x,p.z-a.position.z);if(d>MISSION_TRAIN.arrivalRadiusM){const step=Math.min(speed*dt,d)/d;a.position.x+=(p.x-a.position.x)*step;a.position.z+=(p.z-a.position.z)*step;}},
    Player:()=>player, Exited:()=>{},
    // The authored samplers are independently inspected in CarriageAnimationTest.
    // The same anchors and physical queue must work both before and after loading.
    PrepareAnimation:preparedAnimation?()=>({ClipDuration:()=>MISSION_TRAIN.life.duckSeconds}):undefined,
  });
  train.Initialize(); train.Initialize();
  assert.equal(actors.length,41);assert.deepEqual(train.State().counts,[12,16,12]);
  assert.equal(actors.filter(a=>a.missionTrainLife.seated).length,0);
  assert.ok(actors.some(a=>a.missionTrainLife.posture==='stand')&&actors.some(a=>a.missionTrainLife.posture==='crouch'));
  assert.ok(actors.every(a=>['WallStandIdle','WallCrouchIdle'].includes(a.missionTrainLife.action)),"every passenger has an authored standing or crouching idle");
  assert.ok(actors.every(a=>a.missionTrainLife.animationPending===!preparedAnimation),"missing assets remain explicitly pending");
  for(const e of train.entries)if(e.actor.missionTrainLife.wall){
    assert.ok(Math.abs(Math.abs(e.actor.position.x-MISSION_TRAIN.centerX)-MISSION_TRAIN.life.wallAnchorM)<1e-8);
    if(e.actor.position.x>MISSION_TRAIN.centerX)assert.ok(Math.abs(e.actor.position.z-offset-MISSION_TRAIN.cars[e.carIndex].z)>=2.3-1e-8,"wall idles cannot lean on the open door");
    for(const block of MISSION_LAYOUT.blocks){
      if(!block.id.startsWith('StationCar'+e.carIndex)||block.solid===false||block.id.endsWith('Floor')||block.y+block.h/2<e.actor.position.y+.01)continue;
      const clearance=Math.hypot(Math.max(0,Math.abs(e.actor.position.x-block.x)-block.w/2),Math.max(0,Math.abs(e.actor.position.z-offset-block.z)-block.d/2));
      assert.ok(clearance>=.37,'wall-idle capsule retains clearance from '+block.id);
    }
  }
  const local=actors.map(a=>({x:a.position.x,z:a.position.z-offset}));
  for(let i=0;i<120;i++){offset-=R.trainTravelM/120;train.Translate(-R.trainTravelM/120);train.Update(dt,false);}
  for(const [i,a] of actors.entries()) {assert.ok(Math.abs(a.position.z-offset-local[i].z)<1e-8);assert.equal(a.position.x,local[i].x);assert.ok(a.p012OnMovingTrain);}
  for(let i=0;i<120;i++)train.Update(dt,false,true,null,false);
  assert.ok(actors.every(a=>a.missionTrainLife.posture==='crouch'&&a.missionTrainLife.action==='WallCrouchIdle'&&a.missionTrainLife.brace>.99),"the entire crowd is crouched during incoming fire before the near shell");
  assert.equal(train.impactSeconds,undefined,"the group crouch does not require an impact");
  for(const [i,a] of actors.entries())assert.ok(Math.abs(a.position.x-local[i].x)<1e-8&&Math.abs(a.position.z-offset-local[i].z)<1e-8,"ducking never teleports a body");
  player={x:-71,z:110};
  let ticks=0;
  for(;ticks<180/dt;ticks++) {
    train.Update(dt,true);
    for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)assert.ok(Math.hypot(actors[i].position.x-actors[j].position.x,actors[i].position.z-actors[j].position.z)>=.899,'train queue bodies do not overlap');
    if(train.entries.every(e=>e.arrived))break;
  }
  assert.equal(train.State().exited,40,JSON.stringify(train.State()));
  assert.ok(train.entries.every(e=>e.arrived),'all passengers physically reach their own muster point: '+JSON.stringify(train.State().entries.filter(e=>!e.arrived)));
  assert.ok(actors.every(a=>!a.p012OnMovingTrain&&a.missionUnloaded));
  console.log('ok train 12/16/12, authored wall idles '+(preparedAnimation?'ready':'pending')+', pre-impact whole-crowd crouch, all physical exits in '+(ticks*dt).toFixed(1)+'s');
}

{
 const calls=[], sound=new FirstLevelMissionBattleSound({Play:(cue,options)=>{calls.push({cue,...options});return null;}});
 // 【2026-09-09 这一条改了口径】原来断言的是「车厢里一声前线都不许有」。
 // 实测下来那正是用户报的问题：整整一分钟的车厢里只有三句对白，然后第一发
 // 凭空炸在车边上。现在的口径是**由远及近**，闸门有三道，一道都不能松：
 //   1. 头 24 秒仍然一声不许有（车厢自己的动静与那顿饭的对话独占）；
 //   2. 之后只许是**闷的**（airCut ≤ 340 Hz —— 隔着木板与铁皮）；
 //   3. 头一段必须比后一段轻（军列在往前线开，不是前线在靠近）。
 for(let i=0;i<48;i++)sound.Update(.5,"Train");
 assert.equal(calls.length,0,"the carriage stays clear of front sound for the first 24s");
 for(let i=0;i<40;i++)sound.Update(.5,"Train");
 const early=calls.slice();
 assert.ok(early.length>0,"the front creeps in through the carriage wall before the shelling");
 assert.ok(early.every(c=>c.airCut<=340&&c.soundField&&c.bus==="ambience"),
   "everything heard from inside the carriage is muffled: "+JSON.stringify(early[0]));
 for(let i=0;i<40;i++)sound.Update(.5,"Train");
 const late=calls.slice(early.length), Loudest=(rows,cue)=>Math.max(0,...rows.filter(c=>c.cue===cue).map(c=>c.volume));
 assert.ok(Loudest(late,"amb.cannonFar")>Loudest(early,"amb.cannonFar"),
   "the front grows as the train rolls north: "+JSON.stringify({early:Loudest(early,"amb.cannonFar"),late:Loudest(late,"amb.cannonFar")}));
 calls.length=0;
 for(let i=0;i<120;i++)sound.Update(.5,"Support");
 assert.ok(calls.some(c=>c.cue==="amb.cannonFar")&&calls.some(c=>c.cue==="type92")&&calls.some(c=>c.cue==="rifleNraFar"));
 assert.ok(calls.every(c=>c.position.z< -190&&c.soundField&&c.bus==="ambience"));
 const north=sound.sources.find(s=>s.spec.id==="NorthArtillery");
 assert.ok(north.count>=5,"sustained cannon pressure throughout the support trench");
 const supportVolume=calls.find(c=>c.cue==="rifleNraFar").volume, count=calls.length;
 for(let i=0;i<120;i++)sound.Update(.5,"South",true);
 const south=calls.slice(count);
 assert.ok(south.length>8&&south.find(c=>c.cue==="rifleNraFar").volume<supportVolume);
 const frozen=sound.State();sound.Update(10,"Complete");
 assert.deepEqual(sound.State(),frozen);
 console.log("ok directional sustained front combat, quieter south and no train/end leakage");
}
{
 let clock=10;const events=[],subtitles=[];
 const voice=new FirstLevelMissionVoice({audio:{PlayStoryVoice:()=>({voice:{t:clock+.005}}),StopStoryVoice(){}},
   hud:{Say:(_who,text)=>subtitles.push(text)},Clock:()=>clock,Event:id=>events.push(id)});
 voice.manifest=JSON.parse(fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json",import.meta.url)));
 voice.Enqueue("AircraftReturn");voice.Update(0);
 const diveAt=voice.current.plan.segments[0].events[0].at;
 voice.Update(30);assert.equal(voice.State().sourceTime,0,"gameplay stepping cannot outrun a live audio clock");
 clock+=diveAt-.1;voice.Update(.01);assert.deepEqual(events,[]);
 clock+=.2;voice.Update(.01);assert.deepEqual(events,["AircraftDiveOrder"]);
 voice.Pause();clock+=20;voice.Update(20);voice.Resume();clock+=.2;voice.Update(.01);
 assert.equal(events.length,1,"resuming the source never repeats the physical dive");
 console.log("ok real audio clock governs subtitles and second-aircraft dive order");
}

{
  const Actor=(x,z)=>({alive:true,position:{x,y:0,z},stance:0,suppression:0});
  const nearby=Actor(1,-12),behindWall=Actor(.1,-24),occluded=Actor(-1,-12),far=Actor(5,-12);
  const near=new Map();
  CollectBulletNearMisses({x:0,y:1.05,z:0},{x:0,y:0,z:-1},18,[nearby,behindWall,occluded,far],near);
  ApplyBulletNearMisses(near,(point,body)=>body.x<0);
  assert.ok(nearby.suppression>0,"real near miss suppresses adjacent enemy");
  assert.equal(behindWall.suppression,0,"stopped bullet cannot suppress beyond solid");
  assert.equal(occluded.suppression,0,"cover between path and body blocks suppression");
  assert.equal(far.suppression,0,"distant scenery fire cannot affect gameplay");
}

{
 const actor={x:0,z:0},target={x:0,z:-60};
 assert.equal(MissionGuideSpeed(actor,{x:0,z:40},target),0,"leader waits for a trailing player");
 assert.equal(MissionGuideSpeed(actor,{x:0,z:-40},target),R.squadCatchupMps,"only a trailing guide accelerates");
 assert.equal(MissionGuideSpeed(actor,{x:0,z:5},target),R.squadSpeedMps,"nearby guide keeps walking pace");
 assert.equal(MissionGuideSpeed(actor,{x:0,z:-40},target,true),0,"spacing still takes priority");
 assert.equal(MissionGuideSpeed({x:0,z:-124},{x:48,z:-20},{x:-1,z:-123},false,[{x:-8,z:-112},{x:-24,z:-60},{x:-24,z:-18},{x:0,z:0},{x:48,z:-20}]),R.squadCatchupMps,"a squad behind a route bend catches up instead of waiting forever");
 const pending=[{x:25,z:-110},{x:15,z:-111},{x:6,z:-124},{x:-8,z:-112},A.orders];
 const south=MissionGuideRoute({x:27,z:-113},pending,MISSION_ROUTES.south);
 assert.deepEqual(south.slice(0,4),pending.slice(0,4),"a delayed companion returns through the bundle trench before heading south");
 const village=MissionGuideRoute({x:-8,z:-78},south,MISSION_ROUTES.village);
 assert.deepEqual(village.slice(0,south.length),south,"village orders preserve the unfinished southbound path");
 assert.deepEqual(MissionGuideRoute({x:16,z:-124},pending,MISSION_ROUTES.bundle,MISSION_ROUTES.bundle,true),MISSION_ROUTES.bundle,"explicit entry starts at the cleared central junction");
 for(const post of OPENING.trenchCoverPosts){
   const forward=MissionGuideRoute(post,[],OPENING.approachRoute,OPENING.approachRoute,false,OPENING.trenchEntry);
   assert.deepEqual(forward,OPENING.approachRoute.slice(3),"cleared trench resumes beyond the entrance without a queue reversal");
   assert.ok(forward[0].z<post.z,"every settled guard continues north");
   assert.ok(Math.abs(post.x-OPENING.trenchEntry.x)>1.2&&post.z<OPENING.trenchEntry.z,"rally guards leave the central walking lane clear");
 }
 const late=[{x:-62,z:64},OPENING.trenchEntry,OPENING.trenchCoverPosts[3]];
 assert.deepEqual(MissionGuideRoute({x:-64,z:66},late,OPENING.approachRoute,OPENING.approachRoute,false,OPENING.trenchEntry),
   [...late,...OPENING.approachRoute.slice(3)],"a delayed guard retains the physical entrance and post before continuing north");
}

{
  const routes=R.squadRouteLanesM.map((_,slot)=>MissionSquadRoute(MISSION_ROUTES.support,slot));
  assert.ok(routes.every(route=>route.length>MISSION_ROUTES.support.length*3));
  for(const route of routes){
    assert.deepEqual(route.at(-1),MISSION_ROUTES.support.at(-1),"firing-post approach retains the final authored point");
    for(const p of route) {
      assert.ok(Number.isFinite(terrain.SampleHeight(p.x,p.z)));
      for(const box of MISSION_LAYOUT.blocks){
        if(MISSION_LAYOUT.walkableSurfaces.some(surface=>surface.id===box.id))continue;
        const y=terrain.SampleHeight(p.x,p.z),dx=p.x-box.x,dz=p.z-box.z;
        const c=Math.cos(box.ry||0),s=Math.sin(box.ry||0),localX=dx*c-dz*s,localZ=dx*s+dz*c;
        assert.ok(!(Math.abs(localX)<box.w/2+.4&&Math.abs(localZ)<box.d/2+.4&&box.y+box.h/2>y+.3&&box.y-box.h/2<y+1.7),"personal squad route clears rotated geometry "+box.id);
      }
    }
  }
  assert.ok(Math.hypot(routes[0][10].x-routes[1][10].x,routes[0][10].z-routes[1][10].z)>.9,"soldiers occupy distinct lanes instead of one exact line");
  const sample={speed:3,slot:0,yaw:0,target:{x:0,z:-10},position:{x:0,z:0},gap:Infinity,previous:2,dt:.1};
  assert.ok(MissionSquadPace({...sample,yaw:Math.PI/2})<MissionSquadPace(sample),"turning slows actual travel");
  assert.equal(MissionSquadPace({...sample,gap:1}),0,"personal space wins over catching up");
  assert.equal(MissionSquadPace({...sample,speed:0}),0,"leader waiting cannot leak residual movement");
  assert.notEqual(MissionSquadPace({...sample,slot:1}),MissionSquadPace({...sample,slot:2}),"individual stride cadence");
}
console.log("ok individual trench lanes, rounded corners, safe spacing and variable march pace");

{
  const shells=[],smoke=[],removed=[],facts=new Set();
  const runtime={time:0,flow:{stage:{id:"Unloading"}},Has:id=>facts.has(id),Near:()=>true,
    Point:(p,y=0)=>({...p,y}),combat:{FireShell:(from,to,options)=>shells.push({from,to,options})},
    vfx:{SmokeSource:(p,options)=>{smoke.push({p,options});return smoke.length;},RemoveSmokeSource:id=>removed.push(id)}};
  const opening=new FirstLevelOpening(runtime);
  opening.UpdateEscapePressure();
  assert.equal(shells.length+smoke.length,0,"no anticipatory barrage or smoke before impact");
  opening.derailAt=0;
  for(runtime.time=0;runtime.time<90;runtime.time+=.1)opening.UpdateEscapePressure();
  assert.equal(shells.length,OPENING.escapePressure.shells.length,"the salvo is finite even if the player stops");
  assert.ok(shells.every(s=>s.options.damage>0&&s.options.radius>0),"escape shells use real combat damage");
  assert.equal(smoke.length,2,"reuse two pooled wreck emitters without per-frame creation");
  for(const [i,shell] of shells.entries())shell.options.OnImpact({...shell.to});
  assert.equal(opening.pressureImpacts.length,shells.length,"record actual impacts independently of launch");
  facts.add("shelterReached");opening.UpdateEscapePressure();opening.ClearWreckSmoke();
  assert.deepEqual(removed,[1,2],"the sheltered exchange clears every wreck emitter exactly once");
  const cycle=OPENING.surfaceBurstSeconds+OPENING.surfaceRestSeconds;
  const second=OPENING.surface.find(s=>s.id==="RailLockGunner").firePhaseS;
  assert.ok(second>=OPENING.surfaceBurstSeconds&&second<cycle,
    "the second surface section keeps firing during the first section's reload");
  console.log("ok finite real escape barrage, impact causality and bounded smoke lifecycle");
}

{
 let clock=0;const events=[];
 const voice=new FirstLevelMissionVoice({audio:{StopStoryVoice(){},PlayStoryVoice(){return {voice:{t:clock}};}},hud:{Say(){}},Clock:()=>clock,Event:id=>{if(id!=="TrainDialogueLine")events.push(id);}});
 voice.Enqueue("TrainMeal");voice.Update(5);voice.Update(90);
 assert.equal(events.length,0,"simulation time cannot finish the receiving gesture ahead of audio");
 const handoffAt=MISSION_VOICE_ALIGNMENT.TrainMeal.lines[1][1];
 clock=handoffAt-.05;voice.Update(.1);voice.Pause();clock=90;voice.Update(60);
 assert.equal(events.length,0,"pause cannot release the handoff");
 voice.Resume();clock=90.11;voice.Update(.01);
 assert.deepEqual(events,["TrainFoodReceived"],"Shunzi's completed reply releases the handoff at its source timestamp");
 clock=91;voice.Update(1);assert.equal(events.length,1);
}
console.log("ok receiving-food release follows the source clock and survives pause/resume");

{
  assert.equal(MISSION_ENCOUNTERS.front.length+MISSION_ENCOUNTERS.machineGun.length+MISSION_ENCOUNTERS.approach.length+MISSION_ENCOUNTERS.surface.length+MISSION_ENCOUNTERS.intrusion.length+MISSION_ENCOUNTERS.shelterPursuit.length+MISSION_ENCOUNTERS.tank.length,R.openingEnemyBudget,
    "finite opening/front roster agrees with budget; no replacement waves");
  assert.equal(MISSION_ENCOUNTERS.machineGun.length,12,"the gun handover owns a separate finite attack");
  assert.ok(MISSION_ENCOUNTERS.machineGun.every(actor=>FrontAssaultLane(actor.x,actor.z).length>=3),"machine-gun attackers cross multiple physical bounds");
  assert.equal(MISSION_ENCOUNTERS.approach.length,18,"the communication-trench approach has a finite enemy screen");
  const attackers=[...MISSION_ENCOUNTERS.surface.filter(s=>s.advance),...MISSION_ENCOUNTERS.approach.filter(s=>!s.hold)];
  assert.equal(new Set(attackers.map(s=>s.id)).size,21,"each advancing actor has a persistent unique identity");
  assert.equal(new Set(MISSION_ENCOUNTERS.approach.map(s=>s.team)).size,3,"three independent attack sectors keep grenade cooldowns per squad");
  assert.ok(attackers.every(s=>MISSION_TACTICS[s.id]?.near && MISSION_TACTICS[s.id].points.length>=2),"mobile attackers have local activation and physical approach bounds");
  assert.ok(R.openingSurfaceGrenades>0 && R.enemyGrenades>0 && OPENING.intruderGrenades>0,"entry and approach riflemen carry finite grenades");
  assert.ok(R.approachContactM<26 && R.approachTacticalRadiusM>=R.approachContactM,"close contact hands movement back to shared combat and grenade AI");
  assert.ok(MISSION_ENCOUNTERS.approach.some(actor=>actor.z>-40)&&MISSION_ENCOUNTERS.approach.some(actor=>actor.z<-60),"both halves of the approach retain actual fire teams");
  assert.ok(R.frontEngageDistanceM>OPENING.frontReachRadiusM&&R.frontEngageDistanceM<35,"the finite main assault begins at the last trench bend, before the player reaches the firing post");
  assert.equal(new Set(Object.values(MISSION_ENCOUNTERS).flat().map(spec=>spec.id)).size,Object.values(MISSION_ENCOUNTERS).flat().length);
  assert.equal(MISSION_ENCOUNTERS.surface.length,12,"two surface sections provide actual enemy fire");
  assert.ok(MISSION_STAGES.find(s=>s.id==="Support").requirements.includes("frontRifleDefense"));
  assert.ok(FIRST_LEVEL_MISSION_PHASE.whitebox.actorCapacity>=R.openingEnemyBudget+40,"small graphics scale leaves capacity for real friendlies and dormant village");
  for(const point of FRONT_BREACHES){
    const h=SampleMissionTerrain(point.x,point.z);
    assert.ok(h> -2 && h<-.8,"the breached sap remains a walkable excavated passage below surface fire: "+h);
  }
  // User 2026-09-15: the "hold the corner" step has a real attack to hold against.
  assert.equal(MISSION_STAGES.find(s=>s.id==="Shelter").requirements[0],"shelterCornerHeld","the breather waits for the corner to be held");
  const cornerLane=[{x:-24,z:-23},{x:-24,z:-60}],mainTrench=MISSION_TERRAIN.trenches.find(t=>t.id==="FrontCommunication");
  assert.ok(MISSION_ENCOUNTERS.shelterPursuit.length>=4&&OPENING.shelterPursuerGrenades>0);
  for(const spec of MISSION_ENCOUNTERS.shelterPursuit){
    assert.ok(spec.z<OPENING.woundedRoute[0].z,`${spec.id} follows the wounded man from the front, never from behind the player`);
    assert.ok(SampleMissionTerrain(spec.x,spec.z)<-1.2,`${spec.id} starts on the excavated trench floor`);
    const plan=MISSION_TACTICS[spec.id];
    assert.ok(plan?.points.length>=3,`${spec.id} bounds physically toward the corner`);
    for(const point of plan.points)assert.ok(SampleMissionTerrain(point.x,point.z)<-1.2,`${spec.id} stays in the trench at ${point.x},${point.z}`);
    assert.ok(MissionPathDistance(plan.points.at(-1),cornerLane)<=mainTrench.bottom/2,`${spec.id} ends in the straight trench visible from the corner`);
  }
  assert.ok(MissionPathDistance(OPENING.shelterCorner,[OPENING.supportRoute[1],OPENING.supportRoute[2],OPENING.supportRoute[3]])<=mainTrench.bottom/2,
    "the corner post stands on the trench floor");
  const push=OPENING.shelterPush;
  assert.ok(push.remaining<MISSION_ENCOUNTERS.shelterPursuit.length&&push.afterS>0,"the last men rush the corner before the attack can stall out of sight");
  assert.ok(SampleMissionTerrain(push.point.x,push.point.z)<-1.2&&MissionPathDistance(push.point,cornerLane)<=mainTrench.bottom/2,"the rush point is open trench floor in view of the corner");
  // The extra fight sits between the unloading and front crates, so the recess carries its own.
  const shelterCrate=MISSION_SUPPLIES.find(s=>s.id==="Shelter");
  assert.ok(shelterCrate&&SampleMissionTerrain(shelterCrate.x,shelterCrate.z)<-1.2,"the shelter crate stands on the recess floor");
  assert.ok(Math.hypot(shelterCrate.x-OPENING.shelter.x,shelterCrate.z-OPENING.shelter.z)>R.interactionRangeM,"standing at the exchange does not put the crate under F");
  for(const post of [...OPENING.shelterPosts,OPENING.woundedRoute.at(-1),OPENING.runnerRoute.at(-1)])
    assert.ok(Math.hypot(shelterCrate.x-post.x,shelterCrate.z-post.z)>1.5,"the crate keeps clear of shelter posts and arrival points");
  const corner=[{x:0,z:0},{x:0,z:5},{x:5,z:5}],step=1.4/60;
  let before=MissionCarryRoutePoint(corner,3);
  for(let d=3+step;d<7;d+=step){
    const at=MissionCarryRoutePoint(corner,d);
    assert.ok(Math.hypot(at.x-before.x,at.z-before.z)<=step+.00001,"corner never teleports the litter");
    const turn=Math.atan2(Math.sin(at.yaw-before.yaw),Math.cos(at.yaw-before.yaw));
    assert.ok(Math.abs(turn)<.09,"litter heading turns gradually");
    before=at;
  }
  assert.deepEqual(MissionCarryRoutePoint(corner,10),{x:5,z:5,yaw:-Math.PI/2},"arrival position and hidden passage distance stay stable");
}

// ---------------------------------------------------------------------------
// 屋内伏击（内部步骤 Melee）。编排是纯规则，这里逐拍驱动成功 / 失败两条路、
// 配音事件驱动的老周那一刀、重放幂等与重试。口径：docs/Data_FirstLevelRoomAmbush.md
// ---------------------------------------------------------------------------
{
  const {FirstLevelAmbush,AMBUSH_PHASES}=await import("./Script_FirstLevelMissionAmbush.mjs");
  const {MISSION_ANCHORS,MISSION_PLACEMENT}=await import("./Data_FirstLevelMissionLayout.mjs");
  const ids=MISSION_ENCOUNTERS.melee.map(spec=>spec.id);
  assert.deepEqual(ids,["AmbushLead","AmbushRearA","AmbushRearB","AmbushFlank"],
    "the room ambush replaces the old single tutor with the authored four");
  assert.ok(MISSION_ENCOUNTERS.melee.every(spec=>spec.bayonet&&spec.weapon==="Type38"),
    "every ambusher actually carries a fixed bayonet");
  assert.ok(!Object.values(MISSION_ENCOUNTERS).flat().some(spec=>spec.id==="MeleeTutor"),
    "no reference to the removed tutor remains in the roster");
  // 三处死角都在屋里，并且真的被新加的遮挡挡住北门与触发点两条视线。
  const room=MISSION_PLACEMENT.roomInterior;
  for(const spec of MISSION_ENCOUNTERS.melee)
    assert.ok(spec.x>room.minX&&spec.x<room.maxX&&spec.z>room.minZ&&spec.z<room.maxZ,"hide spot inside the room: "+spec.id);
  const solids=MISSION_LAYOUT.blocks.filter(box=>box.solid!==false&&["AmbushWestScreen","AmbushCornerCrates","MeleeAlcoveScreen"].includes(box.id));
  assert.equal(solids.length,3,"both new hide pieces are real solids");
  const Blocked=(from,to)=>solids.some(box=>{
    const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)*8);
    for(let i=0;i<=steps;i++){
      const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      if(Math.abs(x-box.x)<box.w/2&&Math.abs(z-box.z)<box.d/2)return true;
    }
    return false;
  });
  const door={x:58,z:.5};
  for(const id of ["AmbushRearA","AmbushRearB","AmbushFlank"]){
    const spec=MISSION_ENCOUNTERS.melee.find(entry=>entry.id===id);
    assert.ok(Blocked(door,spec),id+" is hidden from the north door");
    assert.ok(Blocked(MISSION_ANCHORS.melee,spec),id+" is hidden from the trigger point");
  }
  assert.ok(Blocked(door,MISSION_ENCOUNTERS.melee[0]),"the lead is hidden from the north door by the existing alcove screen");
  // 新加的两块不许堵住 x=58 的担架通道，也不许堵住两扇门的开口（56.1–59.9）。
  for(const box of solids.filter(entry=>entry.id.startsWith("Ambush")))
    assert.ok(box.x-box.w/2>59.9||box.x+box.w/2<56.1,"new cover clears both door openings and the stretcher lane: "+box.id);

  const Fixture=(overrides={})=>{
    const log=[],said=[],facts=new Set(),clips=[],victims=[];
    const hooks={
      Record:(id,detail)=>{if(facts.has(id))return false;facts.add(id);log.push({id,detail});return true;},
      Has:id=>facts.has(id),
      Say:(id,options)=>said.push({id,...options}),
      Lock:seconds=>log.push({id:"lock",seconds}),
      Unlock:()=>log.push({id:"unlock"}),
      Wake:id=>log.push({id:"wake",who:id}),
      PlayClip:(who,clipId)=>clips.push({who,clipId}),
      Stab:()=>log.push({id:"stab"}),
      HoldBind:seconds=>log.push({id:"hold",seconds}),
      BeginQte:()=>{log.push({id:"qte"});return overrides.qte!==false;},
      EndBind:()=>log.push({id:"endHold"}),
      LookLitter:()=>log.push({id:"lookLitter"}),
      ColumnCasualty:victim=>{victims.push(victim);return true;},
      KnockDown:who=>log.push({id:"knockdown",who}),
      Release:()=>log.push({id:"release"}),
      SquadIn:()=>log.push({id:"squadIn"}),
      Finish:()=>log.push({id:"finish"}),
    };
    return {ambush:new FirstLevelAmbush(hooks,R),log,said,facts,clips,victims};
  };
  const Step=(fixture,seconds,world)=>{
    for(let t=0;t<seconds-1e-9;t+=1/60){
      fixture.ambush.Update(1/60,{playerAlive:true,...world});
      assert.ok(AMBUSH_PHASES.includes(fixture.ambush.Phase),"the beat never leaves its declared phases");
    }
  };
  // 跑到某一拍为止（用来把「挣脱那一瞬」和它之后的秒表分开看）。
  const StepUntil=(fixture,phase,world,limit=20)=>{
    let seconds=0;
    while(fixture.ambush.Phase!==phase&&seconds<limit){fixture.ambush.Update(1/60,{playerAlive:true,...world});seconds+=1/60;}
    assert.equal(fixture.ambush.Phase,phase,"the beat reached "+phase+" within "+limit+"s");
    return seconds;
  };
  const World=(over={})=>({litterAtDoor:true,leadAlive:true,leadDistanceM:3.6,qteActive:false,
    qteSuccess:null,aliveCount:4,squadInside:false,playerAlive:true,...over});

  // 0) 出生保护还在（刚重生 / 检查点重试 / 调试跳转）时绝不起这一拍：这一刀必须真的落上。
  {
    const f=Fixture();
    Step(f,R.ambushProtectedWaitS-.2,World({playerProtected:true}));
    assert.equal(f.ambush.Phase,"waiting","an invulnerable player is never stabbed by the script");
    assert.equal(f.ambush.waited,0,"the litter wait does not tick away under spawn grace");
    f.ambush.Update(1/60,World());
    assert.equal(f.ambush.Phase,"lunge","the beat springs as soon as the grace is gone");
  }
  // 0b) 保护不许把任务卡死：超过上限照样起。
  {
    const f=Fixture();
    Step(f,R.ambushProtectedWaitS+.4,World({playerProtected:true}));
    assert.ok(f.ambush.Started,"an unbounded protection cannot deadlock the step");
  }

  // 1) 担架没到门口时最多等 ambushLitterWaitS，之后照样触发。
  {
    const f=Fixture();
    Step(f,R.ambushLitterWaitS-.2,World({litterAtDoor:false}));
    assert.equal(f.ambush.Phase,"waiting","the beat waits for the litter before springing");
    Step(f,.4,World({litterAtDoor:false}));
    assert.equal(f.ambush.Phase,"lunge","a late litter cannot stall the ambush forever");
    assert.equal(f.facts.has("ambushTriggered"),true);
  }

  // 2) 成功那条路：触发 → 顶住 → 连按挣脱 → 班里人进屋 → 全部打死。
  {
    const f=Fixture();
    f.ambush.Update(1/60,World());
    assert.equal(f.ambush.Phase,"lunge");
    assert.deepEqual(f.said.map(entry=>entry.id),["RoomAmbush"]);
    assert.equal(f.said[0].urgent,true,"the ambush shout jumps the queue");
    assert.deepEqual(f.log.filter(e=>e.id==="wake").map(e=>e.who),["AmbushLead","AmbushRearA","AmbushRearB"],
      "the flanker stays hidden until the player breaks free");
    assert.ok(f.clips.filter(c=>c.clipId==="AmbushRise").length===3);
    // 扑到刺刀接触距离就捅，不等 ambushLungeMaxS。
    Step(f,.5,World({leadDistanceM:3}));
    assert.equal(f.ambush.Phase,"lunge");
    f.ambush.Update(1/60,World({leadDistanceM:R.ambushBindReachM-.01}));
    assert.equal(f.ambush.Phase,"pinned","the stab pins the player; the mash window has not opened yet");
    assert.equal(f.facts.has("ambushStabbed"),true);
    assert.ok(!f.log.some(e=>e.id==="qte"),"pressing F cannot count while he is only being held");
    assert.ok(f.log.findIndex(e=>e.id==="stab")<f.log.findIndex(e=>e.id==="hold"),"the wound lands, then the hold");
    assert.deepEqual(f.log.filter(e=>e.id==="hold").map(e=>e.seconds),[R.ambushPinHoldS]);
    // 顶住那一段：连按窗口还没开，背景拍表在这里把两个抬担架的与幺娃放倒。
    Step(f,R.ambushPinHoldS-.2,World());
    assert.equal(f.ambush.Phase,"pinned","the hold really lasts ambushPinHoldS");
    Step(f,.3,World());
    assert.equal(f.ambush.Phase,"bind","the mash window opens once the hold is over");
    assert.ok(f.log.findIndex(e=>e.id==="hold")<f.log.findIndex(e=>e.id==="qte"),"held first, then asked to mash");
    Step(f,R.ambushRearBearerStabAtS,World({qteActive:true}));
    assert.deepEqual(f.victims,["frontBearer","rearBearer"]);
    assert.ok(f.log.some(e=>e.id==="knockdown"&&e.who==="yaowa"));
    assert.equal(f.ambush.Phase,"bind","the beat is still inside the struggle window");
    assert.ok(R.ambushRearBearerStabAtS<=R.ambushLungeMaxS+R.ambushPinHoldS
      &&R.ambushYaowaDownAtS<=R.ambushLungeMaxS+R.ambushPinHoldS,
      "both bearers and Yaowa go down while the player is pinned, before he is asked to mash");
    // 结算：成功。连按到此为止，但控制权还不还 —— 老周那一刀还没落。
    f.ambush.Update(1/60,World({qteActive:true,qteSuccess:true}));
    f.ambush.Update(1/60,World({qteActive:false}));
    assert.equal(f.ambush.Phase,"witness","the lock outlives the struggle until the litter is stabbed");
    assert.equal(f.facts.has("ambushBroken"),false,"control cannot come back before Zhou takes the bayonet");
    assert.ok(f.log.some(e=>e.id==="endHold"),"the bind pose ends with the struggle");
    assert.ok(f.log.some(e=>e.id==="lookLitter"),"the locked look is pulled onto the litter for that blade");
    assert.ok(!f.log.some(e=>e.id==="squadIn"),"Luo is not sent while the player is still held");
    // 老周那一刀按兜底期限落下（没有配音事件时），落完才挣脱。
    const lockedS=StepUntil(f,"broken",World({aliveCount:4}));
    assert.ok(f.ambush.story<=R.ambushLockMaxS,"the whole locked take fits the control-lock fallback: "+f.ambush.story);
    assert.ok(lockedS>1,"the wait for the blade is real, not a same-frame release");
    assert.deepEqual(f.victims,["frontBearer","rearBearer","zhou"]);
    assert.equal(f.facts.has("zhouStabbed"),true);
    assert.equal(f.log.find(e=>e.id==="zhouStabbed").detail.health,R.ambushZhouHealthAfter);
    assert.equal(f.ambush.Phase,"broken");
    assert.ok(f.log.findIndex(e=>e.id==="zhouStabbed")<f.log.findIndex(e=>e.id==="ambushBroken"),
      "the player watches Zhou take the bayonet, and only then breaks free");
    assert.equal(f.log.filter(e=>e.id==="unlock").length,1,"control comes back exactly once");
    assert.deepEqual(f.log.find(e=>e.id==="ambushBroken").detail,{qte:"success"});
    assert.deepEqual(f.said.map(entry=>entry.id),["RoomAmbush","RoomAmbushBreak"]);
    assert.ok(f.log.some(e=>e.id==="release"));
    // 班里人按 ambushSquadDelayS 进来（从挣脱那一刻起算）。
    Step(f,R.ambushSquadDelayS-.3,World({aliveCount:4}));
    assert.ok(!f.log.some(e=>e.id==="squadIn"),"the squad does not teleport in instantly");
    Step(f,.5,World({aliveCount:4}));
    assert.ok(f.log.some(e=>e.id==="squadIn"));
    assert.equal(f.facts.has("ambushSquadArrived"),false,"arrival is recorded by a body in the room, not by a timer");
    f.ambush.Update(1/60,World({aliveCount:4,squadInside:true}));
    assert.equal(f.facts.has("ambushSquadArrived"),true);
    // 还有活人就绝不结算。
    f.ambush.Update(1/60,World({aliveCount:1,squadInside:true}));
    assert.equal(f.facts.has("meleeResolved"),false,"one surviving ambusher still blocks the step");
    f.ambush.Update(1/60,World({aliveCount:0,squadInside:true}));
    assert.equal(f.ambush.Phase,"resolved");
    assert.equal(f.log.find(e=>e.id==="meleeResolved").detail.sharedCombat,true,"the existing shared-combat detail survives");
    assert.deepEqual(f.said.map(entry=>entry.id),["RoomAmbush","RoomAmbushBreak","RoomAmbushCleared"]);
    assert.ok(f.log.some(e=>e.id==="finish"));
    // 重放幂等：再跑十秒不许多记一条事实、多喊一句。
    const before={log:f.log.length,said:f.said.length,victims:f.victims.length};
    Step(f,10,World({aliveCount:0,squadInside:true}));
    assert.deepEqual({log:f.log.length,said:f.said.length,victims:f.victims.length},before,"a resolved beat replays nothing");
  }

  // 3) 失败那条路：连按没顶住也照样挣脱，控制权照样还回来 —— 但同样等老周那一刀落完。
  {
    const f=Fixture();
    f.ambush.Update(1/60,World());
    f.ambush.Update(1/60,World({leadDistanceM:1}));
    assert.equal(f.ambush.Phase,"pinned");
    Step(f,R.ambushPinHoldS+.1,World());
    assert.equal(f.ambush.Phase,"bind");
    Step(f,R.ambushQteWindowS,World({qteActive:true}));
    f.ambush.Update(1/60,World({qteActive:true,qteSuccess:false}));
    f.ambush.Update(1/60,World({qteActive:false}));
    assert.equal(f.ambush.Phase,"witness","a failed struggle waits for the blade just the same");
    Step(f,R.ambushZhouStabAtS,World());
    assert.equal(f.ambush.Phase,"broken","the player always breaks free");
    assert.ok(f.log.findIndex(e=>e.id==="zhouStabbed")<f.log.findIndex(e=>e.id==="ambushBroken"));
    assert.deepEqual(f.log.find(e=>e.id==="ambushBroken").detail,{qte:"failure"});
    assert.equal(f.log.filter(e=>e.id==="unlock").length,1);
  }

  // 4) 连按窗口至少要看得见：QTE 没能开起来也不许同一帧松开。
  {
    const f=Fixture({qte:false});
    f.ambush.Update(1/60,World({leadDistanceM:1}));
    f.ambush.Update(1/60,World({leadDistanceM:1}));
    assert.equal(f.ambush.Phase,"pinned");
    Step(f,R.ambushPinHoldS-.2,World());
    assert.equal(f.ambush.Phase,"pinned");
    Step(f,.3,World());
    assert.equal(f.ambush.Phase,"bind","the window still opens even when the shared QTE refuses");
    Step(f,R.ambushBindMinS-.2,World());
    assert.equal(f.ambush.Phase,"bind");
    Step(f,.3,World());
    assert.equal(f.ambush.Phase,"witness");
    Step(f,R.ambushZhouStabAtS,World());
    assert.equal(f.ambush.Phase,"broken");
    assert.deepEqual(f.log.find(e=>e.id==="ambushBroken").detail,{qte:"none"});
  }

  // 5) 配音事件驱动老周那一刀：早于兜底期限到达时按事件走，只落一次；
  //    早到的那一刀也就是早一点的挣脱 —— 连按一结束就还控制权，不再干等兜底期限。
  {
    const f=Fixture();
    f.ambush.Update(1/60,World());
    f.ambush.Update(1/60,World({leadDistanceM:1}));
    Step(f,1,World({qteActive:true}));
    assert.equal(f.ambush.ZhouPending,true,"the man who stabs Zhou is still performing");
    assert.equal(f.ambush.CueZhouStab(),true);
    assert.ok(f.victims.includes("zhou"));
    assert.equal(f.log.find(e=>e.id==="zhouStabbed").detail.cue,true);
    assert.equal(f.ambush.ZhouPending,false);
    assert.equal(f.ambush.CueZhouStab(),false,"the cue can only land the blade once");
    const victims=f.victims.length;
    Step(f,R.ambushPinHoldS+R.ambushBindMinS+.4,World({qteActive:false}));
    assert.equal(f.ambush.Phase,"broken","an early blade means an early release, not an extra wait");
    Step(f,R.ambushZhouStabAtS+1,World({qteActive:false}));
    assert.equal(f.victims.filter(v=>v==="zhou").length,1,"the fallback deadline never repeats the cue-driven stab");
    assert.ok(f.victims.length>=victims);
  }

  // 6) 领头那个被打死：不管是在扑过来的路上还是在顶住的时候，都直接还控制权。
  {
    const f=Fixture();
    f.ambush.Update(1/60,World());
    f.ambush.Update(1/60,World({leadAlive:false}));
    assert.equal(f.ambush.Phase,"broken");
    assert.equal(f.facts.has("ambushStabbed"),false);
    assert.equal(f.log.filter(e=>e.id==="unlock").length,1,"a dead lead still returns control");
    const held=Fixture();
    held.ambush.Update(1/60,World());
    held.ambush.Update(1/60,World({leadDistanceM:1}));
    assert.equal(held.ambush.Phase,"pinned");
    held.ambush.Update(1/60,World({leadAlive:false}));
    assert.equal(held.ambush.Phase,"broken","nobody is left holding him");
    assert.ok(held.log.some(e=>e.id==="endHold"),"the bind pose is dropped with the lock");
    assert.equal(held.log.filter(e=>e.id==="unlock").length,1);
  }

  // 7) 重试：挣脱之后死掉的那次接着跑，不重放背景拍表。
  {
    const f=Fixture();
    f.ambush.Update(1/60,World());
    f.ambush.Update(1/60,World({leadDistanceM:1}));
    Step(f,R.ambushPinHoldS+.2,World());
    Step(f,R.ambushRearBearerStabAtS,World({qteActive:true}));
    f.ambush.Update(1/60,World({qteActive:true,qteSuccess:true}));
    f.ambush.Update(1/60,World({qteActive:false}));
    Step(f,R.ambushZhouStabAtS,World());
    assert.equal(f.ambush.Phase,"broken");
    const victims=f.victims.length,knocks=f.log.filter(e=>e.id==="knockdown").length;
    f.ambush.ResumeBroken();
    Step(f,20,World({aliveCount:2}));
    assert.equal(f.victims.length,victims,"a checkpoint retry does not kill the bearers twice");
    assert.equal(f.log.filter(e=>e.id==="knockdown").length,knocks,"nor knock Yaowa down again");
    assert.ok(f.log.filter(e=>e.id==="squadIn").length>=1);
    // 全新一次（还没挣脱就死了）：整拍从头来。
    f.ambush.Reset();
    assert.equal(f.ambush.Phase,"waiting");
    f.ambush.Update(1/60,World());
    assert.equal(f.ambush.Phase,"lunge","a full reset can trigger the beat again");
  }
  // 8) 担架队这一侧：伤亡、快照/还原、替补，以及检查点重建带得动新状态。
  {
    const column=new FirstLevelMissionColumn();
    column.Activate();
    const before=column.Snapshot();
    const zhou=column.zhou;
    assert.ok(zhou.bearers.every(h=>h>0)&&!zhou.stabbed);
    assert.equal(column.AmbushCasualty("frontBearer"),true);
    assert.equal(column.AmbushCasualty("rearBearer"),true);
    assert.equal(column.AmbushCasualty("frontBearer"),false,"a dead bearer cannot die twice");
    assert.equal(column.AmbushCasualty("zhou",{zhouHealth:R.ambushZhouHealthAfter}),true);
    assert.equal(column.zhou.health,R.ambushZhouHealthAfter);
    assert.equal(column.zhou.stabbed,true);
    assert.equal(column.zhou.state,"fallen");
    assert.equal(column.bearerCasualties.length,2,"both corpses land at their own grip positions");
    assert.equal(new Set(column.bearerCasualties.map(body=>body.slot)).size,2);
    // 快照/还原带得动新字段 —— 检查点重试就是靠这一条把担架队摆回门口的。
    const wounded=column.Snapshot();
    const replay=new FirstLevelMissionColumn();replay.Restore(wounded);
    assert.equal(replay.zhou.stabbed,true);
    assert.equal(replay.zhou.health,R.ambushZhouHealthAfter);
    assert.deepEqual(replay.bearerCasualties,column.bearerCasualties);
    column.Restore(before);
    assert.ok(column.zhou.bearers.every(h=>h>0)&&!column.zhou.stabbed,"restoring the pre-ambush snapshot un-does the whole beat");
    // 清完屋子之后叫替补：后队真的走过来接手，不是凭空补血。
    column.Restore(wounded);
    column.AmbushRecover();
    assert.equal(column.zhou.state,"waiting");
    for(let i=0;i<4000&&column.zhou.bearers.some(h=>h<=0);i++)column.Update(.1);
    assert.ok(column.zhou.bearers.every(h=>h>0),"two replacement bearers physically reach the litter");
    assert.equal(column.replacements,2);
  }
  // 9) 数值自洽：老周这一刀之后仍然活着，并且高于后面几级台阶。
  assert.ok(R.ambushZhouHealthAfter>12&&R.ambushZhouHealthAfter<65,
    "Zhou survives the belly wound but is worse off than at the orders post");
  assert.ok(R.ambushStabDamage+R.ambushFailureExtraDamage+12<100,
    "even a failed struggle leaves a full-health player alive");
  // 这一拍的编排闸：连按窗口必须在老周那一声之前收尾，整段锁住时间必须放得进控制锁兜底。
  const {MELEE_QTE_RULES:QTE}=await import("./Data_MeleeCombat.mjs");
  assert.ok(R.ambushQteWindowS>=2&&R.ambushQteWindowS<=QTE.windowS,"the scripted window fits the shared QTE rule");
  assert.ok(R.ambushLungeMaxS+R.ambushPinHoldS+R.ambushQteWindowS+QTE.resolveS<=R.ambushZhouStabAtS,
    "the mash window ends at or before Zhou's cry — his stab has to land inside the lock");
  assert.ok(R.ambushZhouStabAtS+R.ambushWitnessTailS<=R.ambushLockMaxS&&R.ambushLockMaxS<=9.5,
    "the whole locked take fits inside the control-lock fallback and stays under ten seconds");
  assert.ok(R.ambushWitnessTailS>=R.ambushClipLeadS,
    "the blade is actually pulled back out before control returns");
  console.log("ok room ambush: trigger gate, scripted stab, pinned hold, success/failure struggle, cue-driven litter stab before the release, squad entry, replay and retry");
}

{
 const cue=MISSION_DIALOGUE.find(c=>c.id==='TrainMeal');
 const entry=JSON.parse(fs.readFileSync(new URL('./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json',import.meta.url))).cues.TrainMeal;
 const sources=[],subtitles=[],done=[];
 const voice=new FirstLevelMissionVoice({audio:{StopStoryVoice(){},PlayStoryVoice:(_key,options)=>{sources.push(options);return {}; }},
   hud:{Say:(_who,text)=>subtitles.push(text)},Done:id=>done.push(id)});
 voice.manifest={cues:{TrainMeal:entry}};
 voice.Enqueue('TrainMeal');
 for(let t=0;t<entry.seconds+12;t+=1/60)voice.Update(1/60);
 assert.equal(sources.length,1,'the carriage ensemble has no artificial playback breaks');
 assert.equal(sources[0].offset,0);
 assert.equal(sources[0].maxDuration,entry.seconds,'the complete recording plays through its final reply');
 assert.deepEqual(subtitles,cue.lines.map(line=>line.text),'every passenger reply appears once, in order');
 assert.deepEqual(done,['TrainMeal']);
 const plan=MissionVoiceTimeline(cue,entry.seconds);
 const impactAt=plan.segments.reduce((t,s)=>t+s.end-s.start+(s.wait||0),plan.tail)+R.trainFirstShellFlightS;
 const before=MissionTrainMotion(impactAt),after=MissionTrainMotion(impactAt+.1);
 assert.ok(before.offsetM>0 && Math.abs(before.offsetM-after.offsetM-R.trainCruiseSpeedMps*.1)<1e-6,
   'the train still moves when the first shell arrives after the longer exchange');
}
