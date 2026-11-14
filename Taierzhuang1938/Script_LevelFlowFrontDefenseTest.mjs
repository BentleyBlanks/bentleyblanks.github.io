import assert from "node:assert/strict";
import fs from "node:fs";
import { BeatById, DEFAULT_ENCOUNTER_DOCUMENT, EvaluateFlow, FLOW_TIMELINE, Distance } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { UpgradeEncounterDocument, ValidateEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { FLOW_PREVIOUS_FRONT_DEFENSE } from "./AdvancedTools/Data_LevelFlowAmbushBaseline.mjs";
import { FLOW_GROUND } from "./AdvancedTools/Data_LevelFlow.mjs";
import { EnterArea, SampleBeatRoute, SegmentDistance } from "./AdvancedTools/Script_LevelFlowGeometry.mjs";

const defaults=DEFAULT_ENCOUNTER_DOCUMENT;
const pursuitIds=["TrafficFlank","RearPursuit"];
const blockers=["DragGround","CrestWest","CampWestGun"];
const frontCovers=FLOW_GROUND.cover.filter(cover=>["NorthPursuitBags","NorthPursuitFrontBags","NorthPursuitSideBags","BendPursuitFrontBags"].includes(cover[0]));
const CoverArea=cover=>({shape:"rect",center:[cover[1],cover[2]],size:[cover[3],cover[5]]});
const northFrame=EvaluateFlow(383.35),northCover=frontCovers.find(cover=>cover[0]==="NorthPursuitFrontBags");
for(const enemy of northFrame.actors.filter(actor=>actor.groupId==="Rim")) {
  assert.ok(enemy.firing && enemy.p[1]<northCover[2]-northCover[5]/2);
  assert.ok(Distance(enemy.p,[northCover[1],northCover[2]])<4,"northern pursuers stand behind, not past, the new front sandbags");
  assert.notEqual(EnterArea(enemy.p,northFrame.player,CoverArea(northCover)),null,"sandbags lie between each northern pursuer and the player");
}
for(const mode of ["default","machineGunOnly"]) {
  const document=structuredClone(defaults);
  if(mode==="machineGunOnly") for(const group of document.groups) if(["DragGround","CrestWest"].includes(group.id)) group.enabled=false;
  const frame=EvaluateFlow(433.301,document),enemies=frame.actors.filter(actor=>pursuitIds.includes(actor.groupId));
  assert.equal(enemies.length,6);
  assert.ok(frame.actors.some(actor=>actor.groupId==="CampWestGun" && actor.heavy && actor.firing),"the defending machine gun remains alive and effective");
  if(mode==="machineGunOnly") {
    const machineGunners=frame.actors.filter(actor=>actor.groupId==="CampWestGun" && actor.firing);
    assert.ok(frame.effects.some(effect=>effect.kind==="fire"&&effect.side==="enemy"&&machineGunners.some(guard=>Distance(effect.b,guard.p)<0.01)),"held enemies return fire at the blocking emplacement");
  }
  const cover=frontCovers.find(cover=>cover[0]==="BendPursuitFrontBags");
  for(const enemy of enemies) {
    assert.ok(enemy.firing && enemy.p[1]<85,"enemy returns fire from cover instead of crossing the blocking line");
    assert.notEqual(EnterArea(enemy.p,[20,95.4],CoverArea(cover)),null,"bend sandbags shield each enemy from the forward defenders");
  }
  for(const [index,enemy] of enemies.entries()) for(const other of enemies.slice(index+1)) assert.ok(Distance(enemy.p,other.p)>0.75,"both waves use distinct held positions");
  for(let time=BeatById("03h").start;time<BeatById("04a").end;time+=0.25) {
    assert.ok(EvaluateFlow(time,document).actors.filter(actor=>pursuitIds.includes(actor.groupId)&&actor.pose!=="dead").every(actor=>actor.p[1]<85),"the surviving defense prevents a breakthrough throughout both beats");
  }
}
for(const mode of ["disabled","fallen","deleted"]) {
  const document=structuredClone(defaults);
  if(mode==="deleted") document.groups=document.groups.filter(group=>!blockers.includes(group.id));
  else for(const group of document.groups) if(blockers.includes(group.id)) {
    if(mode==="disabled") group.enabled=false;
    else group.lifetime=2;
  }
  ValidateEncounterDocument(document,FLOW_TIMELINE);
  for(const id of pursuitIds) assert.ok(EvaluateFlow(433.301,document).actors.some(actor=>actor.groupId===id && actor.p[1]>95),"advance is released only when the defending groups are no longer effective");
}
for(let time=BeatById("03d").start;time<BeatById("04d").end;time+=0.25) {
  for(const actor of EvaluateFlow(time).actors.filter(actor=>["player","winter","yao","openingGun0","openingGun2","pitRifleman"].includes(actor.id))) {
    for(const [id,coverX,coverZ,width,,depth] of frontCovers) assert.ok(Math.abs(actor.p[0]-coverX)>width/2+0.3 || Math.abs(actor.p[1]-coverZ)>depth/2+0.3,`${actor.id} clears ${id} at ${time}`);
  }
}
for(const id of pursuitIds) {
  const document=structuredClone(defaults);
  for(const group of document.groups) if(blockers.includes(group.id)) group.enabled=false;
  for(let time=BeatById("03g").start;time<BeatById("04a").end;time+=0.25) {
    for(const actor of EvaluateFlow(time,document).actors.filter(actor=>actor.groupId===id&&actor.pose!=="dead")) {
      for(const [coverId,coverX,coverZ,width,,depth] of frontCovers) assert.ok(Math.abs(actor.p[0]-coverX)>width/2+0.3 || Math.abs(actor.p[1]-coverZ)>depth/2+0.3,`${actor.id} routes around ${coverId} after the defense clears`);
    }
  }
}
const front=EvaluateFlow(504.217),player=front.actors.find(actor=>actor.id==="player");
assert.ok(player.firing && player.pose==="shoot" && Distance(player.p,front.actors.find(actor=>actor.id==="luo").p)<3,"Shunzi joins the leader at the front rather than waiting behind the cart");
assert.ok(front.effects.some(effect=>effect.kind==="fire"&&effect.side==="player"&&Distance(effect.a,player.p)<0.01),"Shunzi actually fires after reaching the front");
assert.ok(EvaluateFlow(BeatById("04c").start+1).actors.find(actor=>actor.id==="player").pose==="run");
const scene=JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json",import.meta.url),"utf8"));
const trench=scene.trenches.segments.find(trench=>trench.id==="CampNorthCenterDefense");
assert.ok(Math.min(...trench.points.slice(1).map((end,index)=>SegmentDistance(player.p,trench.points[index],end)))<0.7,"the player's firing position is inside the authored trench");
assert.deepEqual(front.actors.find(actor=>actor.id==="winter").p,[48,150],"wounded evacuation is independent of the player's forward route");
for(const id of ["04c","04d","05a"]) {
  const stamp=BeatById(id).start;
  assert.ok(Distance(EvaluateFlow(stamp-0.001).player,EvaluateFlow(stamp+0.001).player)<0.03,"forward movement and withdrawal remain continuous");
}
for(const beatId of ["04c","04d"]) for(let progress=0;progress<=1;progress+=0.002) {
  const point=SampleBeatRoute(BeatById(beatId),progress);
  for(const object of scene.objects.filter(object=>object.cover && object.group?.includes("集结处阻击"))) {
    assert.ok(Math.abs(point[0]-object.pos[0])>object.size[0]/2+0.3 || Math.abs(point[1]-object.pos[2])>object.size[2]/2+0.3,`${beatId} clears ${object.id}`);
  }
}
const previous=structuredClone(defaults);previous.revision=FLOW_PREVIOUS_FRONT_DEFENSE.revision;
for(const group of FLOW_PREVIOUS_FRONT_DEFENSE.groups) previous.groups[previous.groups.findIndex(entry=>entry.id===group.id)]=structuredClone(group);
previous.groups.find(group=>group.id==="Rim").count=7;
const migrated=UpgradeEncounterDocument(previous,defaults);
ValidateEncounterDocument(migrated,FLOW_TIMELINE);
for(const revision of ["2026-11-14-bend-ambush-1","2026-11-14-opening-defense-1"]) {
  const draft=structuredClone(previous);draft.revision=revision;
  const upgraded=UpgradeEncounterDocument(draft,defaults);
  assert.equal(upgraded.revision,defaults.revision);
  for(const id of pursuitIds) assert.deepEqual(upgraded.groups.find(group=>group.id===id),defaults.groups.find(group=>group.id===id));
  assert.deepEqual(upgraded.groups.find(group=>group.id==="Fork"),defaults.groups.find(group=>group.id==="Fork"));
}
assert.equal(migrated.groups.find(group=>group.id==="Rim").count,7);
for(const id of pursuitIds) assert.deepEqual(migrated.groups.find(group=>group.id===id),defaults.groups.find(group=>group.id===id));
const custom=structuredClone(previous);custom.groups.find(group=>group.id==="TrafficFlank").route=[[1,2],[3,4]];
custom.groups=custom.groups.filter(group=>group.id!=="RearPursuit");
const preserved=UpgradeEncounterDocument(custom,defaults);
assert.deepEqual(preserved.groups.find(group=>group.id==="TrafficFlank").route,[[1,2],[3,4]]);
assert.equal(preserved.groups.find(group=>group.id==="TrafficFlank").suppressedBy,undefined);
assert.ok(!preserved.groups.some(group=>group.id==="RearPursuit"));
const saved=EvaluateFlow(433.301,migrated);EvaluateFlow(504.217,migrated);EvaluateFlow(0,migrated);
assert.deepEqual(EvaluateFlow(433.301,migrated),saved,"suppression is deterministic under backward seeking");
console.log("ok  Front defense: covered enemy positions, surviving machine-gun suppression, clear-gated advance, clear routes, player forward defense and draft migration");
