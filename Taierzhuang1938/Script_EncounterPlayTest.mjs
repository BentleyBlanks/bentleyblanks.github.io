import assert from "node:assert/strict";
import fs from "node:fs";
import {EncounterPlayPlan,EncounterCanPlay,EncounterFirstPlayable,EncounterActorSpec,EncounterPuppetYaw,EncounterInitialActorYaw,EncounterOrderYaw,ResolveEncounterStageStart,ResolveEncounterMissionArea,ENCOUNTER_PLAY_CONFIG as C} from "./Script_EncounterPlayPlan.mjs";
import {MissionAreaGuard,DistanceToArea} from "./Script_MissionAreaGuard.mjs";
import {MISSION_AREA_GUARD} from "./Data_Tuning_MissionArea.mjs";
import {FLOW_TIMELINE,DEFAULT_ENCOUNTER_DOCUMENT,BeatById} from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import {FIRST_LEVEL_MUSIC_CUES} from "./Data_FirstLevelMissionMusic.mjs";
import {WEAPONS} from "./Data_Weapons.mjs";
import {ValidateScene} from "./Script_SceneDoc.mjs";
import {SceneSurfaceSampler} from "./Script_SceneSurface.mjs";
import {PrepareSceneTerrain,GridSampler} from "./Script_SceneTrenches.mjs";
import {EncounterDocument,ENCOUNTER_STORAGE_KEY} from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import {ENCOUNTER_CINEMATICS} from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import {DebugOptions, DEBUG_OPTION_KEYS} from "./Script_DebugOptions.mjs";
import {EncounterDialogueLines,EncounterSpeechAnchor} from "./Script_EncounterPlayDialogue.mjs";
import {CompileEncounterVariant} from "./Script_EncounterVariants.mjs";
import {CompileEncounters} from "./Scenes/FirstLevelEncounter/Script_LevelFlowEncounter.mjs";
import {YawForwardXZ,CompassDirection,YawCompass,RelativeDirection,NormalizeDialogueText,MergePlayEntities,BuildPlayObjectiveGuide,PlayDialogueHistory} from "./AdvancedTools/Script_LevelFlowPlayGuideModel.mjs";
import {FIRST_LEVEL_CAMPAIGN_STAGES, FIRST_LEVEL_CAMPAIGN_VARIANT_ID, FIRST_LEVEL_OPENING_SEQUENCES, FIRST_LEVEL_OPENING_TIMELINE_URL, FIRST_LEVEL_BRIDGE_DEMO_TIMELINE_URL, FIRST_LEVEL_ENDING_TIMELINE_URL} from "./Data_FirstLevelCampaign.mjs";
import {TIMELINE_V2_SCHEMA, ValidateTimelineAsset} from "./Script_TimelineAsset.mjs";
import {Vector3,PerspectiveCamera} from "./vendor/three/build/three.module.js";
for(const beat of FLOW_TIMELINE.filter(beat=>EncounterCanPlay(beat.start,"L1_Original"))){
 const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,beat.start,"L1_Original");
 assert.ok(C.guidance[beat.id]?.text,"A playable gate needs a text order: "+beat.id);
 const first=EncounterDialogueLines(plan,plan.Frame()).find(line=>line.order);
 assert.ok(first?.actorId,"A text order has a present speaker: "+beat.id);
 plan.Step(beat.duration*10,[500,500],new Set(plan.initial.map(actor=>actor.id)));
 assert.ok(EncounterDialogueLines(plan,plan.Frame()).some(line=>line.order),"Waiting never expires the current direction: "+beat.id);
}
{
 const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("03d").start,"L1_Original");
 const before=EncounterDialogueLines(plan,plan.Frame(),{interact:true});
 assert.ok(before.some(line=>line.order&&line.text.includes(C.ui.interact)),"Available interaction is readable even during authored speech");
 plan.Interact();
 const after=EncounterDialogueLines(plan,plan.Frame());
 assert.ok(after.some(line=>line.text===C.guidance["03d"].afterAction));
 assert.ok(!after.some(line=>!line.order&&line.actorId==="he"),"A completed action cannot leave its old command over the new one");
 plan.Kill("he");
 const dead=EncounterDialogueLines(plan,plan.Frame());
 assert.ok(dead.every(line=>line.actorId!=="he"));
 assert.equal(dead.find(line=>line.order).text,plan.beat.task,"Missing speakers fall back to the existing task without impersonation");
 assert.deepEqual(EncounterDialogueLines(plan,plan.Frame(),{failed:true}),[]);
 plan.completed=true;assert.deepEqual(EncounterDialogueLines(plan,plan.Frame()),[]);
}
{
 const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("09b").start,"L1_Original");
 assert.ok(EncounterDialogueLines(plan,plan.Frame(),{exit:true}).some(line=>line.text===C.guidance["09b"].exit),"The real patrol exit switches wait to leave");
 const camera=new PerspectiveCamera(60,16/9,.1,1500);camera.position.set(0,1.6,0);camera.updateMatrixWorld();
 const actor={kind:"person",pose:"stand"},clear={Raycast:()=>null};
 const front=EncounterSpeechAnchor(new Vector3(0,0,-10),actor,camera,1280,720,clear);
 assert.ok(front?.every(Number.isFinite));
 assert.notDeepEqual(EncounterSpeechAnchor(new Vector3(1,0,-10),actor,camera,1280,720,clear),front,"Speech follows the live head position");
 for(const point of [new Vector3(0,0,10),new Vector3(1000,0,-10)])assert.equal(EncounterSpeechAnchor(point,actor,camera,1280,720,clear),null);
 assert.equal(EncounterSpeechAnchor(new Vector3(0,0,-10),actor,camera,1280,720,{Raycast:()=>({t:2})}),null,"A real wall hides the bubble so the subtitle can take over");
}
{
 const values=new Map();
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const menu=new DebugOptions(storage),host=new DebugOptions(storage);
 for(const key of DEBUG_OPTION_KEYS)menu.Set(key,true);
 assert.ok(DEBUG_OPTION_KEYS.every(key=>host.Reload()[key]),"A retained Play host reloads every menu option");
 menu.Reset();
 assert.ok(DEBUG_OPTION_KEYS.every(key=>!host.Reload()[key]),"Removed preferences disable every retained option");
 for(const storage of [null,{getItem(){throw new Error("Storage unavailable");},setItem(){throw new Error("Storage unavailable");}}]) {
  const options=new DebugOptions(storage);
  for(const key of DEBUG_OPTION_KEYS)options.Set(key,true);
  assert.ok(DEBUG_OPTION_KEYS.every(key=>options.Reload()[key]),"Unavailable storage retains in-session options on retry");
 }
}
for(const beat of FLOW_TIMELINE) {
  if(beat.start>=EncounterFirstPlayable("L1_Original").start&&!ENCOUNTER_CINEMATICS.includes(beat.id))assert.ok(C.gates[beat.id],"Missing gameplay gate: "+beat.id);
  if(!EncounterCanPlay(beat.start,"L1_Original")){assert.throws(()=>new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,beat.start+.01,"L1_Original"));continue;}
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,beat.start+beat.duration/2,"L1_Original");
  assert.equal(plan.time,beat.start);assert.equal(plan.beat.id,beat.id);
  plan.Step(beat.duration*10,[500,500],new Set(plan.initial.map(a=>a.id)));
  assert.equal(plan.beat.id,beat.id,beat.id+": elapsed time alone never advances a stage");
  assert.equal(plan.State().timelineTime,beat.start);
  assert.ok(EncounterActorSpec({id:"unit",kind:"person",side:"enemy",p:[0,0]}).weapon in WEAPONS);
}
assert.equal(new EncounterPlayPlan().beat.id,"02g");
assert.equal(EncounterFirstPlayable().id,"02g");
{
 const doc=structuredClone(DEFAULT_ENCOUNTER_DOCUMENT),beat=BeatById("03b");
 const trigger=doc.triggers.find(t=>t.id==="Trigger_Fork");trigger.mode="time";trigger.delay=beat.duration+5;
 const plan=new EncounterPlayPlan(doc,beat.start,"L1_Original");
 plan.Step(beat.duration,[0,0],new Set());assert.ok(!plan.triggers.has(trigger.id));
 plan.Step(6,[0,0],new Set());assert.ok(plan.triggers.has(trigger.id),"A held stage still runs its real spawn timer");
 assert.equal(plan.beat.id,"03b");
}
for(const beat of FLOW_TIMELINE.filter(b=>EncounterCanPlay(b.start,"L1_Original"))){
 const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,beat.start,"L1_Original"),gate=plan.gate;
 for(const id of gate.kill||[]){assert.ok(plan.initial.some(a=>a.id===id));plan.Kill(id);}
 for(const id of gate.clear||[]){
   const group=plan.compiled.groups.find(g=>g.id===id);assert.ok(group,"Unknown clear target "+id);
   plan.groups.get(id).count=group.count;for(let i=0;i<group.count;i++)plan.Kill(id+"_"+i);
 }
 if(gate.kills)for(const id of gate.kills.groups){const group=plan.compiled.groups.find(g=>g.id===id);assert.ok(group);for(let i=0;i<group.count;i++)plan.Kill(id+"_"+i);}
 if(gate.action)plan.Interact();
 const point=gate.retreat?beat.p.at(-1):plan.Area().center;
 plan.Step(0,point,new Set(),{facts:gate.fact?[gate.fact]:[],escorted:gate.escort||0,departed:gate.departed||[],[gate.event]:true});
 assert.ok(plan.completed||plan.beat.id!==beat.id,"Declared completion conditions must be satisfiable: "+beat.id);
}
{
 const p=new EncounterPlayPlan();p.Step(999,p.beat.p[0],new Set(["opening4"]));assert.equal(p.beat.id,"02g");
 p.Kill("opening4");p.Step(0,p.beat.p[0],new Set());assert.equal(p.beat.id,"02h");
}
for(const cue of Object.values(C.music))assert.ok(FIRST_LEVEL_MUSIC_CUES[cue],cue);
assert.ok(WEAPONS[C.startWeapon]);
assert.equal(EncounterActorSpec({id:"donkey",kind:"donkey",side:"civilian",pose:"walk",p:[0,0]}).kind,"animal");
assert.equal(EncounterActorSpec({id:"nier",kind:"child",side:"civilian",pose:"kneel",p:[0,0]}).kind,"child");
assert.equal(EncounterActorSpec({id:"nier",kind:"child",side:"civilian",pose:"kneel",p:[0,0]}).stance,"crouch");
assert.equal(EncounterActorSpec({id:"erya",kind:"child",side:"civilian",pose:"kneel",p:[0,0]}).castId,"erya");
assert.equal(EncounterActorSpec({id:"tian",kind:"person",side:"civilian",pose:"kneel",p:[0,0]}).castId,"tiansao");
{
 const carrier={id:"cart",kind:"cart",side:"civilian",p:[10,20],heading:Math.PI/2};
 const actor={id:"winter",kind:"quilt",side:"friend",pose:"wounded",parentId:"cart",elevation:1.05,p:[10,20.5],heading:Math.PI/2};
 assert.equal(EncounterActorSpec(carrier).yawDeg,-90,"Vehicle models face their direction of travel");
 const spec=EncounterActorSpec(actor,carrier);assert.equal(spec.ride.on,"cart");assert.equal(spec.ride.y,1.05);assert.equal(spec.lie,"along");
}
const original=JSON.stringify(DEFAULT_ENCOUNTER_DOCUMENT);
{
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("03c").start,"L1_Original");
  plan.Step(1000,[500,500],new Set(["Corner_0"]));
  assert.equal(plan.beat.id,"03c");assert.equal(plan.waiting,"reach");
  assert.ok(!plan.dead.has("Corner_0"),"Preview lifetimes never kill a gameplay soldier");
  plan.Kill("Corner_0");assert.ok(plan.dead.has("Corner_0"));
}
{
  const doc=structuredClone(DEFAULT_ENCOUNTER_DOCUMENT);
  const group=doc.groups.find(g=>g.id==="Fork");group.count=2;group.maxAlive=1;group.interval=0;group.reinforceAfterClear=true;
  const trigger=doc.triggers.find(t=>t.id===group.triggerId);trigger.mode="area";trigger.area.center=[300,300];
  const plan=new EncounterPlayPlan(doc,BeatById("03b").start,"L1_Original");
  plan.Step(1,[0,0],new Set());assert.ok(!plan.triggers.has(trigger.id));
  plan.Step(0,[300,300],new Set());assert.ok(plan.triggers.has(trigger.id),"Actual player arrival fires trigger");
  const first=plan.Spawns(new Set()).find(a=>a.groupId==="Fork");assert.ok(first);plan.Spawned(first);
  plan.Step(50,[0,0],new Set([first.id]));
  assert.ok(!plan.Spawns(new Set([first.id])).some(a=>a.groupId==="Fork"),"Living soldier blocks replacement beyond preview expiry");
  plan.Kill(first.id);const second=plan.Spawns(new Set()).find(a=>a.groupId==="Fork");assert.ok(second);assert.notEqual(second.id,first.id);
  plan.Spawned(second);plan.Step(500,[0,0],new Set());assert.equal(plan.beat.id,"03b","Disappearing without death is not a kill");
  plan.Kill(second.id);plan.Step(0,[0,0],new Set());assert.equal(plan.beat.id,"03c","Recorded kills advance immediately");
}
{
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("02i").start,"L1_Original");
  plan.Step(999,plan.beat.p[0],new Set());assert.equal(plan.waiting,"interact");
  plan.Interact();plan.Step(0,plan.beat.p[0],new Set());assert.equal(plan.beat.id,"03a");
  const goal=plan.Area().center;plan.Step(0,goal,new Set());assert.equal(plan.beat.id,"03b","Actual area arrival advances without waiting for the authored duration");
}
{
 const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("03d").start,"L1_Original");
 plan.Interact();plan.Step(999,plan.beat.p[0],new Set());assert.equal(plan.beat.id,"03d","Throwing alone cannot substitute for detonation");
 plan.Step(0,plan.beat.p[0],new Set(),{facts:["grenadeReturned"]});assert.equal(plan.beat.id,"03e");
 const skip=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("08e").start,"L1_Original");
 skip.Step(0,skip.Area().center,new Set());assert.equal(skip.beat.id,"08g","Camera animation 08F is never played");
}
assert.equal(JSON.stringify(DEFAULT_ENCOUNTER_DOCUMENT),original,"Play does not mutate authoring data");
{
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("09a").start,"L1_Original");
  plan.Step(0,plan.beat.p.at(-1),new Set());
  assert.equal(plan.beat.id,"09b","temple entry uses actual arrival without waiting for the preview duration");
  plan.Step(1000,plan.beat.p.at(-1),new Set(),{partyArrived:false});
  assert.equal(plan.waiting,"event");
  plan.Step(0,plan.beat.p.at(-1),new Set(),{partyArrived:true});
  assert.equal(plan.beat.id,"09c","exit waits for actual companion arrival");
}
{
 const old=structuredClone(DEFAULT_ENCOUNTER_DOCUMENT);old.groups[0].count=4;
 const values=new Map([["tengxian1938_encounter_v2",JSON.stringify(old)]]);
 const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const copy=new EncounterDocument(DEFAULT_ENCOUNTER_DOCUMENT,FLOW_TIMELINE,storage);
 assert.ok(values.has(ENCOUNTER_STORAGE_KEY),"The first copy is persisted immediately");
 assert.equal(copy.value.groups[0].count,4);
 old.groups[0].count=7;storage.setItem("tengxian1938_encounter_v2",JSON.stringify(old));
 const next=new EncounterDocument(DEFAULT_ENCOUNTER_DOCUMENT,FLOW_TIMELINE,storage);
 assert.equal(next.value.groups[0].count,4,"Later edits to the old scene cannot overwrite the new scene");
 next.Change(doc=>{doc.groups[0].count=3;});
 assert.equal(JSON.parse(storage.getItem("tengxian1938_encounter_v2")).groups[0].count,7,"New edits cannot overwrite the old scene");
}
const scene=JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json",import.meta.url)));
assert.equal(scene.id,C.scene);assert.equal(ValidateScene(scene).ok,true);
assert.ok(scene.objects.some(o=>o.meta?.planning&&o.solid),"Authored encounter covers have colliders");
assert.ok(scene.surface.ramps.length>0&&scene.surface.pockets.length>0);
const surface=SceneSurfaceSampler({pockets:[],ramps:[{points:[[0,0],[0,10]],width:2,from:0,to:2}]},()=>3);
assert.equal(surface(0,0),0);assert.equal(surface(0,5),1);assert.equal(surface(0,10),2);assert.equal(surface(20,5),3);
{
 const terrain={minX:-30,minZ:-30,cols:120,rows:120,cellM:.5};
 const pre=Float32Array.from({length:121*121},(_,i)=>Math.sin(i*.02)*.1+3);
 const patches={pockets:[{box:[2,4,2,4],height:1,featherM:1.5}],ramps:[{points:[[0,0],[0,10]],width:2,from:0,to:2}]};
 const sample=SceneSurfaceSampler(patches,GridSampler(terrain,pre)),reference=new Float32Array(pre);
 for(let z=0;z<=120;z++)for(let x=0;x<=120;x++)reference[z*121+x]=sample(-30+x*.5,-30+z*.5);
 const actual=PrepareSceneTerrain({terrain,surface:patches},pre).heights;
 assert.deepEqual(actual,reference,"Bounded surface work preserves every height sample");
}
{
 const merged=CompileEncounterVariant(FIRST_LEVEL_CAMPAIGN_VARIANT_ID);
 assert.equal(FIRST_LEVEL_CAMPAIGN_STAGES.length,merged.stages.length,"Campaign stage table matches L1_BeishaheMerged stage count");
 for(let i=0;i<merged.stages.length;i++){
  assert.equal(FIRST_LEVEL_CAMPAIGN_STAGES[i].id,merged.stages[i].id);
  assert.equal(FIRST_LEVEL_CAMPAIGN_STAGES[i].number,i+1);
  const start=ResolveEncounterStageStart(merged,merged.stages[i].id);
  assert.equal(start.opening,i===0,"Only stage 01 starts with the opening timeline");
  assert.ok(EncounterCanPlay(start.time,merged),"Every campaign stage resolves to a playable combat beat: "+merged.stages[i].id);
 }
 assert.equal(ResolveEncounterStageStart(merged,"08a").beat.id,"08a");
 assert.equal(ResolveEncounterStageStart(merged,"08a").opening,false);
 assert.equal(ResolveEncounterStageStart(merged,null,{skipOpening:true}).opening,false);
 const openingTimeline=JSON.parse(fs.readFileSync(new URL(FIRST_LEVEL_OPENING_TIMELINE_URL,import.meta.url)));
 assert.equal(openingTimeline.schema,TIMELINE_V2_SCHEMA,"Campaign opening uses self-contained Timeline v2");
 assert.equal(ValidateTimelineAsset(openingTimeline).ok,true,"Campaign opening v2 passes validation");
 const timelineSegments=new Set((openingTimeline.segments||[]).map(s=>s.id));
 for(const id of FIRST_LEVEL_OPENING_SEQUENCES){
  assert.ok(timelineSegments.has(id),"Opening timeline v2 includes segment "+id);
 }
 for(const url of [FIRST_LEVEL_BRIDGE_DEMO_TIMELINE_URL,FIRST_LEVEL_ENDING_TIMELINE_URL]){
  const doc=JSON.parse(fs.readFileSync(new URL(url,import.meta.url)));
  assert.equal(doc.schema,TIMELINE_V2_SCHEMA,"Campaign timeline uses v2 schema: "+url);
  assert.equal(ValidateTimelineAsset(doc).ok,true,"Campaign timeline passes validation: "+url);
 }
 // Formal XBot-skinned / minimalRig soldiers must never fall back to legacy Lugou ActorCrowd
 // (which only loads TengxianNra02 under minimalRig, turning distant IJA soldiers into NRA models
 // until crossing ACTOR_DETAIL.enterM = 46m). Native meshes must also be hidden immediately on attach.
 const soldierViewSrc=fs.readFileSync(new URL("./Script_SoldierView.mjs",import.meta.url),"utf8");
 assert.match(soldierViewSrc,/const hasSkin = this\.skins\.has\(s\);/);
 assert.match(soldierViewSrc,/const minimalRig = !!this\.ai\.ctx\.actorFactory\?\.characterAssets\?\.minimalRig;/);
 assert.match(soldierViewSrc,/const detailed = !crowd \|\| !!s\.gore \|\| hasSkin \|\| minimalRig \|\| distanceSq <= detailLimit \* detailLimit;/);
 assert.match(soldierViewSrc,/if \(hasSkin && !wasShown\)/,"Re-attaching a skinned soldier syncs its pose immediately on the rising edge");
 const xbotSrc=fs.readFileSync(new URL("./Script_EditorBlockoutXBot.mjs",import.meta.url),"utf8");
 assert.match(xbotSrc,/if \(o\.isSkinnedMesh\) \{ o\.visible = false; this\.hidden\.push\(o\); \}/,"XBotSkin hides native Lugou meshes immediately in its constructor");
 const playSrc=fs.readFileSync(new URL("./Script_EncounterPlay.mjs",import.meta.url),"utf8");
 assert.match(playSrc,/if\(!host\.actorFactory\?\.characterAssets\?\.minimalRig\)host\.ai\.PrepareCrowd\(\["nra","ija"\]\);/,"EncounterPlay skips baking legacy Lugou crowd batches under minimalRig");
}
{
 // 08c 老耿沿主街南下进救护所：没有编排 heading 的平民木偶按实际位移转向，不能倒着跑。
 const merged=CompileEncounterVariant(FIRST_LEVEL_CAMPAIGN_VARIANT_ID),beat=merged.BeatById("08c"),dt=1/30;
 let previous=null,checked=0;
 for(let time=beat.start;time<beat.start+beat.duration*0.62;time+=dt) {
  const geng=merged.evaluate(time).actors.find(actor=>actor.id==="geng");
  assert.equal(geng.heading,undefined,"08c Geng relies on movement facing");
  const spec=EncounterActorSpec(geng,null,merged.id);
  spec.yawDeg=EncounterPuppetYaw(previous,spec,dt,merged.playConfig.puppetFacing);
  if(previous&&time>beat.start+1) {
   const dx=spec.x-previous.x,dz=spec.z-previous.z,moved=Math.hypot(dx,dz),ry=spec.yawDeg*Math.PI/180;
   if(moved>0.02){assert.ok((-Math.sin(ry)*dx-Math.cos(ry)*dz)/moved>0.7,`08c Geng faces his run at ${time.toFixed(2)}s`);checked++;}
  }
  previous={x:spec.x,z:spec.z,yawDeg:spec.yawDeg};
 }
 assert.ok(checked>100,"08c Geng run is sampled");
 const still={x:3,z:4,yawDeg:37};
 assert.equal(EncounterPuppetYaw(still,{x:3.001,z:4,yawDeg:0},dt),37,"Idle jitter keeps the last facing");
 assert.equal(EncounterPuppetYaw(still,{x:30,z:4,yawDeg:0},dt),37,"Teleports keep the last facing");
}
{
 // 07c 随车南下友军（罗班长/何有田/刘文财/幺娃）：编排未写 heading 时，出生面向南行方向，且停步时 Order 不得强行掰回正北(0 rad)。
 const merged=CompileEncounterVariant(FIRST_LEVEL_CAMPAIGN_VARIANT_ID),beat=merged.BeatById("07c");
 const nowFrame=merged.evaluate(beat.start),futureFrame=merged.evaluate(beat.start+0.5);
 for(const id of ["luo","he","liu","yao"]) {
  const actor=nowFrame.actors.find(a=>a.id===id),future=futureFrame.actors.find(a=>a.id===id);
  assert.ok(actor&&future,`07c includes ally ${id}`);
  assert.equal(actor.heading,undefined,`07c ally ${id} has no authored heading`);
  const spawnYaw=EncounterInitialActorYaw(actor,{futureActor:future,beat});
  const dx=future.p[0]-actor.p[0],dz=future.p[1]-actor.p[1],dist=Math.hypot(dx,dz);
  assert.ok(dist>0.1,`07c ally ${id} advances during beat`);
  assert.ok((-Math.sin(spawnYaw)*dx-Math.cos(spawnYaw)*dz)/dist>0.8,`07c ally ${id} spawns facing travel direction instead of north`);
  const pausedOrder=EncounterOrderYaw({currentHeading:actor.heading,position:{x:actor.p[0],z:actor.p[1]},moving:false,combat:false});
  assert.equal(pausedOrder.yaw,undefined,`07c ally ${id} keeps movement facing when pausing within reachM`);
  assert.equal(pausedOrder.forceYaw,false);
 }
 const authoredOrder=EncounterOrderYaw({currentHeading:Math.PI/2,position:{x:0,z:0},moving:false,combat:false});
 assert.ok(Math.abs(authoredOrder.yaw+Math.PI/2)<1e-6,"Authored heading still applies when explicitly present");
 const lookAtOrder=EncounterOrderYaw({currentHeading:undefined,afterRouteLookAt:[10,0],position:{x:0,z:0},moving:false,combat:false,routeFinished:true});
 assert.ok(Math.abs(lookAtOrder.yaw+Math.PI/2)<1e-6,"afterRouteLookAt applies after route completion");
 const suspicionOrder=EncounterOrderYaw({currentHeading:undefined,position:{x:0,z:0},moving:false,combat:false,suspicionPlayer:{x:0,z:10}});
 assert.equal(suspicionOrder.forceYaw,true,"Stealth suspicion forces yaw toward player");
 assert.ok(Math.abs(Math.abs(suspicionOrder.yaw)-Math.PI)<1e-6,"Stealth suspicion faces player south");
}
{
 // 08 沟北九四式：离开官道碾过东侧铁丝网，停在反坦克沟北沿（上口 z≈468.3），不堵板桥北头，不与老乡、架桥组、沟北火力组相撞。
 const merged=CompileEncounterVariant(FIRST_LEVEL_CAMPAIGN_VARIANT_ID),from=merged.BeatById("08b").start,to=merged.BeatById("08d").end;
 let last=null;
 for(let time=from;time<to;time+=0.25) {
  const frame=merged.evaluate(time),tank=frame.actors.find(actor=>actor.id==="tank3");
  if(!tank) continue;
  for(const other of frame.actors) {
   if(other.id==="tank3"||other.kind!=="person"||other.pose==="dead") continue;
   assert.ok(Math.hypot(other.p[0]-tank.p[0],other.p[1]-tank.p[1])>2.6,`08 tank3 clears ${other.id} at ${time.toFixed(2)}`);
  }
  if(last&&Math.hypot(tank.p[0]-last.p[0],tank.p[1]-last.p[1])>0.05) {
   const dx=tank.p[0]-last.p[0],dz=tank.p[1]-last.p[1];
   assert.ok((Math.sin(tank.heading)*dx-Math.cos(tank.heading)*dz)/Math.hypot(dx,dz)>0.6,`08 tank3 drives nose first at ${time.toFixed(2)}`);
  }
  last=tank;
 }
 assert.ok(last.p[1]+1.68<468.3&&Math.abs(last.p[0]-99)>5,"08 tank3 stops on the ditch lip off the plank bridge");
 const spec=EncounterActorSpec(last,null,merged.id);
 assert.equal(spec.shape,"tankette");
 assert.ok(Math.abs(spec.arc.yawDeg+last.turret*180/Math.PI)<1e-9,"Tank turret yaw reaches the puppet");
}
{
 // Editor-side Play Guide (2D tactical minimap, facing math, target markers & dialogue history)
 const Round2=v=>v.map(n=>Math.round(n*1000)/1000+0);
 assert.deepEqual(Round2(YawForwardXZ(0)),[0,-1],"yaw 0 faces North (-Z)");
 assert.deepEqual(Round2(YawForwardXZ(-Math.PI/2)),[1,0],"yaw -pi/2 faces East (+X)");
 assert.deepEqual(Round2(YawForwardXZ(Math.PI)),[0,1],"yaw pi faces South (+Z)");
 assert.deepEqual(Round2(YawForwardXZ(Math.PI/2)),[-1,0],"yaw +pi/2 faces West (-X)");
 assert.equal(YawCompass(0),"北");assert.equal(YawCompass(-Math.PI/2),"东");assert.equal(YawCompass(Math.PI),"南");assert.equal(YawCompass(Math.PI/2),"西");
 assert.equal(CompassDirection(10,0),"东");assert.equal(CompassDirection(-10,10),"西南");
 assert.equal(RelativeDirection(0,10,0),"右侧");assert.equal(RelativeDirection(0,-10,0),"左侧");
 assert.equal(RelativeDirection(Math.PI,10,0),"左侧");assert.equal(RelativeDirection(0,0,-10),"正前方");

 for(const variantId of ["L1_Original","L1_BeishaheMerged"]) {
  const variant=CompileEncounterVariant(variantId);
  const docBefore=JSON.stringify(variant.defaultDocument);
  const compiled=CompileEncounters(variant.defaultDocument,variant.timeline);
  for(const beat of variant.timeline.filter(b=>EncounterCanPlay(b.start,variant))) {
   const plan=new EncounterPlayPlan(variant.defaultDocument,beat.start,variant);
   const authored=plan.Frame();
   const guide=BuildPlayObjectiveGuide({variant,compiled,state:{...plan.State(),ready:true,stealth:authored.stealth},
    player:{x:authored.player[0],z:authored.player[1],yaw:0,stance:"stand",alive:true},authoredFrame:authored});
   assert.ok(guide.primaryTarget?.point?.every(Number.isFinite),`${variantId} ${beat.id} resolves a finite primary target`);
   assert.ok(guide.checklist.length>0,`${variantId} ${beat.id} provides an actionable gate checklist`);
  }
  assert.equal(JSON.stringify(variant.defaultDocument),docBefore,`${variantId} play guide never mutates authoring data`);
 }

 // Combat target tagging + live soldier/puppet heading merge
 {
  const merged=CompileEncounterVariant("L1_BeishaheMerged");
  const compiled=CompileEncounters(merged.defaultDocument,merged.timeline);
  const beat=merged.BeatById("08c");
  const plan=new EncounterPlayPlan(merged.defaultDocument,beat.start,merged);
  const authored=plan.Frame();
  const soldiersById=new Map([
   [101,{id:101,kind:"nra",alive:true,position:{x:106,y:0,z:478},yaw:0,stance:"crouch",weapon:"Zb26"}],
   [202,{id:202,kind:"ija",alive:true,position:{x:100,y:0,z:456},yaw:Math.PI,stance:"stand",weapon:"Type38"}],
  ]);
  const liveActors=[
   {id:"yao",soldierId:101,alive:true,position:[106,0,478],group:null},
   {id:"MergedBoards_0",soldierId:202,alive:true,position:[100,0,456],group:"MergedBoards"},
  ];
  const puppets=[{id:"tank3",kind:"tank",stance:"stand",x:115,z:465.8,yawDeg:180}];
  const guide=BuildPlayObjectiveGuide({variant:merged,compiled,state:{...plan.State(),ready:true,conditions:["combat"]},
   player:{x:104,z:478,yaw:0,stance:"crouch",alive:true,fovDeg:75},liveActors,soldiersById,puppets,authoredFrame:authored});
  const enemy=guide.entities.find(e=>e.id==="MergedBoards_0");
  const ally=guide.entities.find(e=>e.id==="yao");
  const tank=guide.entities.find(e=>e.id==="tank3");
  assert.ok(enemy?.isTarget&&enemy.side==="enemy"&&Math.abs(enemy.yaw-Math.PI)<1e-6,"Required living enemy is tagged with live facing");
  assert.ok(ally?.side==="friend"&&ally.heavy&&Math.abs(ally.yaw)<1e-6,"Live ally merges heavy flag and facing");
  assert.ok(tank?.kind==="tank"&&Math.abs(tank.yaw-Math.PI)<1e-6,"Live puppet converts yawDeg to radians");
  assert.equal(guide.primaryTarget.kind,"combat");
  assert.deepEqual(guide.primaryTarget.point,[100,456]);
 }

 // Interact -> Retreat target transition (06f plant first bundle then retreat)
 {
  const variant=CompileEncounterVariant("L1_Original");
  const compiled=CompileEncounters(variant.defaultDocument,variant.timeline);
  const beat=variant.BeatById("06f");
  const plan=new EncounterPlayPlan(variant.defaultDocument,beat.start,variant);
  const area=plan.Area();
  const beforeInteract=BuildPlayObjectiveGuide({variant,compiled,state:{...plan.State(),ready:true,conditions:["interact","retreat","event"]},
   player:{x:area.center[0],z:area.center[1],yaw:0,stance:"stand",alive:true},authoredFrame:plan.Frame()});
  assert.equal(beforeInteract.primaryTarget.kind,"interact");
  assert.equal(beforeInteract.primaryTarget.canInteractNow,true);
  const afterInteract=BuildPlayObjectiveGuide({variant,compiled,state:{...plan.State(),ready:true,conditions:["retreat","event"]},
   player:{x:area.center[0],z:area.center[1],yaw:0,stance:"stand",alive:true},authoredFrame:plan.Frame()});
  assert.equal(afterInteract.primaryTarget.kind,"retreat");
  assert.deepEqual(afterInteract.primaryTarget.point,beat.p.at(-1));
 }

 // Dialogue history dedup, transient F prompt stripping, retry marker and filtering
 {
  assert.equal(NormalizeDialogueText({order:true,text:"快去按F\nF · 完成当前交互"}),"快去按F");
  const log=new PlayDialogueHistory();
  const sides=new Map([["luo","friend"],["player","player"]]);
  log.Ingest({beatId:"08a",beatTitle:"抵沟口",elapsed:2,lines:[
   {id:"08a_0",actorId:"player",name:"顺子",text:"走个锤子！"},
   {id:"08a_order",actorId:"luo",name:"罗班长",text:"跟车走！",order:true},
  ],sideByActorId:sides});
  // Stepping into interact area appends transient prompt; must not duplicate order line
  log.Ingest({beatId:"08a",beatTitle:"抵沟口",elapsed:4,lines:[
   {id:"08a_order",actorId:"luo",name:"罗班长",text:"跟车走！\nF · 完成当前交互",order:true},
  ],sideByActorId:sides});
  assert.equal(log.LineCount(),2,"Duplicate active lines and transient F suffixes do not spam dialogue history");
  assert.equal(log.Filtered("speech").filter(e=>e.kind==="line").length,1);
  assert.equal(log.Filtered("order").filter(e=>e.kind==="line").length,1);
  assert.equal(log.MarkRetry("08a","抵沟口",0),true);
  log.Ingest({beatId:"08a",beatTitle:"抵沟口",elapsed:1,lines:[
   {id:"08a_0",actorId:"player",name:"顺子",text:"走个锤子！"},
  ],sideByActorId:sides});
  assert.equal(log.LineCount(),3,"After checkpoint retry, re-spoken lines append cleanly after the retry divider");
  assert.ok(log.entries.some(e=>e.kind==="divider"&&/检查点重来/.test(e.text)));
 }

 // Play startup resilience: background/occluded tab must not deadlock PaintFrame, and progress resets stall deadline.
 {
  const playRuntimeSrc=fs.readFileSync(new URL("./Script_EncounterPlay.mjs",import.meta.url),"utf8");
  const playHostSrc=fs.readFileSync(new URL("./AdvancedTools/Script_LevelFlowPlay.mjs",import.meta.url),"utf8");
  assert.match(playRuntimeSrc,/function PaintFrame[\s\S]*document\.hidden[\s\S]*visibilitychange/,
   "EncounterPlay PaintFrame must fall back when document.hidden is true so background/occluded tabs never deadlock Play loading");
  assert.match(playHostSrc,/TouchLoadProgress\(step\)/,"LevelFlowPlay must reset the stall deadline as loading steps advance");
  assert.match(playHostSrc,/Play 加载超时（停在：/,"LevelFlowPlay timeout toast must report the stalled step");
  const playCss=fs.readFileSync(new URL("./Style_EncounterPlay.css",import.meta.url),"utf8");
  assert.doesNotMatch(playCss,/\.encounterGame\s+\.hudActions\b/,"Encounter Play must keep .hudActions visible so reload/interact prompts render");
  assert.match(playCss,/\.encounterDual\s+#hud\{[^}]*z-index:\s*2/,"Dual-viewport Encounter Play must layer #hud above .encounterPrimary");
  assert.match(playRuntimeSrc,/hud\.ClearStaging\?\.\(\)/,"Encounter Play must clear hidden brief/title staging timers so ammo and reload prompts are not suppressed");
  assert.match(playRuntimeSrc,/UpdateMissionArea\(frame,dt\)/,"Encounter Play must update soft mission-area boundary each frame");
  assert.match(playRuntimeSrc,/hud\.SetMissionArea\?\.\(/,"Encounter Play must drive the HUD mission-area countdown");
 }

 // Soft mission-area boundary (Option A): covers every playable beat route and 08c northern active combat (including eastern MergedRifles),
 // while triggering grace -> countdown -> reset / failure when straying beyond the localized edge markers.
 {
  for (const vid of ["L1_BeishaheMerged", "L1_Original"]) {
   const v = CompileEncounterVariant(vid);
   const compiled = CompileEncounters(v.defaultDocument, v.timeline);
   for (const beat of v.timeline.filter((b) => EncounterCanPlay(b.start, v))) {
    const area = ResolveEncounterMissionArea(beat, v, compiled);
    assert.ok(area && !area.exempt, `${vid} ${beat.id} has an active soft boundary`);
    for (const pt of beat.p) {
     const d = DistanceToArea({ x: pt[0], z: pt[1] }, area);
     assert.ok(d <= 0, `${vid} ${beat.id} player route point ${JSON.stringify(pt)} must stay inside soft boundary (dist=${d.toFixed(2)}m)`);
    }
   }
  }
  const merged = CompileEncounterVariant("L1_BeishaheMerged");
  const compiledMerged = CompileEncounters(merged.defaultDocument, merged.timeline);
  const area08c = ResolveEncounterMissionArea("08c", merged, compiledMerged);
  assert.equal(area08c.authored, true, "08c uses explicit authored open-field soft boundary");
  for (const [label, pt] of [
   ["south trench", [104, 478]],
   ["road flare", [100, 428]],
   ["west flanking field", [66, 420]],
   ["MergedBoards", [96, 434]],
   ["MergedRifles spawn", [134, 390]],
   ["MergedRifles east cover", [145, 412]],
   ["east flank behind rifles", [153, 415]],
  ]) {
   const d = DistanceToArea({ x: pt[0], z: pt[1] }, area08c);
   assert.ok(d <= -2, `08c soft boundary must enclose ${label} ${JSON.stringify(pt)} (dist=${d.toFixed(2)}m)`);
  }
  for (const [label, pt] of [
   ["far west field", [50, 420]],
   ["far east field", [166, 415]],
   ["far north retreat", [100, 366]],
  ]) {
   const d = DistanceToArea({ x: pt[0], z: pt[1] }, area08c);
   assert.ok(d > 0, `08c soft boundary must warn at ${label} ${JSON.stringify(pt)} (dist=${d.toFixed(2)}m)`);
  }
  const guard = new MissionAreaGuard(MISSION_AREA_GUARD);
  assert.equal(guard.Update(MISSION_AREA_GUARD.stepGraceS + 0.1, { step: "08c", point: { x: 100, z: 428 }, area: area08c }).warning, false);
  assert.equal(guard.Update(MISSION_AREA_GUARD.graceS * 0.5, { step: "08c", point: { x: 166, z: 415 }, area: area08c }).warning, false, "brief step outside stays in grace");
  const warned = guard.Update(MISSION_AREA_GUARD.graceS, { step: "08c", point: { x: 166, z: 415 }, area: area08c });
  assert.equal(warned.warning, true, "straying east past localized markers raises out-of-area countdown");
  const backIn = guard.Update(0.5, { step: "08c", point: { x: 150, z: 415 }, area: area08c });
  assert.equal(backIn.warning, false, "returning inside combat area immediately clears warning");
  const failed = guard.Update(MISSION_AREA_GUARD.countdownS + 1, { step: "08c", point: { x: 166, z: 415 }, area: area08c });
  assert.equal(failed.failed, true, "ignoring countdown triggers out-of-area failure");
 }
}
console.log("ok  Encounter Play: keyframe starts, real arrival and survival, reinforcement caps, interaction gates, immutable drafts, valid models/music, campaign sync, playtest 2D guide and independent scene");
