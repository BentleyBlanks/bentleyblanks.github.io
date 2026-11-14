import assert from "node:assert/strict";
import fs from "node:fs";
import { BeatById, DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow, FLOW_TIMELINE, Distance } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { UpgradeEncounterDocument, ValidateEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { FLOW_PREVIOUS_AMBUSH } from "./AdvancedTools/Data_LevelFlowAmbushBaseline.mjs";
import { FLOW_GROUND } from "./AdvancedTools/Data_LevelFlow.mjs";
import { SampleBeatRoute, SegmentDistance } from "./AdvancedTools/Script_LevelFlowGeometry.mjs";

const defaults=DEFAULT_ENCOUNTER_DOCUMENT;
for(let time=BeatById("04b").start;time<BeatById("05a").start;time+=0.5) {
  const frame=EvaluateFlow(time);
  assert.ok(!frame.actors.some(actor=>actor.kind==="tank"||["TankEscort","TankRearScreen"].includes(actor.groupId)),"no vehicles or vehicle escorts before the infantry hold ends");
  assert.ok(!frame.actors.some(actor=>["LaneGround","BendGround"].includes(actor.groupId)),"no unexplained roadside relief soldiers");
}
const screenshot=EvaluateFlow(BeatById("05b").start+5.8964),focus=EvaluateFlow(BeatById("06e").start+15.0142);
for(const id of ["geng","carrier1","carrier2","ammoCarrier1","ammoCarrier2"]) {
  assert.ok(screenshot.actors.find(actor=>actor.id===id).p[1]>screenshot.player[1]+20,`${id} gets farther ahead than the annotated screenshot`);
}
for(const id of ["geng","nier","ammoCarrier1","ammoCarrier2"]) {
  assert.ok(focus.actors.find(actor=>actor.id===id).p[1]>=310,`${id} waits beyond the southern bend`);
}
assert.equal(EvaluateFlow(BeatById("06a").start).actors.filter(actor=>actor.kind==="tank").length,2);
const scene=JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json",import.meta.url),"utf8"));
for(const [id,trenchId] of [["luo","AmbushNorthDefense"],["he","AmbushNorthDefense"],["liu","AmbushRearDefense"],["yao","AmbushWestGun"]]) {
  const actor=focus.actors.find(actor=>actor.id===id),trench=scene.trenches.segments.find(trench=>trench.id===trenchId);
  assert.ok(actor.firing&&actor.pose==="shoot",`${id} holds a distinct firing position`);
  assert.ok(Math.min(...trench.points.slice(1).map((end,index)=>SegmentDistance(actor.p,trench.points[index],end)))<0.01,`${id} stands in the authored fighting trench`);
}
assert.ok(focus.actors.find(actor=>actor.id==="yao").heavy);
const handoff=EvaluateFlow(BeatById("06h").start+20);
assert.ok(Distance(handoff.player,handoff.actors.find(actor=>actor.id==="geng").p)<2,"player waits for Lao Geng to hand over the second bundle");
const ignition=EvaluateFlow(BeatById("06h").start+BeatById("06h").duration*0.8);
assert.ok(Distance(ignition.player,[101,281])>7,"player clears the engine before ignition");
for(const beatId of ["06d","06f","06h"]) {
  const beat=BeatById(beatId);
  for(let progress=0;progress<=1;progress+=0.005) {
    const point=SampleBeatRoute(beat,progress);
    for(const [id,x,z,width,,depth] of FLOW_GROUND.cover.filter(cover=>cover[0].startsWith("Ambush"))) {
      assert.ok(Math.abs(point[0]-x)>width/2+0.3||Math.abs(point[1]-z)>depth/2+0.3,`${beatId} passes ${id} without blocking the bomb approach`);
    }
  }
}
for(const boundary of ["06a","06b","06c","06d","06e","06f","06g","06h","06i","07a"]) {
  const stamp=BeatById(boundary).start;
  for(const id of ["player","winter","cart","luo","he","liu","yao","geng","nier"]) {
    const before=EvaluateFlow(stamp-0.001).actors.find(actor=>actor.id===id),after=EvaluateFlow(stamp+0.001).actors.find(actor=>actor.id===id);
    assert.ok(Distance(before.p,after.p)<0.05,`${id} remains continuous at ${boundary}`);
  }
}
for(let stamp=BeatById("04d").start;stamp<BeatById("07a").end;stamp+=0.5) {
  const frame=EvaluateFlow(stamp);
  assert.equal(new Set(frame.actors.map(actor=>actor.id)).size,frame.actors.length,"each civilian and squad member has exactly one identity");
}
const previous=structuredClone(defaults);previous.revision=FLOW_PREVIOUS_AMBUSH.revision;
for(const collection of ["groups","triggers"]) for(const old of FLOW_PREVIOUS_AMBUSH[collection]) {
  const index=previous[collection].findIndex(entry=>entry.id===old.id);
  if(index>=0) previous[collection][index]=structuredClone(old);else previous[collection].push(structuredClone(old));
}
previous.groups.find(group=>group.id==="TankEscort").count=9;
previous.groups=previous.groups.filter(group=>group.id!=="TankRearScreen");
const migrated=UpgradeEncounterDocument(previous,defaults);
ValidateEncounterDocument(migrated,FLOW_TIMELINE);
assert.equal(migrated.groups.find(group=>group.id==="TankEscort").beat,"05a");
assert.equal(migrated.groups.find(group=>group.id==="TankEscort").count,9);
assert.equal(migrated.groups.find(group=>group.id==="LaneGround").enabled,false);
assert.ok(!migrated.groups.some(group=>group.id==="TankRearScreen"),"deleted groups stay deleted");
const edited=structuredClone(previous);edited.groups.find(group=>group.id==="TankEscort").route=[[105,187],[115,240]];
assert.deepEqual(UpgradeEncounterDocument(edited,defaults).groups.find(group=>group.id==="TankEscort").route,[[105,187],[115,240]]);
const recent=structuredClone(previous);recent.revision="2026-11-14-camp-cover-1";
assert.equal(UpgradeEncounterDocument(recent,defaults).groups.find(group=>group.id==="TankEscort").beat,"05a");
const saved=EvaluateFlow(focus.time,migrated);EvaluateFlow(0,migrated);EvaluateFlow(925,migrated);
assert.deepEqual(EvaluateFlow(focus.time,migrated),saved,"upgraded drafts remain deterministic after seeking");
console.log("ok  Bend ambush: infantry-first staging, separated evacuation, named firing trenches, clear bomb approaches, continuity and draft migration");
