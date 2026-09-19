import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { MISSION_CIVILIAN_AFTERMATH } from "./Data_FirstLevelMissionCivilianAftermath.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FirstLevelOpening, OpeningRecoveryTime, SampleOpeningPerception } from "./Script_FirstLevelOpening.mjs";
import { MISSION_AFTERMATH, FRONT_BREACHES, FRONT_ASSAULT, FRONT_COVER, FRONT_FIELD_MEN, FRONT_RESERVES, FRONT_ASSAULT_STARTS, FrontAssaultLane, FrontReserveLane } from "./Data_FirstLevelMissionFront.mjs";
import { COVER } from "./Data_Tuning_AiCover.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { CollectBulletNearMisses,ApplyBulletNearMisses } from "./Script_BallisticSuppression.mjs";
import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { GuardCrossingPair, FrontReplacementSlots } from "./Script_FirstLevelMissionPacing.mjs";
import { FIRST_LEVEL_STAGES, ResolveFirstLevelStage, FirstLevelStageForStep } from "./Data_FirstLevelMissionStages.mjs";
import { BuildFirstLevelCheckpoint } from "./Script_FirstLevelMissionCheckpoint.mjs";
import { FirstLevelMissionColumn, MissionRouteNextIndex, MissionCarryRoutePoint, MissionGuideSpeed, MissionGuideRoute, MissionSquadRoute, MissionSquadPace } from "./Script_FirstLevelMissionColumn.mjs";
import { MISSION_STAGES, MISSION_TUNING as R, FIRST_LEVEL_MISSION_PHASE, MISSION_TACTICS, MISSION_ENCOUNTERS, MISSION_PURSUIT_ROUTE, MISSION_TRANSFER_THREATS } from "./Data_FirstLevelMission.mjs";
import { MISSION_STAGE_ROUTES } from "./Data_FirstLevelMissionTopology.mjs";
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
    opening.FireWindows=()=>{};opening.UpdateZhou=()=>{};
    opening.Update(1/60);
    assert.equal(r.failed,false,"an ordinary member in the player's squad does not fail the opening");
    r.squad.push({id:2,castId:OPENING.requiredSquadCast[0],alive:false});
    opening.Update(1/60);assert.equal(r.failed,true,"the existing required-companion contract is preserved");
  }
  for(const survivors of [0,1,3]){
    const flow=new FirstLevelMissionFlow();flow.index=MISSION_STAGES.findIndex(s=>s.id==="MachineGun");flow.started=true;
    const guards=Array.from({length:4},(_,i)=>({actor:{id:i,alive:i<survivors},safe:true,progress:1,route:[{}]}));
    const r={flow,guards,time:0,Has:id=>flow.Has(id),Record:(id,d)=>flow.Record(id,d)};
    for(const fact of MISSION_STAGES.find(s=>s.id==="MachineGun").requirements)
      if(fact!=="guardWithdrawalResolved")flow.Record(fact);
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
}
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
{
  assert.deepEqual(GuardCrossingPair([{id:1,alive:false},{id:2,alive:true},{id:3,alive:true}],2),[2],"a fallen partner does not strand the surviving crossing man");
  assert.deepEqual(GuardCrossingPair([{id:1,alive:true,safe:true},{id:2,alive:false},{id:3,alive:true}],2),[3]);
  assert.equal(FrontReplacementSlots({alive:149,queued:1,spawned:0},R),0,"queued men reserve live capacity");
  assert.equal(FrontReplacementSlots({alive:24,queued:0,spawned:5},{...R,waveBudget:6}),1,"last finite replacement is not rounded up to a squad");
  assert.equal(FrontReplacementSlots({alive:0,queued:0,spawned:R.waveBudget},R),0,"no infinite replacement loop");
  for(const spec of MISSION_ENCOUNTERS.front)assert.ok(spec.x>MISSION_LAYOUT.bounds.minX && spec.x<MISSION_LAYOUT.bounds.maxX && spec.z>MISSION_LAYOUT.bounds.minZ && spec.z<MISSION_LAYOUT.bounds.maxZ,"every simultaneous soldier starts inside the playable heightfield");
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
const terrain = CreateP012Terrain(MISSION_LAYOUT);
for (const trench of MISSION_TERRAIN.trenches) assert.ok(trench.depth >= 1.83, trench.id + " full-cover excavation depth");
for (const [x,z] of [[-24,-53],[-45,30],[-10,-124]]) {
  assert.ok(terrain.SampleHeight(x,z) < -1.8, "rendered/physical full-cover floor at " + x + "," + z);
}
assert.equal(MISSION_TERRAIN.trenches.find(t=>t.id==='BundleApproach').depth, MISSION_TERRAIN.steps[0].depth, 'supply house floor remains level with trench');
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
for(const spec of MISSION_ENCOUNTERS.air)
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
// 接防班走的是 2026.09.19 契约路线（collectionReturn 反向）。那条线沿途的几何归
// 空间包建，还没落地 —— 净空由空间包的 Script_FirstLevelSpaceTest 在并入
// MISSION_ROUTES 时验收，这里先不按旧地形量（量出来的是「还没挖的沟」）。
const reliefRoutes={};
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
 const calls=[], sound=new FirstLevelMissionBattleSound({Play:(cue,options)=>{calls.push({cue,...options});return null;}});
 // 【2026-09-09 这一条改了口径】原来断言的是「车厢里一声前线都不许有」。
 // 实测下来那正是用户报的问题：整整一分钟的车厢里只有三句对白，然后第一发
 // 凭空炸在车边上。现在的口径是**由远及近**，闸门有三道，一道都不能松：
 //   1. 头 24 秒仍然一声不许有（车厢自己的动静与那顿饭的对话独占）；
 //   2. 之后只许是**闷的**（airCut ≤ 340 Hz —— 隔着木板与铁皮）；
 //   3. 头一段必须比后一段轻（军列在往前线开，不是前线在靠近）。
 for(let i=0;i<48;i++)sound.Update(.5,"Trapped");
 assert.equal(calls.length,0,"the collapsed bunker stays clear of front sound for the first 24s");
 for(let i=0;i<40;i++)sound.Update(.5,"Trapped");
 const early=calls.slice();
 assert.ok(early.length>0,"the front creeps in through the earth before the near miss");
 assert.ok(early.every(c=>c.airCut<=340&&c.soundField&&c.bus==="ambience"),
   "everything heard from under the collapse is muffled: "+JSON.stringify(early[0]));
 for(let i=0;i<40;i++)sound.Update(.5,"Trapped");
 const late=calls.slice(early.length), Loudest=(rows,cue)=>Math.max(0,...rows.filter(c=>c.cue===cue).map(c=>c.volume));
 assert.ok(Loudest(late,"amb.cannonFar")>Loudest(early,"amb.cannonFar"),
   "the front grows while the man lies pinned: "+JSON.stringify({early:Loudest(early,"amb.cannonFar"),late:Loudest(late,"amb.cannonFar")}));
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
  // 2026.09.19 重构后的开场/前沿名单。旧军列开场那三组（surface / intrusion /
  // shelterPursuit）已随它一起下线；剩下的每一份名单仍然只投一次、不补波。
  assert.equal(MISSION_ENCOUNTERS.bunkerAssault.length+MISSION_ENCOUNTERS.front.length
    +MISSION_ENCOUNTERS.machineGun.length+MISSION_ENCOUNTERS.approach.length+MISSION_ENCOUNTERS.tank.length,
    R.openingEnemyBudget,"finite opening/front roster agrees with budget; no replacement waves");
  assert.equal(MISSION_ENCOUNTERS.machineGun.length,12,"the gun handover owns a separate finite attack");
  assert.ok(MISSION_ENCOUNTERS.machineGun.every(actor=>FrontAssaultLane(actor.x,actor.z).length>=3),"machine-gun attackers cross multiple physical bounds");
  assert.equal(MISSION_ENCOUNTERS.approach.length,18,"the communication-trench approach has a finite enemy screen");
  const attackers=MISSION_ENCOUNTERS.approach.filter(s=>!s.hold);
  assert.ok(new Set(attackers.map(s=>s.id)).size===attackers.length,"each advancing actor has a persistent unique identity");
  assert.equal(new Set(MISSION_ENCOUNTERS.approach.map(s=>s.team)).size,3,"three independent attack sectors keep grenade cooldowns per squad");
  assert.ok(attackers.every(s=>MISSION_TACTICS[s.id]?.near && MISSION_TACTICS[s.id].points.length>=2),"mobile attackers have local activation and physical approach bounds");
  assert.ok(R.enemyGrenades>0,"approach riflemen carry finite grenades");
  assert.ok(R.approachContactM<26 && R.approachTacticalRadiusM>=R.approachContactM,"close contact hands movement back to shared combat and grenade AI");
  assert.ok(MISSION_ENCOUNTERS.approach.some(actor=>actor.z>-40)&&MISSION_ENCOUNTERS.approach.some(actor=>actor.z<-60),"both halves of the approach retain actual fire teams");
  assert.ok(R.frontEngageDistanceM>OPENING.frontReachRadiusM&&R.frontEngageDistanceM<35,"the finite main assault begins at the last trench bend, before the player reaches the firing post");
  assert.equal(new Set(Object.values(MISSION_ENCOUNTERS).flat().map(spec=>spec.id)).size,Object.values(MISSION_ENCOUNTERS).flat().length);
  assert.ok(MISSION_STAGES.find(s=>s.id==="Support").requirements.includes("frontRifleDefense"));
  assert.ok(FIRST_LEVEL_MISSION_PHASE.whitebox.actorCapacity>=R.openingEnemyBudget+40,"small graphics scale leaves capacity for real friendlies and dormant village");
  for(const point of FRONT_BREACHES){
    const h=SampleMissionTerrain(point.x,point.z);
    assert.ok(h> -2 && h<-.8,"the breached sap remains a walkable excavated passage below surface fire: "+h);
  }
  // 01 掩蔽部门外的行刑组：两个动手的、两个跟进的，全都在门外看得见的那一小片里。
  assert.equal(MISSION_ENCOUNTERS.bunkerAssault.length,4,"the bunker door has its finite execution party");
  for(const spec of MISSION_ENCOUNTERS.bunkerAssault)
    assert.ok(Math.hypot(spec.x-A.bunkerKilling.x,spec.z-A.bunkerKilling.z)<=R.bunkerSightM,
      spec.id+" stands inside the sight line through the low breach");
  // 12 只有两处威胁，第二处等第一处解除。
  assert.equal(MISSION_TRANSFER_THREATS.length,2,"the transfer step keeps two threats, not four waves");
  assert.equal(MISSION_TRANSFER_THREATS[0].after,null);
  assert.equal(MISSION_TRANSFER_THREATS[1].after,"loadingThreatResolved");
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

