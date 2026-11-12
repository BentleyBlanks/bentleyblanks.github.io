import assert from "node:assert/strict";
import fs from "node:fs";
import { FLOW_TIMELINE, FLOW_DURATION, STAGE_TIMELINE, DEFAULT_ENCOUNTER_DOCUMENT, BeatById, EvaluateFlow, Distance } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { CompileEncounters, ValidateEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { EnterArea } from "./AdvancedTools/Script_LevelFlowGeometry.mjs";
import { EncounterDocument, CreateFramePacket, ReadFramePacket, AddPngFrameMetadata, ReadPngFrameMetadata } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { BuildEncounterMap, EncounterFloorConnections } from "./AdvancedTools/Script_LevelFlowMap.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./AdvancedTools/Data_LevelFlowSource.mjs";

const defaults=DEFAULT_ENCOUNTER_DOCUMENT;
assert.equal(FLOW_DURATION,1870);
assert.equal(FLOW_TIMELINE.length,68);
assert.deepEqual(Object.keys(FLOW_SOURCE_EXCERPTS),FLOW_TIMELINE.map((beat)=>beat.id));
assert.equal(STAGE_TIMELINE[6].end,1060);
assert.ok(STAGE_TIMELINE.slice(0,7).every((stage)=>stage.status==="定稿"));
assert.ok(STAGE_TIMELINE.slice(7).every((stage)=>stage.status==="草稿"));
for(let index=1;index<FLOW_TIMELINE.length;index++) {
  const previous=FLOW_TIMELINE[index-1],beat=FLOW_TIMELINE[index];
  assert.equal(beat.start,previous.end);
  assert.ok(Distance(previous.p.at(-1),beat.p[0])<0.01,`${beat.id} continuous route`);
}
ValidateEncounterDocument(defaults,FLOW_TIMELINE);
const rectangle={shape:"rect",center:[0,0],size:[2,2]},circle={...rectangle,shape:"circle"};
assert.equal(EnterArea([-4,0],[4,0],rectangle),0.375);
assert.equal(EnterArea([-4,0],[4,0],circle),0.375);
assert.equal(EnterArea([-4,2],[4,2],rectangle),null);
assert.equal(EnterArea([0,0],[0,0],rectangle),0);
const baseline=CompileEncounters(defaults,FLOW_TIMELINE);
assert.ok(baseline.groups.every((group)=>group.start!==null),"default player route reaches all encounter gates");
const moved=structuredClone(defaults);
moved.triggers.find((trigger)=>trigger.id==="Trigger_Fork").area.center=[300,300];
assert.equal(CompileEncounters(moved,FLOW_TIMELINE).groups.find((group)=>group.id==="Fork").start,null);
assert.equal(EvaluateFlow(BeatById("03b").start+20,moved).actors.filter((actor)=>actor.groupId==="Fork").length,0,"moving trigger off the route suppresses its wave");
const configured=structuredClone(defaults),group=configured.groups.find((item)=>item.id==="Fork");
group.count=12;group.maxAlive=2;group.interval=0;group.lifetime=8;group.behavior="suppress";group.area.center=[15,52];
for(let time=BeatById("03b").start;time<BeatById("03b").end;time+=0.25) {
  const actors=EvaluateFlow(time,configured).actors.filter((actor)=>actor.groupId==="Fork"&&actor.pose!=="dead");
  assert.ok(actors.length<=2,"replacement respects maxAlive");
  assert.ok(actors.every((actor)=>Distance(actor.p,group.area.center)<2),"stationary behavior uses the edited spawn region");
}
for(let time=BeatById("03h").start;time<BeatById("03h").end-6;time+=1) {
  const frame=EvaluateFlow(time);
  assert.ok(frame.actors.some((actor)=>actor.groupId==="RearPursuit"&&actor.pose!=="dead"),`${time} pursuit continues through 03H`);
  assert.ok(frame.effects.some((effect)=>effect.kind==="fire"&&effect.side==="friend"),`${time} rear guard and crest cover are visible`);
}
assert.equal(EvaluateFlow(BeatById("03h").start+12).actors[0].pose,"shoot");
const tankBefore=EvaluateFlow(BeatById("06a").start-0.001).actors.find((actor)=>actor.id==="tank1");
const tankAfter=EvaluateFlow(BeatById("06a").start+0.001).actors.find((actor)=>actor.id==="tank1");
assert.ok(Distance(tankBefore.p,tankAfter.p)<0.01,"tank follows a continuous approach before 06");
assert.ok(EvaluateFlow(BeatById("05b").start).actors.some((actor)=>actor.id==="tank1"));
for(let time=0;time<=FLOW_DURATION;time+=0.5) {
  const frame=EvaluateFlow(time);
  for(const actor of frame.actors) assert.ok(actor.p.every(Number.isFinite),`${time} ${actor.id}`);
}
const times=[0,180,350,384,570,610,800,1060,1350,1650,1850];
const frames=times.map((time)=>EvaluateFlow(time));
for(const time of [...times].reverse()) EvaluateFlow(time);
assert.deepEqual(times.map((time)=>EvaluateFlow(time)),frames,"random seeking produces identical actor, trigger and wave states");
assert.equal(EvaluateFlow(BeatById("10f").start+1).effects.filter((effect)=>effect.kind==="fire").length,0);
const memory=new Map(),storage={getItem:(key)=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
const document=new EncounterDocument(defaults,FLOW_TIMELINE,storage);
document.Change((value)=>value.groups[0].count=8);assert.equal(document.value.groups[0].count,8);
document.Undo();assert.equal(document.value.groups[0].count,defaults.groups[0].count);
document.Redo();assert.equal(document.value.groups[0].count,8);
assert.equal(new EncounterDocument(defaults,FLOW_TIMELINE,storage).value.groups[0].count,8,"browser draft survives reload");
const before=JSON.stringify(document.value);
assert.throws(()=>document.Change((value)=>value.groups[0].count=-2));
assert.equal(JSON.stringify(document.value),before,"invalid edits leave the draft intact");
const sample=EvaluateFlow(384),view={center:[32,106],scale:5.5};
document.Change((value)=>value.annotations.push({id:"TestNote",kind:"arrow",a:[28,100],b:[35,112],text:"在这里补两人",time:384,view}));
const packet=CreateFramePacket(document.value,sample,view,{width:984,height:492});
assert.deepEqual(ReadFramePacket(JSON.parse(JSON.stringify(packet)),FLOW_TIMELINE),packet);
const tinyPng=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lLsAAAAASUVORK5CYII=","base64"));
const png=AddPngFrameMetadata(tinyPng.buffer,packet);
assert.deepEqual(ReadPngFrameMetadata(png.buffer),packet,"single PNG preserves time, world coordinates, markings and encounter settings");
assert.throws(()=>ReadPngFrameMetadata(tinyPng.buffer));
const scene=JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json",import.meta.url),"utf8"));
const map=BuildEncounterMap(scene);
assert.ok(map.objects.length>1000&&map.fields.length>30);
for(const id of ["GengGateLintel","DogHoleLintel"]) assert.ok(map.objects.some((object)=>object.id===id));
assert.ok(map.markers.some((marker)=>marker.name==="狗洞"&&marker.p[0]===92&&marker.p[1]===473));
for(const point of [[0,-4],[0,0],[21.9,67.1],[63,64.5],[35,144.5],[56,152],[58.2,156.8],[100,380],[100,385],[80,383],[100,458],[110,465],[109,470],[124,495],[100,521],[128,525],[197.3,418],[197.25,456.25]]) {
  assert.ok(EncounterFloorConnections(point,map).length>=2,`canonical passage joins at ${point}`);
}
for(const id of ["SW","ES","SE_N","SE","NE","NE_S"]) assert.ok(map.roads.some((road)=>road.id===id),`${id} curved alley is present`);
const invalidViews=structuredClone(packet);invalidViews.context.viewports={count:4,active:0,views:[]};
assert.throws(()=>ReadFramePacket(invalidViews,FLOW_TIMELINE),"invalid viewport data is rejected before importing the document");
console.log("ok  Encounter design: editable causal triggers, spawn caps and behaviors, continuous pursuit/tanks, full scene map, deterministic rewind, undo and PNG round-trip");
