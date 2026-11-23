import assert from "node:assert/strict";
import fs from "node:fs";
import {EncounterPlayPlan,EncounterCanPlay,EncounterFirstPlayable,EncounterActorSpec,ResolveEncounterStageStart,ENCOUNTER_PLAY_CONFIG as C} from "./Script_EncounterPlayPlan.mjs";
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
import {FIRST_LEVEL_CAMPAIGN_STAGES, FIRST_LEVEL_CAMPAIGN_VARIANT_ID, FIRST_LEVEL_OPENING_CONFIG_URL, FIRST_LEVEL_OPENING_SEQUENCES, FIRST_LEVEL_OPENING_TIMELINE_URL} from "./Data_FirstLevelCampaign.mjs";
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
 const openingConfig=JSON.parse(fs.readFileSync(new URL(FIRST_LEVEL_OPENING_CONFIG_URL,import.meta.url)));
 const timelineKeyframes=new Set((openingTimeline.sequences||[]).map(s=>s.keyframe));
 const configKeyframes=new Set((openingConfig.keyframes||[]).map(k=>k.id));
 for(const id of FIRST_LEVEL_OPENING_SEQUENCES){
  assert.ok(timelineKeyframes.has(id),"Opening timeline includes sequence "+id);
  assert.ok(configKeyframes.has(id),"Opening keyframe config includes "+id);
 }
}
console.log("ok  Encounter Play: keyframe starts, real arrival and survival, reinforcement caps, interaction gates, immutable drafts, valid models/music, campaign sync and independent scene");
