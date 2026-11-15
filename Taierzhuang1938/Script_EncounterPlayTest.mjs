import assert from "node:assert/strict";
import fs from "node:fs";
import {EncounterPlayPlan,EncounterStartBeat,EncounterActorSpec,ENCOUNTER_PLAY_CONFIG as C} from "./Script_EncounterPlayPlan.mjs";
import {FLOW_TIMELINE,DEFAULT_ENCOUNTER_DOCUMENT,BeatById} from "./Scenes/FirstLevelEncounter/Script_LevelFlowModel.mjs";
import {FIRST_LEVEL_MUSIC_CUES} from "./Data_FirstLevelMissionMusic.mjs";
import {WEAPONS} from "./Data_Weapons.mjs";
import {ValidateScene} from "./Script_SceneDoc.mjs";
import {SceneSurfaceSampler} from "./Script_SceneSurface.mjs";
import {EncounterDocument,ENCOUNTER_STORAGE_KEY} from "./AdvancedTools/Script_LevelFlowDocument.mjs";
for(const beat of FLOW_TIMELINE) {
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,beat.start+beat.duration/2);
  assert.equal(plan.time,beat.start);assert.equal(plan.beat.id,beat.id);
  assert.ok(EncounterActorSpec({id:"unit",kind:"person",side:"enemy",p:[0,0]}).weapon in WEAPONS);
}
for(const cue of Object.values(C.music))assert.ok(FIRST_LEVEL_MUSIC_CUES[cue],cue);
assert.ok(WEAPONS[C.startWeapon]);
assert.equal(EncounterActorSpec({id:"donkey",kind:"donkey",side:"civilian",pose:"walk",p:[0,0]}).kind,"animal");
assert.equal(EncounterActorSpec({id:"nier",kind:"child",side:"civilian",pose:"kneel",p:[0,0]}).kind,"child");
assert.equal(EncounterActorSpec({id:"nier",kind:"child",side:"civilian",pose:"kneel",p:[0,0]}).stance,"crouch");
{
 const carrier={id:"cart",kind:"cart",side:"civilian",p:[10,20],heading:Math.PI/2};
 const actor={id:"winter",kind:"quilt",side:"friend",pose:"wounded",parentId:"cart",elevation:1.05,p:[10,20.5],heading:Math.PI/2};
 assert.equal(EncounterActorSpec(carrier).yawDeg,-90,"Vehicle models face their direction of travel");
 const spec=EncounterActorSpec(actor,carrier);assert.equal(spec.ride.on,"cart");assert.equal(spec.ride.y,1.05);assert.equal(spec.lie,"along");
}
const original=JSON.stringify(DEFAULT_ENCOUNTER_DOCUMENT);
{
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("03c").start);
  plan.Step(1000,[500,500],new Set(["Corner_0"]));
  assert.equal(plan.beat.id,"03c");assert.equal(plan.waiting,"reach");
  assert.ok(!plan.dead.has("Corner_0"),"Preview lifetimes never kill a gameplay soldier");
  plan.Kill("Corner_0");assert.ok(plan.dead.has("Corner_0"));
}
{
  const doc=structuredClone(DEFAULT_ENCOUNTER_DOCUMENT);
  const group=doc.groups.find(g=>g.id==="Fork");group.count=2;group.maxAlive=1;group.interval=0;group.reinforceAfterClear=true;
  const trigger=doc.triggers.find(t=>t.id===group.triggerId);trigger.mode="area";trigger.area.center=[300,300];
  const plan=new EncounterPlayPlan(doc,BeatById("03b").start);
  plan.Step(1,[0,0],new Set());assert.ok(!plan.triggers.has(trigger.id));
  plan.Step(0,[300,300],new Set());assert.ok(plan.triggers.has(trigger.id),"Actual player arrival fires trigger");
  const first=plan.Spawns(new Set()).find(a=>a.groupId==="Fork");assert.ok(first);plan.Spawned(first);
  plan.Step(50,[0,0],new Set([first.id]));
  assert.ok(!plan.Spawns(new Set([first.id])).some(a=>a.groupId==="Fork"),"Living soldier blocks replacement beyond preview expiry");
  plan.Kill(first.id);const second=plan.Spawns(new Set()).find(a=>a.groupId==="Fork");assert.ok(second);assert.notEqual(second.id,first.id);
}
{
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("01d").start);
  plan.Step(31,plan.beat.p[0],new Set());assert.equal(plan.waiting,"interact");
  plan.Interact();plan.Step(0,plan.beat.p[0],new Set());assert.equal(plan.beat.id,"01e");
}
assert.equal(JSON.stringify(DEFAULT_ENCOUNTER_DOCUMENT),original,"Play does not mutate authoring data");
{
  const plan=new EncounterPlayPlan(DEFAULT_ENCOUNTER_DOCUMENT,BeatById("09a").start);
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
console.log("ok  Encounter Play: keyframe starts, real arrival and survival, reinforcement caps, interaction gates, immutable drafts, valid models/music and independent scene");
