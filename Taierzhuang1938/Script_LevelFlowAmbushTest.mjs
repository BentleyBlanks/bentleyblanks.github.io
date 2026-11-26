import assert from "node:assert/strict";
import fs from "node:fs";
import { BeatById, DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow, FLOW_TIMELINE, Distance } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { UpgradeEncounterDocument, ValidateEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { FLOW_PREVIOUS_AMBUSH, FLOW_PREVIOUS_INFANTRY_TANK } from "./AdvancedTools/Data_LevelFlowAmbushBaseline.mjs";
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
for(const id of ["nier","ammoCarrier1","ammoCarrier2"]) {
  const actor=focus.actors.find(actor=>actor.id===id);
  assert.ok(actor.p[1]>=345,`${id} reaches the rear bend, not the combat-side holding point`);
  assert.equal(actor.pose,"kneel");
  assert.match(actor.status,/隐蔽等后送车/);
}
assert.ok(Distance(focus.actors.find(actor=>actor.id==="geng").p,focus.actors.find(actor=>actor.id==="cart").p)<3,"Lao Geng has returned to tend the casualty and stalled cart");
assert.equal(EvaluateFlow(BeatById("06a").start).actors.filter(actor=>actor.kind==="tank").length,2);
const scene=JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json",import.meta.url),"utf8"));
for(const [id,trenchId] of [["luo","AmbushNorthDefense"],["he","AmbushNorthDefense"],["liu","AmbushRearDefense"],["yao","AmbushWestGun"]]) {
  const actor=focus.actors.find(actor=>actor.id===id),trench=scene.trenches.segments.find(trench=>trench.id===trenchId);
  assert.ok(actor.firing&&actor.pose==="shoot",`${id} holds a distinct firing position`);
  assert.ok(Math.min(...trench.points.slice(1).map((end,index)=>SegmentDistance(actor.p,trench.points[index],end)))<0.01,`${id} stands in the authored fighting trench`);
}
assert.ok(focus.actors.find(actor=>actor.id==="yao").heavy);
const handoff=EvaluateFlow(BeatById("06h").start+10);
assert.ok(Distance(handoff.player,handoff.actors.find(actor=>actor.id==="geng").p)<2,"player waits for Lao Geng to hand over the second bundle");
const ignition=EvaluateFlow(BeatById("06h").start+BeatById("06h").duration*0.8);
assert.ok(Distance(ignition.player,ignition.actors.find(actor=>actor.id==="tank2").p)>7,"player clears the rear tank before ignition");
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
const ActorAt=(id,time)=>EvaluateFlow(time).actors.find(actor=>actor.id===id);
const evacuees=["nier","ammoCarrier1","ammoCarrier2"];
for(let time=BeatById("06a").start+0.25;time<BeatById("07c").end;time+=0.25) {
  for(const id of evacuees) {
    const actor=ActorAt(id,time),before=ActorAt(id,time-0.25);
    assert.ok(Distance(actor.p,before.p)<=1.15*0.25+1e-6,`${id} walks without teleporting`);
    assert.ok(actor.p[1]>=before.p[1]-1e-6,`${id} never reverses toward the fight`);
    if(actor.pose==="kneel") assert.ok(actor.p[1]>=345,`${id} only waits after reaching the rear`);
  }
}
for(const id of evacuees) {
  assert.ok(ActorAt(id,720.8119).p[1]>=345,"annotated 06C civilians have cleared the battlefield");
  assert.ok(Distance(ActorAt(id,655).p,ActorAt(id,665).p)>10,"evacuation continues past the old thirty-second hold");
  assert.ok(Distance(ActorAt(id,BeatById("08a").start-0.001).p,ActorAt(id,BeatById("08a").start+0.001).p)<0.05,"rear rendezvous rejoins the cart continuously");
}
for(const [beatId,targetId] of [["06f","tank1"],["06h","tank2"]]) {
  const beat=BeatById(beatId),detonation=beat.start+beat.duration*0.8;
  assert.notEqual(ActorAt(targetId,detonation-0.001).pose,"burn");
  const target=ActorAt(targetId,detonation);
  assert.equal(target.pose,"burn");
  assert.ok(target.disabled&&!target.moving);
  assert.ok(EvaluateFlow(detonation+0.1).effects.some(effect=>effect.kind==="blast"&&Distance(effect.p,target.p)<0.001),"each bundle explodes at its own tank");
  for(let time=detonation;time<BeatById("07c").end;time+=0.5) {
    const frame=EvaluateFlow(time),wreck=frame.actors.find(actor=>actor.id===targetId);
    assert.deepEqual(wreck.p,target.p,"wrecks remain where they were destroyed");
    assert.equal(wreck.pose,"burn");
    assert.ok(!frame.effects.some(effect=>effect.kind==="fire"&&effect.side==="enemy"&&Distance(effect.a,wreck.p)<0.01),"destroyed tanks cannot fire");
  }
}
const rearCover=EvaluateFlow(BeatById("06g").start+20),rear=rearCover.actors.find(actor=>actor.id==="tank2");
assert.ok(rearCover.effects.some(effect=>effect.kind==="fire"&&effect.side==="enemy"&&Distance(effect.a,rear.p)<0.01),"rear tank maintains the threat after the first is destroyed");
assert.ok(rearCover.effects.some(effect=>effect.kind==="fire"&&effect.side==="friend"&&Distance(effect.b,rear.p)<0.01),"Yao Wa draws the rear turret, not the wreck");
const secondPlant=EvaluateFlow(BeatById("06h").start+BeatById("06h").duration*0.62);
assert.ok(Distance(secondPlant.player,secondPlant.actors.find(actor=>actor.id==="tank2").p)<3.5,"second planting route reaches the rear tank's nose");
for(let time=BeatById("06a").start+0.5;time<BeatById("06i").end;time+=0.5) {
  assert.ok(ActorAt("tank2",time).p[1]>=ActorAt("tank2",time-0.5).p[1]-1e-6,"rear tank never reverses");
}
const doubleWreck=EvaluateFlow(1011.8142);
assert.equal(doubleWreck.actors.filter(actor=>actor.kind==="tank"&&actor.pose==="burn").length,2);
EvaluateFlow(0);EvaluateFlow(1100);
assert.deepEqual(EvaluateFlow(1011.8142),doubleWreck,"both annotated wrecks survive backward seeking");
const oldOutcome=structuredClone(defaults);oldOutcome.revision="2026-11-14-tank-approach-1";
const oldArrival=oldOutcome.triggers.find(trigger=>trigger.id==="Arrival_06h");
oldArrival.area={shape:"circle",center:[101,281],size:[6,6]};oldArrival.label="老耿递第二捆，摸到车头";
assert.deepEqual(UpgradeEncounterDocument(oldOutcome,defaults).triggers.find(trigger=>trigger.id==="Arrival_06h"),defaults.triggers.find(trigger=>trigger.id==="Arrival_06h"));
oldArrival.area.center=[110,270];oldArrival.label="自定接近区";oldArrival.delay=3;
assert.deepEqual(UpgradeEncounterDocument(oldOutcome,defaults).triggers.find(trigger=>trigger.id==="Arrival_06h"),oldArrival,"custom interaction areas are retained");
oldOutcome.triggers=oldOutcome.triggers.filter(trigger=>trigger.id!=="Arrival_06h");
assert.ok(!UpgradeEncounterDocument(oldOutcome,defaults).triggers.some(trigger=>trigger.id==="Arrival_06h"),"deleted interaction areas stay deleted");

// 2026-11-27 combined-arms tactics checks (05A-06G): paired tank overwatch, leading LMG infantry screen, dual-wing escorts, 06G counter-assault, draft migration.
let alternatingTankTicks = 0;
for (let t = BeatById("05a").start; t < BeatById("06d").end; t += 0.5) {
  const f = EvaluateFlow(t);
  const t1 = f.actors.find(a => a.id === "tank1"), t2 = f.actors.find(a => a.id === "tank2");
  if (t1 && t2 && t1.moving !== t2.moving) alternatingTankTicks++;
}
assert.ok(alternatingTankTicks > 100, `tank1 and tank2 alternate moving/halting overwatch (${alternatingTankTicks} ticks)`);

for (const [bid, frac] of [["05b", 0.5], ["05c", 0.5], ["06a", 0.2]]) {
  const b = BeatById(bid), f = EvaluateFlow(b.start + b.duration * frac);
  const t1 = f.actors.find(a => a.id === "tank1");
  const flankMaxZ = Math.max(...f.actors.filter(a => ["GroundWest", "GroundEast"].includes(a.groupId) && a.pose !== "dead").map(a => a.p[1]));
  assert.ok(flankMaxZ >= t1.p[1] - 2, `${bid}@${frac} flanking infantry screen leads ahead of tank1 (${flankMaxZ.toFixed(1)} vs ${t1.p[1].toFixed(1)})`);
}
for (const groupId of ["GroundWest", "GroundEast", "TankRearScreen"]) {
  const f = EvaluateFlow(BeatById("06a").start + 15);
  assert.ok(f.actors.some(a => a.groupId === groupId && a.heavy), `${groupId} fields Type 11 LMG base-of-fire`);
}
for (const bid of ["05a", "05b", "05c"]) {
  const b = BeatById(bid);
  for (const frac of [0.25, 0.75]) {
    const f = EvaluateFlow(b.start + b.duration * frac);
    const firingEscorts = f.actors.filter(a => ["TankEscort", "TankRearScreen"].includes(a.groupId) && a.firing);
    assert.equal(firingEscorts.length, 0, `${bid}@${frac} vehicle escorts keep fire discipline before 06A`);
  }
}
{
  const f06a = EvaluateFlow(BeatById("06a").start + 20);
  const t1 = f06a.actors.find(a => a.id === "tank1");
  const escorts = f06a.actors.filter(a => a.groupId === "TankEscort" && a.pose !== "dead");
  assert.ok(escorts.some(a => a.p[0] < t1.p[0] - 1) && escorts.some(a => a.p[0] > t1.p[0] + 1), "TankEscort fans out across both west and east rear-quarter wings");
  const f06e = EvaluateFlow(BeatById("06e").start + 8);
  const e06e = f06e.actors.filter(a => a.groupId === "TankEscort" && a.pose !== "dead");
  assert.ok(e06e.length > 0 && e06e.every(a => a.pose !== "run"), "TankEscort kneels/fires while tank1 holds overwatch in 06E instead of running in place");
}
{
  const f06g = EvaluateFlow(BeatById("06g").start + 2);
  const reinf = f06g.actors.filter(a => a.groupId === "TankReinforce" && a.pose !== "dead");
  assert.equal(reinf.length, 5, "06G TankReinforce deploys full 5-man counter-assault team simultaneously");
  assert.ok(reinf.some(a => a.heavy), "06G TankReinforce includes LMG base-of-fire");
  const spreadX = Math.max(...reinf.map(a => a.p[0])) - Math.min(...reinf.map(a => a.p[0]));
  assert.ok(spreadX > 10, `06G TankReinforce fans across dual wings (${spreadX.toFixed(1)}m)`);
}
{
  const prevTactics = structuredClone(defaults);
  prevTactics.revision = "2026-11-17-beishahe-story-1";
  for (const old of FLOW_PREVIOUS_INFANTRY_TANK.groups) {
    const g = prevTactics.groups.find(entry => entry.id === old.id);
    Object.assign(g, structuredClone(old));
    for (const k of ["weapon", "engageOn", "fireCycle", "coverWaitSeconds"]) if (old[k] === undefined) delete g[k];
  }
  assert.deepEqual(UpgradeEncounterDocument(prevTactics, defaults), defaults, "untouched 2026-11-17 drafts upgrade cleanly to 05-06 combined-arms defaults");
  const editedTactics = structuredClone(prevTactics);
  editedTactics.groups.find(g => g.id === "GroundWest").count = 6;
  editedTactics.groups.find(g => g.id === "TankEscort").route = [[137, 53], [101, 260]];
  editedTactics.groups = editedTactics.groups.filter(g => g.id !== "TankRearScreen");
  const upgraded = UpgradeEncounterDocument(editedTactics, defaults);
  assert.equal(upgraded.groups.find(g => g.id === "GroundWest").count, 6, "custom count survives tactics upgrade");
  assert.deepEqual(upgraded.groups.find(g => g.id === "TankEscort").route, [[137, 53], [101, 260]], "custom escort route survives tactics upgrade");
  assert.ok(!upgraded.groups.some(g => g.id === "TankRearScreen"), "deleted TankRearScreen stays deleted");
}
console.log("ok  Bend ambush: rear evacuation and rendezvous, separate tank destruction, no reversing or wreck fire, clear bomb approaches, continuity, combined-arms tactics and draft migration");
