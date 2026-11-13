import assert from "node:assert/strict";
import fs from "node:fs";
import { FLOW_TIMELINE, FLOW_DURATION, STAGE_TIMELINE, DEFAULT_ENCOUNTER_DOCUMENT, BeatById, EvaluateFlow, OPENING_ENEMY_ENTRY_TIME, Distance } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { CompileEncounters, ValidateEncounterDocument, UpgradeEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { FLOW_GROUND, FLOW_GROUND_FORMATIONS, FLOW_PREVIOUS_ENCOUNTER, FLOW_PREVIOUS_DRAG_ENCOUNTER, FLOW_OPENING, FLOW_OPENING_RESCUE, FLOW_PREVIOUS_BATCH_ENCOUNTER, FLOW_PREVIOUS_FLANK, FLOW_PREVIOUS_PURSUIT } from "./AdvancedTools/Data_LevelFlow.mjs";
import { EnterArea, SegmentDistance } from "./AdvancedTools/Script_LevelFlowGeometry.mjs";
import { EncounterDocument, CreateFramePacket, ReadFramePacket, AddPngFrameMetadata, ReadPngFrameMetadata, ValidateScreenshot } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { BuildEncounterMap, EncounterFloorConnections, EncounterHeightAt } from "./AdvancedTools/Script_LevelFlowMap.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./AdvancedTools/Data_LevelFlowSource.mjs";
import { FLOW_PREVIOUS_CORNER, FLOW_DRAG_REARGUARD, FLOW_FRIEND_REINFORCEMENTS } from "./AdvancedTools/Data_LevelFlow.mjs";
import { BuildEncounterTerrain } from "./AdvancedTools/Script_LevelFlowTerrain.mjs";
import { EncounterRaster } from "./AdvancedTools/Script_LevelFlowRaster.mjs";
import { IsEncounterCover } from "./AdvancedTools/Script_LevelFlowView.mjs";
import { FlowPerspectiveView } from "./AdvancedTools/Script_LevelFlowPerspective.mjs";
import { L0610_LANE, L0610_SOUTH_LANE } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";

// Compare incremental depth interpolation against the original barycentric
// equation, including either winding and triangles crossing the viewport.
function RasterEdge(a,b,x,y) {return (x-a.x)*(b.y-a.y)-(y-a.y)*(b.x-a.x);}
let rasterSeed=734;
function RasterRandom() {
  rasterSeed=(Math.imul(rasterSeed,1664525)+1013904223)>>>0;
  return rasterSeed/4294967296;
}
for(const perspective of [false,true]) for(let sample=0;sample<60;sample++) {
  const width=64,height=48;
  const raster={width,height,perspective,triangles:0,image:{data:new Uint8ClampedArray(width*height*4)},depth:new Float32Array(width*height).fill(Infinity)};
  const vertices=Array.from({length:3},()=>({x:RasterRandom()*128-32,y:RasterRandom()*96-24,depth:0.15+RasterRandom()*1500}));
  const [a,b,c]=vertices,area=RasterEdge(a,b,c.x,c.y);
  EncounterRaster.prototype.Triangle.call(raster,a,b,c,"#aabbcc");
  if(Math.abs(area)<0.001) continue;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const first=RasterEdge(b,c,x+0.5,y+0.5)/area,second=RasterEdge(c,a,x+0.5,y+0.5)/area,third=1-first-second;
    const inside=first>=-1e-7&&second>=-1e-7&&third>=-1e-7,index=y*width+x;
    assert.equal(Number.isFinite(raster.depth[index]),inside,"incremental raster retains triangle coverage");
    if(!inside) continue;
    const expected=perspective?1/(first/a.depth+second/b.depth+third/c.depth):first*a.depth+second*b.depth+third*c.depth;
    assert.ok(Math.abs(raster.depth[index]-expected)<Math.max(1e-5,expected*1e-6),"incremental raster retains perspective-correct depth");
    assert.deepEqual([...raster.image.data.slice(index*4,index*4+3)],[170,187,204]);
  }
}

// Smooth colors retain the same depth test and use perspective-correct weights.
for (const perspective of [false, true]) {
  const raster = {width:16, height:16, perspective, triangles:0,
    image:{data:new Uint8ClampedArray(16 * 16 * 4)}, depth:new Float32Array(16 * 16).fill(Infinity)};
  const vertices = [
    {x:0, y:0, depth:2, rgb:[20, 40, 60]},
    {x:16, y:0, depth:8, rgb:[180, 100, 80]},
    {x:0, y:16, depth:4, rgb:[60, 200, 120]},
  ];
  EncounterRaster.prototype.Triangle.call(raster, ...vertices, "#000000");
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15 - y; x++) {
    const weights = [1 - (x + y + 1) / 16, (x + 0.5) / 16, (y + 0.5) / 16];
    const factors = weights.map((weight, index) => weight / (perspective ? vertices[index].depth : 1));
    const total = factors.reduce((sum, value) => sum + value, 0);
    for (let channel = 0; channel < 3; channel++) {
      const expected = factors.reduce((sum, value, index) => sum + value * vertices[index].rgb[channel], 0) / total;
      assert.ok(Math.abs(raster.image.data[(y * 16 + x) * 4 + channel] - expected) <= 0.51,
        "terrain colors interpolate continuously inside a triangle");
    }
  }
}
const clipped = FlowPerspectiveView.prototype.FaceVertices.call({
  type:"scene", freeCamera:{}, width:64, height:64, focal:32, far:1500, CameraPoint:point => point,
}, [[0,0,0], [1,0,1], [0,1,1]], [[0,0,0], [100,100,100], [200,200,200]]);
assert.ok(clipped.every(vertex => vertex.depth >= 0.15 && vertex.rgb.length === 3));
assert.ok(clipped.some(vertex => Math.abs(vertex.depth - 0.15) < 1e-8 && Math.abs(vertex.rgb[0] - 15) < 1e-8),
  "near-plane clipping interpolates terrain colors with geometry");

const ReferenceTime = seconds => seconds >= 86 ? seconds + BeatById("02c").start - 86
  : seconds >= 37 ? seconds + BeatById("01e").start - 37 : seconds;
const defaults=DEFAULT_ENCOUNTER_DOCUMENT;
assert.equal(FLOW_DURATION,1910);
assert.equal(FLOW_TIMELINE.length,68);
assert.deepEqual(Object.keys(FLOW_SOURCE_EXCERPTS),FLOW_TIMELINE.map((beat)=>beat.id));
assert.equal(STAGE_TIMELINE[6].end,1100);
assert.ok(STAGE_TIMELINE.slice(0,7).every((stage)=>stage.status==="定稿"));
assert.ok(STAGE_TIMELINE.slice(7).every((stage)=>stage.status==="草稿"));
for(let index=1;index<FLOW_TIMELINE.length;index++) {
  const previous=FLOW_TIMELINE[index-1],beat=FLOW_TIMELINE[index];
  assert.equal(beat.start,previous.end);
  assert.ok(Distance(previous.p.at(-1),beat.p[0])<0.01,`${beat.id} continuous route`);
}
ValidateEncounterDocument(defaults,FLOW_TIMELINE);
// The fugitives meet the northeastern relief, then hold the branch junction.
const survivorsAt = (time) => EvaluateFlow(time).actors.filter((actor) => actor.groupId === "OpeningSurvivors");
for (let slot = 0; slot < 3; slot++) {
  const contact = BeatById("02g").start + 0.8 + slot * 0.25, escape = contact + 1.3;
  const frame = EvaluateFlow(contact + 0.4);
  const enemy = frame.actors.find(actor => actor.id === `opening${slot + 6}`);
  const ally = frame.actors.find(actor => actor.id === enemy.meleePartnerId);
  assert.equal(enemy.pose, "melee");
  assert.equal(ally.pose, "melee");
  assert.equal(ally.meleePartnerId, enemy.id);
  assert.ok(Math.abs(Distance(enemy.p, ally.p) - 1.2) < 0.001, "each rear skirmish has a distinct opponent at bayonet range");
  assert.equal(EvaluateFlow(escape + 0.01).actors.find(actor => actor.id === enemy.id).pose, "run");
  assert.ok(["dead", "wounded"].includes(EvaluateFlow(escape + 0.01).actors.find(actor => actor.id === ally.id).pose));
}
const escapedFrame = EvaluateFlow(ReferenceTime(123.9));
assert.equal(survivorsAt(ReferenceTime(123.9)).length, 3, "all three disengage during the player's first shot beat");
for (const enemy of survivorsAt(ReferenceTime(123.9))) {
  assert.equal(enemy.pose, "run");
  const rearAllies = escapedFrame.actors.filter(actor => ["openingAlly9", "openingAlly10", "openingAlly11"].includes(actor.id));
  assert.ok(rearAllies.every(ally => Distance(enemy.p, ally.p) > 10), "fugitives have cleared the rear melee crowd at the reported frame");
}
for (let stamp = ReferenceTime(110); stamp < ReferenceTime(160); stamp += 0.05) for (const id of ["opening6", "opening7", "opening8", "openingAlly9", "openingAlly10", "openingAlly11"]) {
  const before = EvaluateFlow(stamp).actors.find(actor => actor.id === id);
  const after = EvaluateFlow(stamp + 0.05).actors.find(actor => actor.id === id);
  assert.ok(Distance(before.p, after.p) < 0.26, `${id} approaches, fights and withdraws continuously at ${stamp}`);
}
const openingFrames = [111, 115, 116.4, 118, 123.9, 130, 145, 160].map(ReferenceTime).map(stamp => EvaluateFlow(stamp));
for (const stamp of [160, 123.9, 116.4, 145, 111].map(ReferenceTime)) EvaluateFlow(stamp);
assert.deepEqual([111, 115, 116.4, 118, 123.9, 130, 145, 160].map(ReferenceTime).map(stamp => EvaluateFlow(stamp)), openingFrames);
assert.equal(survivorsAt(ReferenceTime(149.63)).length,3);
assert.deepEqual(survivorsAt(ReferenceTime(160)).map((actor)=>actor.id),survivorsAt(ReferenceTime(149.63)).map((actor)=>actor.id),"the same three survivors persist across the 02/03 boundary");
const rallyFrame=EvaluateFlow(ReferenceTime(145));
const reliefAtRally=rallyFrame.actors.filter((actor)=>actor.groupId==="ForkRelief");
assert.equal(reliefAtRally.length,2);
assert.ok([...survivorsAt(ReferenceTime(145)),...reliefAtRally].every((actor)=>Distance(actor.p,[12,44])<2),"both groups meet at marked point 1");
const blockingFrame=EvaluateFlow(ReferenceTime(165));
const blockers=blockingFrame.actors.filter((actor)=>["OpeningSurvivors","ForkRelief"].includes(actor.groupId));
assert.equal(blockers.length,5);
assert.ok(blockers.every((actor)=>actor.pose==="shoot"&&actor.firing&&Distance(actor.p,[23.5,67.1])<4),"five reunited enemies block marked point 2");
for(const actor of blockers) assert.ok(blockingFrame.effects.some((effect)=>effect.kind==="fire"&&effect.side==="enemy"&&Distance(effect.a,actor.p)<0.01&&Distance(effect.b,blockingFrame.player)<0.01),"each blocker fires toward the squad");
for(const stamp of [130,145,160].map(ReferenceTime)) for(const id of ["opening6","opening7","opening8"]) {
  const a=EvaluateFlow(stamp-0.001).actors.find((actor)=>actor.id===id);
  const b=EvaluateFlow(stamp+0.001).actors.find((actor)=>actor.id===id);
  assert.ok(a&&b&&Distance(a.p,b.p)<0.02,`${id} moves continuously through ${stamp}`);
}
assert.ok(!EvaluateFlow(BeatById("03c").start).actors.some((actor)=>actor.groupId==="OpeningSurvivors"),"junction blockers clear before the next withdrawal encounter");
const junctionDraft=structuredClone(defaults);
junctionDraft.revision="2026-11-13-drag-1";
junctionDraft.groups=junctionDraft.groups.filter((group)=>!["ForkRelief","SearchNeighbor"].includes(group.id));
junctionDraft.triggers=junctionDraft.triggers.filter((trigger)=>trigger.id!=="Trigger_ForkRelief");
junctionDraft.groups.find((group)=>group.id==="Fork").count=8;
const junctionUpgrade=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(junctionDraft),setItem:()=>{}}).value;
assert.equal(junctionUpgrade.groups.find((group)=>group.id==="ForkRelief").count,2);
assert.equal(junctionUpgrade.groups.find((group)=>group.id==="Fork").count,8);
assert.ok(!junctionUpgrade.groups.some((group)=>group.id==="SearchNeighbor"));
ValidateEncounterDocument(junctionUpgrade,FLOW_TIMELINE);
const junctionDocument=new EncounterDocument(defaults,FLOW_TIMELINE,null);
junctionDocument.Replace(junctionDraft);
assert.deepEqual(junctionDocument.value,junctionUpgrade,"old imported projects receive the same junction reinforcement upgrade");
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
delete group.spawnOffsets;delete group.memberPlans;group.area.size=[2.4,3];
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
const sample=EvaluateFlow(ReferenceTime(384)),view={center:[32,106],scale:5.5};
document.Change((value)=>value.annotations.push({id:"TestNote",kind:"arrow",a:[28,100],b:[35,112],text:"在这里补两人",time:384,view}));
const packet=CreateFramePacket(document.value,sample,view,{width:984,height:492});
assert.deepEqual(ReadFramePacket(JSON.parse(JSON.stringify(packet)),FLOW_TIMELINE),packet);
const tinyPng=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lLsAAAAASUVORK5CYII=","base64"));
const png=AddPngFrameMetadata(tinyPng.buffer,packet);
assert.deepEqual(ReadPngFrameMetadata(png.buffer),packet,"single PNG preserves time, world coordinates, markings and encounter settings");
assert.throws(()=>ReadPngFrameMetadata(tinyPng.buffer));
const scene=JSON.parse(fs.readFileSync(new URL("./Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json",import.meta.url),"utf8"));
const map=BuildEncounterMap(scene);
assert.ok(IsEncounterCover(map.objects.find(object=>object.id==="WaterVat_T2")),"cover metadata marks ordinary prop materials");
assert.ok(IsEncounterCover(map.objects.find(object=>object.id==="Encounter_DragWestBerm")),"authored planning berms receive cover markings");
assert.ok(IsEncounterCover({material:"Whitebox/Cover"}));
assert.equal(IsEncounterCover(map.objects.find(object=>object.id==="DoorBoard_T2")),false,"ordinary whitebox props keep their own appearance");
assert.ok(map.objects.length>1000&&map.fields.length>30);
for(const id of ["GengGateLintel","DogHoleLintel"]) assert.ok(map.objects.some((object)=>object.id===id));
assert.ok(map.markers.some((marker)=>marker.name==="狗洞"&&marker.p[0]===92&&marker.p[1]===473));
for(const point of [[0,-4],[0,0],[21.9,67.1],[63,64.5],[35,144.5],[56,152],[58.2,156.8],[100,380],[100,385],[80,383],[100,458],[110,465],[109,470],[124,495],[100,521],[128,525],[197.3,418],[197.25,456.25]]) {
  assert.ok(EncounterFloorConnections(point,map).length>=2,`canonical passage joins at ${point}`);
}
for(const id of ["SW","ES","SE_N","SE","NE","NE_S"]) assert.ok(map.roads.some((road)=>road.id===id),`${id} curved alley is present`);
// Ground-level pursuit starts before the casualty collection point.
const tankGate=baseline.groups.find((group)=>group.id==="TankEscort");
assert.ok(tankGate.start>BeatById("03h").start&&tankGate.start<BeatById("04a").start);
const missedTank=structuredClone(defaults);
missedTank.triggers.find((trigger)=>trigger.id==="Trigger_TankEscort").area.center=[300,300];
assert.ok(!EvaluateFlow(ReferenceTime(652.25),missedTank).actors.some((actor)=>actor.kind==="tank"),"moving the early trigger also controls vehicle arrival");
const noEscort=structuredClone(defaults);noEscort.groups.find((group)=>group.id==="TankEscort").enabled=false;
assert.ok(EvaluateFlow(ReferenceTime(652.25),noEscort).actors.some((actor)=>actor.id==="tank1"),"turning off infantry preserves the triggered vehicle");
let movingTanks=0,waitingTanks=0,grenadeFrames=0,earlyGrenades=0;
for(let time=tankGate.start;time<BeatById("06i").end;time+=0.5) {
  const frame=EvaluateFlow(time);
  const grenades=frame.effects.filter((effect)=>effect.kind==="grenade"&&effect.side==="enemy");
  grenadeFrames+=grenades.length;
  if(time<BeatById("04a").start) earlyGrenades+=grenades.length;
  for(const tank of frame.actors.filter((actor)=>actor.kind==="tank")) {
    if(tank.moving) movingTanks++;else waitingTanks++;
    for(const dx of [-0.81,0.81]) for(const dz of [-1.54,1.54]) {
      const yaw=tank.heading,corner=[tank.p[0]+dx*Math.cos(yaw)+dz*Math.sin(yaw),tank.p[1]-dx*Math.sin(yaw)+dz*Math.cos(yaw)];
      assert.ok(EncounterHeightAt(corner,map)>1.99,`${time} ${tank.id} entire hull remains on ground above the trench`);
    }
  }
  for(const infantry of frame.actors.filter((actor)=>["GroundWest","GroundEast"].includes(actor.groupId)&&actor.pose==="shoot")) {
    assert.ok(EncounterHeightAt(infantry.p,map)>1.99,"flanking infantry stop at surface cover away from ramps");
  }
  const first=frame.actors.find((actor)=>actor.id==="tank1");
  if(first) for(const escort of frame.actors.filter((actor)=>actor.groupId==="TankEscort"&&actor.pose!=="dead")) {
    assert.ok(escort.p[1]<first.p[1]-1,"escort remains behind its vehicle");
  }
}
assert.ok(movingTanks>50&&waitingTanks>50,"vehicles visibly alternate advance and infantry-covering halts");
assert.ok(grenadeFrames>50&&earlyGrenades>0,"enemy grenade attacks recur from the drag segment through the tank battle");
// Ground pursuit uses separate lanes, with a stationary pair covering each bound.
const groundGroupIds=new Set(FLOW_GROUND_FORMATIONS.map(formation=>formation.id));
const advancingPairs=new Set();
let coveredBounds=0;
for(let stamp=tankGate.start;stamp<BeatById("06h").end;stamp+=0.25) {
  const frame=EvaluateFlow(stamp);
  const activeGroups=new Set(frame.groups.filter(group=>stamp<group.end).map(group=>group.id));
  const infantry=frame.actors.filter(actor=>groundGroupIds.has(actor.groupId)&&activeGroups.has(actor.groupId)&&actor.pose!=="dead");
  for(let first=0;first<infantry.length;first++) {
    const actor=infantry[first];
    for(let second=first+1;second<infantry.length;second++) {
      assert.ok(Distance(actor.p,infantry[second].p)>1.5,`${stamp} ${actor.id} keeps clear of ${infantry[second].id}`);
    }
    for(const [id,x,z,width,height,depth] of FLOW_GROUND.cover) {
      assert.ok(Math.abs(actor.p[0]-x)>width/2+0.25 || Math.abs(actor.p[1]-z)>depth/2+0.25,
        `${stamp} ${actor.id} passes around ${id}`);
    }
  }
  for(const id of ["GroundWest","GroundEast"]) {
    const members=infantry.filter(actor=>actor.groupId===id);
    if(members.length!==4) continue;
    const moving=members.filter(actor=>actor.pose==="run");
    assert.ok(moving.length<=2,`${id} retains a covering pair`);
    if(moving.length) {
      assert.ok(members.some(actor=>actor.firing),`${id} provides fire while advancing`);
      coveredBounds++;
      for(const actor of moving) advancingPairs.add(`${id}_${Math.floor(Number(actor.id.split("_").at(-1))/2)}`);
    }
  }
}
assert.equal(advancingPairs.size,4,"both pairs on both flanks take turns advancing");
assert.ok(coveredBounds>100,"alternating cover persists across the ground pursuit");
const formationFrame=EvaluateFlow(ReferenceTime(455.569)).actors.filter(actor=>groundGroupIds.has(actor.groupId));
EvaluateFlow(ReferenceTime(710));EvaluateFlow(ReferenceTime(384));
assert.deepEqual(EvaluateFlow(ReferenceTime(455.569)).actors.filter(actor=>groundGroupIds.has(actor.groupId)),formationFrame);

const previousGroundDraft=structuredClone(defaults);
previousGroundDraft.revision="2026-11-13-flank-refill-1";
for(const formation of FLOW_GROUND_FORMATIONS) {
  const group=previousGroundDraft.groups.find(item=>item.id===formation.id);
  group.area.size=[...formation.previousAreaSize];delete group.spawnOffsets;delete group.memberPlans;delete group.holdUntil;
}
previousGroundDraft.groups.find(group=>group.id==="GroundWest").speed=3;
previousGroundDraft.groups.find(group=>group.id==="GroundEast").route=[[125,109],[130,170]];
previousGroundDraft.groups=previousGroundDraft.groups.filter(group=>group.id!=="TankRearScreen");
const groundDocument=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(previousGroundDraft),setItem:()=>{}});
assert.deepEqual(groundDocument.value.groups.find(group=>group.id==="GroundWest").memberPlans,defaults.groups.find(group=>group.id==="GroundWest").memberPlans);
assert.equal(groundDocument.value.groups.find(group=>group.id==="GroundWest").speed,3);
assert.equal(groundDocument.value.groups.find(group=>group.id==="GroundEast").memberPlans,undefined,"a custom ground route retains its authored movement");
assert.ok(!groundDocument.value.groups.some(group=>group.id==="TankRearScreen"));
groundDocument.Replace(previousGroundDraft);
assert.equal(groundDocument.value.revision,defaults.revision,"imports receive the same ground formation migration");
ValidateEncounterDocument(groundDocument.value,FLOW_TIMELINE);
assert.equal(map.ramps.length,12);
assert.equal(map.objects.filter((object)=>object.planning).length,FLOW_GROUND.cover.length);
for(const ramp of map.ramps) {
  assert.equal(EncounterHeightAt(ramp.points[0],map),0,`${ramp.id} joins trench floor`);
  assert.ok(Math.abs(EncounterHeightAt(ramp.points.at(-1),map)-FLOW_GROUND.height)<1e-6,`${ramp.id} reaches surface`);
  assert.ok(EncounterFloorConnections(ramp.points[0],map,ramp.id).length>0,`${ramp.id} opens into a canonical passage`);
}
const camp=EvaluateFlow(BeatById("04a").start+5);
for(const id of ["CampWestGun","CampEastGun"]) {
  const gunner=camp.actors.find((actor)=>actor.groupId===id&&actor.heavy);
  assert.ok(gunner&&EncounterHeightAt(gunner.p,map)>1.99,`${id} defends collection area from a ground emplacement`);
}
// Upgrade untouched default fields while retaining a user's local changes.
const oldDraft=structuredClone(defaults);oldDraft.revision=FLOW_PREVIOUS_ENCOUNTER.revision;
for(const collection of ["groups","triggers"]) {
  oldDraft[collection]=FLOW_PREVIOUS_ENCOUNTER[collection].map((previous)=>{
    const item=structuredClone(defaults[collection].find((entry)=>entry.id===previous.id));
    Object.assign(item,structuredClone(previous));
    for(const key of ["tankId","grenadeInterval","weapon"]) delete item[key];
    return item;
  });
}
oldDraft.groups.find((group)=>group.id==="TankEscort").count=9;
oldDraft.groups=oldDraft.groups.filter((group)=>group.id!=="SearchNeighbor");
const oldStorage={getItem:()=>JSON.stringify(oldDraft),setItem:()=>{}};
const upgraded=new EncounterDocument(defaults,FLOW_TIMELINE,oldStorage).value;
const upgradedEscort=upgraded.groups.find((group)=>group.id==="TankEscort");
assert.equal(upgradedEscort.count,9);assert.equal(upgradedEscort.beat,"03h");
assert.deepEqual(upgradedEscort.route,defaults.groups.find((group)=>group.id==="TankEscort").route);
assert.ok(upgraded.groups.some((group)=>group.id==="CampEastGun"));
assert.ok(!upgraded.groups.some((group)=>group.id==="SearchNeighbor"),"a user-deleted group stays deleted during upgrade");
ValidateEncounterDocument(upgraded,FLOW_TIMELINE);

// The gun-pit survivors return continuously with Yaowa and pursuit stays back.
const returnIds = ["yao","openingGun0","openingGun2","pitRifleman"];
const returnFrame = EvaluateFlow(ReferenceTime(312.442));
assert.equal(returnFrame.actors.filter(actor => actor.groupId === "PitSurvivors" && actor.alive && actor.wounded).length,3);
assert.equal(returnFrame.actors.filter(actor => actor.groupId === "Rim" && actor.pose !== "dead").length,3);
for (const stamp of [BeatById("03d").start,BeatById("03f").start,BeatById("03g").start,BeatById("03h").start]) {
  for (const id of returnIds) {
    const before = EvaluateFlow(stamp-0.001).actors.find(actor => actor.id === id);
    const after = EvaluateFlow(stamp+0.001).actors.find(actor => actor.id === id);
    assert.ok(before && after && Distance(before.p,after.p)<0.03,`${id} crosses ${stamp} without a position jump`);
  }
}
for (let stamp=ReferenceTime(292);stamp<ReferenceTime(400);stamp+=0.25) {
  const frame=EvaluateFlow(stamp);
  const friends=frame.actors.filter(actor => ["player","friend"].includes(actor.side) && actor.pose!=="dead");
  for (const enemy of frame.actors.filter(actor => ["Rim","RearPursuit","TrafficFlank"].includes(actor.groupId) && actor.pose!=="dead")) {
    assert.ok(Distance(enemy.p,frame.player)>=16,`${enemy.id} maintains firing distance at ${stamp}`);
    assert.ok(friends.every(friend => Distance(enemy.p,friend.p)>=9),`${enemy.id} stays outside the retreating group at ${stamp}`);
  }
}
const plannedPursuit=structuredClone(defaults);
const plannedRim=plannedPursuit.groups.find(group=>group.id==="Rim");
plannedRim.memberPlans=[{delay:1,route:plannedRim.route.slice(1)}];
const plannedFrame=EvaluateFlow(ReferenceTime(312.442),plannedPursuit);
assert.ok(plannedFrame.actors.filter(actor=>actor.groupId==="Rim").every(actor=>Distance(actor.p,plannedRim.area.center)>40),"advance behavior supports individual plans with firing distance");
const previousPursuit=structuredClone(defaults);
previousPursuit.revision="2026-11-13-ground-formation-1";
for (const collection of ["groups","triggers"]) for (const previous of FLOW_PREVIOUS_PURSUIT[collection]) {
  previousPursuit[collection][previousPursuit[collection].findIndex(entry=>entry.id===previous.id)]=structuredClone(previous);
}
const LoadPursuit=value=>new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(value),setItem:()=>{}}).value;
const upgradedPursuit=LoadPursuit(previousPursuit);
for (const previous of FLOW_PREVIOUS_PURSUIT.groups) assert.deepEqual(upgradedPursuit.groups.find(group=>group.id===previous.id),defaults.groups.find(group=>group.id===previous.id));
previousPursuit.groups.find(group=>group.id==="Rim").count=7;
previousPursuit.groups.find(group=>group.id==="TrafficFlank").route=[[1,2],[3,4]];
previousPursuit.groups=previousPursuit.groups.filter(group=>group.id!=="RearPursuit");
const customPursuit=LoadPursuit(previousPursuit);
assert.equal(customPursuit.groups.find(group=>group.id==="Rim").count,7);
assert.deepEqual(customPursuit.groups.find(group=>group.id==="TrafficFlank").route,[[1,2],[3,4]]);
assert.ok(!customPursuit.groups.some(group=>group.id==="RearPursuit"));

// The annotated door approach precedes the ramp chase and fork pursuit.
const Group=(id)=>baseline.groups.find(group=>group.id===id);
const chaseFrame=EvaluateFlow(ReferenceTime(253.908)),chase=chaseFrame.actors.filter(actor=>actor.groupId==="Corner");
assert.equal(chase.length,6,"the reported 03C frame has six pursuers");
assert.ok(chase.some(actor=>actor.firing)&&chase.some(actor=>actor.pose==="run"),"covering fire supports the advancing pair");
for(let stamp=Group("Corner").start;stamp<Group("Corner").lives[0].fall;stamp+=0.1) {
  const frame=EvaluateFlow(stamp),enemies=frame.actors.filter(actor=>actor.groupId==="Corner");
  for(const [index,enemy] of enemies.entries()) {
    for(const friend of frame.actors.filter(actor=>actor.side==="friend"&&actor.pose!=="dead")) {
      assert.ok(Distance(enemy.p,friend.p)>10,"pursuers retain firing distance from the evacuation and covering soldiers");
    }
    for(const other of enemies.slice(index+1)) assert.ok(Distance(enemy.p,other.p)>0.7,"the ramp formation keeps separate bodies");
  }
}
const settledChase=EvaluateFlow(ReferenceTime(280)).actors.filter(actor=>actor.groupId==="Corner");
assert.ok(settledChase.every(actor=>actor.firing&&actor.p[0]>=54),"all six settle at their rear firing positions");
assert.equal(new Set(settledChase.map(actor=>actor.p.join(","))).size,6);
for(const plan of FLOW_DRAG_REARGUARD) {
  const fall=BeatById(plan.fallBeat).start+BeatById(plan.fallBeat).duration*plan.fallFraction;
  const before=EvaluateFlow(fall-0.01),after=EvaluateFlow(fall+0.01);
  const living=before.actors.find(actor=>actor.id===plan.id),dead=after.actors.find(actor=>actor.id===plan.id);
  assert.ok(living.firing&&living.pose==="shoot","the ordinary rear guard covers the withdrawal before being hit");
  assert.ok(before.effects.some(effect=>effect.kind==="fire"&&effect.side==="enemy"&&Distance(effect.b,living.p)<0.01),"incoming fire reaches the guard at the casualty cue");
  assert.equal(dead.pose,"dead");assert.ok(!dead.firing);
  assert.deepEqual(EvaluateFlow(ReferenceTime(410)).actors.find(actor=>actor.id===plan.id).p,dead.p,"the fallen guard stays at the casualty location");
  EvaluateFlow(ReferenceTime(0));EvaluateFlow(ReferenceTime(600));
  assert.deepEqual(EvaluateFlow(fall+0.01).actors.find(actor=>actor.id===plan.id),dead,"rewinding never resurrects a fallen guard after the cue");
}
const previousCornerDraft=structuredClone(defaults);
previousCornerDraft.revision="2026-11-13-ground-formation-1";
const previousCorner=previousCornerDraft.groups.find(group=>group.id==="Corner");
Object.assign(previousCorner,structuredClone(FLOW_PREVIOUS_CORNER));
for(const field of ["memberPlans","standoffMetres","spacingMetres","coverWaitSeconds"]) delete previousCorner[field];
const UpgradeCorner=value=>new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(value),setItem:()=>{}}).value;
assert.deepEqual(UpgradeCorner(previousCornerDraft).groups.find(group=>group.id==="Corner"),defaults.groups.find(group=>group.id==="Corner"),"existing two-person drafts receive all six pursuit plans");
const importedCorner=new EncounterDocument(defaults,FLOW_TIMELINE,null);importedCorner.Replace(previousCornerDraft);
assert.deepEqual(importedCorner.value,UpgradeCorner(previousCornerDraft),"saved drafts and imported projects share the upgrade");
previousCorner.count=9;previousCorner.speed=1.7;previousCorner.enabled=false;
const customCorner=UpgradeCorner(previousCornerDraft).groups.find(group=>group.id==="Corner");
assert.equal(customCorner.count,9);assert.equal(customCorner.speed,1.7);assert.equal(customCorner.enabled,false);
previousCorner.route=[[77,58],[80,80]];
const authoredCorner=UpgradeCorner(previousCornerDraft).groups.find(group=>group.id==="Corner");
assert.deepEqual(authoredCorner.route,previousCorner.route);
assert.equal(authoredCorner.behavior,"advance");assert.equal(authoredCorner.memberPlans,undefined);
previousCornerDraft.groups=previousCornerDraft.groups.filter(group=>group.id!=="Corner");
assert.ok(!UpgradeCorner(previousCornerDraft).groups.some(group=>group.id==="Corner"),"deleted pursuit groups stay deleted");
assert.ok(Group("Fork").start<Group("Corner").start&&Group("Corner").start<Group("Rim").start);
assert.ok(Group("Fork").route.every(point=>point[1]<63),"first pressure approaches the doorway on the northern surface");
for(const id of ["Corner","Rim","RearPursuit","TrafficFlank"]) {
  const rampId=id==="Corner"?"DugoutPressureRamp":id==="TrafficFlank"?"TrafficFlankRamp":"NorthPursuitRamp";
  for(const point of map.ramps.find(ramp=>ramp.id===rampId).points) {
    assert.ok(Group(id).route.some(waypoint=>Distance(point,waypoint)<1e-6),`${id} travels through every waypoint of ${rampId}`);
  }
}
assert.equal(Group("Rim").count,3);assert.equal(Group("RearPursuit").count,3);
assert.ok(Group("RearPursuit").start>=Math.max(...Group("Rim").lives.map(life=>life.fall)),"two northern waves arrive sequentially");
const flankStart=Group("TrafficFlank").start;
const flank=Group("TrafficFlank"),firstBatch=flank.lives.slice(0,3),secondBatch=flank.lives.slice(3);
const westScreens=map.objects.filter(object=>["Encounter_WestPursuitScreen","Encounter_WestPursuitReturn"].includes(object.id));
for (const life of flank.lives) {
  const frame=EvaluateFlow(life.born+0.001);
  const entrant=frame.actors.find(actor=>actor.groupId==="TrafficFlank" && actor.born===life.born);
  assert.ok(Distance(entrant.p,frame.player)>25,"west reinforcement enters at a distance");
  assert.ok(westScreens.some(screen=>EnterArea(entrant.p,frame.player,{shape:"rect",center:[screen.pos[0],screen.pos[2]],size:[screen.size[0],screen.size[2]]})!==null),"earth wall masks the entry from the player");
}
assert.equal(flank.lives.length,6);
assert.equal(flank.maxAlive,3);
assert.equal(flank.lifetime,30,"first-batch survival timing is preserved");
assert.equal(secondBatch[0].born,Math.max(...firstBatch.map(life=>life.fall)),"reinforcements wait for the entire first batch to fall");
assert.deepEqual(secondBatch.map(life=>life.born-secondBatch[0].born),[0,2,4]);
assert.ok(secondBatch.every(life=>life.born<flank.end),"03H-to-04A transition allows the full second batch to enter");
for(let stamp=flank.start;stamp<flank.end;stamp+=0.25) {
  assert.ok(EvaluateFlow(stamp).actors.filter(actor=>actor.groupId==="TrafficFlank"&&actor.pose!=="dead").length<=3);
}
assert.ok(EvaluateFlow(secondBatch[2].born+16).actors.some(actor=>actor.groupId==="TrafficFlank"&&actor.born>=secondBatch[0].born&&actor.p[1]>86&&actor.pose!=="dead"),"the second batch reaches the marked bend and continues south");
const oldFlankDraft=structuredClone(defaults);
oldFlankDraft.revision="2026-11-13-formation-1";
Object.assign(oldFlankDraft.groups.find(group=>group.id==="TrafficFlank"),FLOW_PREVIOUS_FLANK.group);
delete oldFlankDraft.groups.find(group=>group.id==="TrafficFlank").reinforceAfterClear;
Object.assign(oldFlankDraft.triggers.find(trigger=>trigger.id==="Trigger_TrafficFlank"),FLOW_PREVIOUS_FLANK.trigger);
const LoadFlankDraft=value=>new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(value),setItem:()=>{}}).value;
assert.deepEqual(LoadFlankDraft(oldFlankDraft).groups.find(group=>group.id==="TrafficFlank"),defaults.groups.find(group=>group.id==="TrafficFlank"));
const customFlankDraft=structuredClone(oldFlankDraft),customFlank=customFlankDraft.groups.find(group=>group.id==="TrafficFlank");
customFlank.count=9;customFlank.route=[[5,74],[18,90],[30,86]];customFlank.enabled=false;
const migratedFlank=LoadFlankDraft(customFlankDraft).groups.find(group=>group.id==="TrafficFlank");
assert.equal(migratedFlank.count,9);
assert.deepEqual(migratedFlank.route,customFlank.route);
assert.equal(migratedFlank.enabled,false);
customFlankDraft.groups=customFlankDraft.groups.filter(group=>group.id!=="TrafficFlank");
assert.ok(!LoadFlankDraft(customFlankDraft).groups.some(group=>group.id==="TrafficFlank"));
const slowFlankDraft=structuredClone(defaults);
slowFlankDraft.groups.find(group=>group.id==="TrafficFlank").lifetime=40;
const slowFlank=CompileEncounters(slowFlankDraft,FLOW_TIMELINE).groups.find(group=>group.id==="TrafficFlank");
assert.equal(slowFlank.lives[3].born,Math.max(...slowFlank.lives.slice(0,3).map(life=>life.fall)),"editing survival time recomputes the clear gate");
assert.ok(flankStart>BeatById("03h").start&&flankStart<BeatById("03h").end);
assert.ok(!EvaluateFlow(flankStart-0.01).actors.some(actor=>actor.groupId==="TrafficFlank"));
assert.ok(EvaluateFlow(flankStart+0.01).actors.some(actor=>actor.groupId==="TrafficFlank"));
const shiftedFlank=structuredClone(defaults);
shiftedFlank.triggers.find(trigger=>trigger.id==="Trigger_TrafficFlank").area.center=[300,300];
assert.equal(CompileEncounters(shiftedFlank,FLOW_TIMELINE).groups.find(group=>group.id==="TrafficFlank").start,null);
assert.ok(!EvaluateFlow(ReferenceTime(380),shiftedFlank).actors.some(actor=>actor.groupId==="TrafficFlank"),"west-ramp reinforcement depends on reaching point 2");
assert.ok(!EvaluateFlow(ReferenceTime(420),shiftedFlank).actors.some(actor=>actor.groupId==="TrafficFlank"),"both batches wait when point 2 is missed");
assert.equal(EvaluateFlow(ReferenceTime(227.14)).actors[0].pose,"kneel","the box-stack firing pause uses a low protected posture");
const doorCoverIds=new Set(["DugoutDoorBags","DugoutDoorReturn","DugoutInnerCrates","DragFirstShield","DragCornerShield","TrafficFlankBags"].map(id=>`Encounter_${id}`));
const doorCovers=map.objects.filter(object=>doorCoverIds.has(object.id));
assert.equal(doorCovers.length,6);
for(let stamp=ReferenceTime(160);stamp<ReferenceTime(400);stamp+=0.25) {
  for(const actor of EvaluateFlow(stamp).actors.filter(actor=>["player","winter"].includes(actor.id))) {
    for(const cover of doorCovers) {
      const [x,,z]=cover.pos,[width,,depth]=cover.size;
      assert.ok(Math.abs(actor.p[0]-x)>width/2+0.35||Math.abs(actor.p[1]-z)>depth/2+0.35,"new doorway covers leave the drag route clear");
    }
  }
}
const previousDraft=structuredClone(defaults);previousDraft.revision=FLOW_PREVIOUS_DRAG_ENCOUNTER.revision;
for(const collection of ["groups","triggers"]) previousDraft[collection]=FLOW_PREVIOUS_DRAG_ENCOUNTER[collection].map(previous=>Object.assign(structuredClone(defaults[collection].find(item=>item.id===previous.id)),previous));
previousDraft.groups.find(group=>group.id==="Fork").count=8;
previousDraft.groups=previousDraft.groups.filter(group=>group.id!=="SearchNeighbor");
const updatedDraft=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(previousDraft),setItem:()=>{}}).value;
assert.equal(updatedDraft.revision,defaults.revision);
assert.equal(updatedDraft.groups.find(group=>group.id==="Fork").count,8);
assert.deepEqual(updatedDraft.groups.find(group=>group.id==="Fork").route,Group("Fork").route);
assert.ok(updatedDraft.groups.some(group=>group.id==="TrafficFlank"));
assert.ok(!updatedDraft.groups.some(group=>group.id==="SearchNeighbor"));
ValidateEncounterDocument(updatedDraft,FLOW_TIMELINE);

const reinforcementIds=FLOW_FRIEND_REINFORCEMENTS.map(plan=>plan.id);
const ReinforcementsAt=time=>EvaluateFlow(time).actors.filter(actor=>reinforcementIds.includes(actor.groupId));
assert.equal(ReinforcementsAt(BeatById("03f").start-0.01).length,0,"reinforcements are not pre-positioned before the call for help");
assert.equal(ReinforcementsAt(BeatById("03f").start).length,8,"all eight assemble in the rear camp before departure");
for(const plan of FLOW_FRIEND_REINFORCEMENTS) {
  const group=defaults.groups.find(entry=>entry.id===plan.id);
  const departure=BeatById("03f").start+group.deployDelay;
  const waiting=ReinforcementsAt(departure-0.01).filter(actor=>actor.groupId===plan.id);
  assert.equal(waiting.length,group.count);
  for(const actor of waiting) {
    assert.ok(Distance(actor.p,plan.center)<2,"waiting soldiers remain at the camp");
    assert.ok(!actor.firing&&actor.pose==="kneel","waiting soldiers do not fire from their future posts");
  }
  const moving=ReinforcementsAt(departure+3).filter(actor=>actor.groupId===plan.id);
  assert.ok(moving.every(actor=>actor.pose==="run"&&!actor.firing&&Distance(actor.p,plan.center)>group.speed*2),"each route visibly runs out from the camp");
  const length=plan.route.slice(1).reduce((sum,point,index)=>sum+Distance(plan.route[index],point),0);
  const arrival=departure+length/group.speed;
  assert.ok(arrival<BeatById("03h").start,"all three blocking positions are occupied before the retreat crosses the crest");
  for(const actor of ReinforcementsAt(arrival+0.1).filter(actor=>actor.groupId===plan.id)) {
    assert.ok(Distance(actor.p,plan.route.at(-1))<2&&actor.firing&&actor.pose==="shoot","arrived reinforcements hold their assigned blocking position");
  }
  const earlier=ReinforcementsAt(departure+3);
  ReinforcementsAt(398.287);
  assert.deepEqual(ReinforcementsAt(departure+3),earlier,"rewinding restores the same reinforcement positions");
  let previousActors=ReinforcementsAt(departure-0.01).filter(actor=>actor.groupId===plan.id);
  for(let time=departure+0.24;time<=arrival+0.5;time+=0.25) {
    const actors=ReinforcementsAt(time).filter(actor=>actor.groupId===plan.id);
    for(const actor of actors) {
      const previous=previousActors.find(entry=>entry.id===actor.id);
      assert.ok(Distance(actor.p,previous.p)<=group.speed*0.25+0.001,"reinforcements walk continuously without teleporting");
      for(const cover of map.objects.filter(object=>object.id.startsWith("Encounter_")&&object.size?.[1]>=0.8)) {
        const [x,,z]=cover.pos,[width,,depth]=cover.size;
        assert.ok(Math.abs(actor.p[0]-x)>=width/2+0.25||Math.abs(actor.p[1]-z)>=depth/2+0.25,"all three reinforcement lanes clear the authored blocking cover");
      }
    }
    previousActors=actors;
  }
}
const oldReinforcements=structuredClone(defaults);
oldReinforcements.revision="2026-11-13-pit-retreat-1";
for(const plan of FLOW_FRIEND_REINFORCEMENTS) {
  Object.assign(oldReinforcements.groups.find(group=>group.id===plan.id),structuredClone(plan.previous));
  delete oldReinforcements.groups.find(group=>group.id===plan.id).deployDelay;
  oldReinforcements.triggers.find(trigger=>trigger.id===`Trigger_${plan.id}`).beat=plan.previous.beat;
}
const migratedReinforcements=UpgradeEncounterDocument(oldReinforcements,defaults);
for(const id of reinforcementIds) assert.deepEqual(migratedReinforcements.groups.find(group=>group.id===id),defaults.groups.find(group=>group.id===id),"old unchanged groups receive the full reinforcement choreography");
assert.deepEqual(UpgradeEncounterDocument(migratedReinforcements,defaults),migratedReinforcements,"migration is idempotent");
const customizedReinforcements=structuredClone(oldReinforcements);
customizedReinforcements.groups.find(group=>group.id==="DragGround").route.push([16,90]);
customizedReinforcements.groups.find(group=>group.id==="FieldGround").count=4;
customizedReinforcements.groups.find(group=>group.id==="FieldGround").enabled=false;
customizedReinforcements.groups=customizedReinforcements.groups.filter(group=>group.id!=="CrestWest");
const preservedReinforcements=UpgradeEncounterDocument(customizedReinforcements,defaults);
assert.deepEqual(preservedReinforcements.groups.find(group=>group.id==="DragGround"),customizedReinforcements.groups.find(group=>group.id==="DragGround"),"custom routes are never replaced");
assert.equal(preservedReinforcements.groups.find(group=>group.id==="FieldGround").count,4);
assert.equal(preservedReinforcements.groups.find(group=>group.id==="FieldGround").enabled,false);
assert.ok(!preservedReinforcements.groups.some(group=>group.id==="CrestWest"),"deleted groups stay deleted");
ValidateEncounterDocument(preservedReinforcements,FLOW_TIMELINE);
const importedReinforcements=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>null,setItem:()=>{}});
importedReinforcements.Replace(oldReinforcements);
assert.deepEqual(importedReinforcements.value,migratedReinforcements,"project imports use the same migration as stored drafts");

const invalidViews=structuredClone(packet);invalidViews.context.viewports={count:4,active:0,views:[]};
assert.throws(()=>ReadFramePacket(invalidViews,FLOW_TIMELINE),"invalid viewport data is rejected before importing the document");
const ReadSceneBytes=(name)=>{const bytes=fs.readFileSync(new URL(`./Scenes/FirstLevelWhitebox/${name}`,import.meta.url));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};
const terrain=BuildEncounterTerrain(scene,ReadSceneBytes(scene.terrain.file),ReadSceneBytes(scene.trenches.datum.file),map);
const defenseWire=map.objects.filter(object=>object.meta?.obstacle==="barbedWire");
assert.ok(defenseWire.length>40,"two staggered obstacle belts are visible in the encounter map");
for(const gap of [[-36,-65],[67,-65]]) assert.ok(defenseWire.every(object=>Math.hypot(object.pos[0]-gap[0],object.pos[2]-gap[1])>6),"forward saps retain deliberate obstacle gaps");
assert.ok(map.labels.some(label=>label.name==="前哨观察哨")&&map.labels.some(label=>label.name==="前哨监听哨"));
assert.ok(!scene.trenches.segments.some(segment=>segment.id==="RearAmmoSap")&&!map.labels.some(label=>label.name.includes("弹药支线")),"the removed ammunition branch stays absent");
for(const exit of ["West","East","Left","Right"]) {
  const steps=map.objects.filter(object=>object.meta?.fortification==="counterattackStep"&&object.meta.exit===exit).sort((a,b)=>a.meta.level-b.meta.level);
  assert.equal(steps.length,5,"each dispersed counterattack exit has five physical earth steps");
  for(let index=1;index<steps.length;index++) {
    const rise=steps[index].pos[1]-steps[index-1].pos[1];
    assert.ok(rise>0.27&&rise<0.4,"the loaded infantry ascent uses climbable risers");
  }
  for(const step of steps) assert.ok(step.pos[1]+step.size[1]>terrain.heightAt(step.pos[0],step.pos[2])+0.1,"step treads remain above the excavated ground");
  const start=scene.trenches.segments.find(segment=>segment.id===`Counterattack${exit}Access`).points[0];
  assert.ok(EncounterFloorConnections(start,map).length>=2,"each exit is connected to the firing trench");
  const access=scene.trenches.segments.find(segment=>segment.id===`Counterattack${exit}Access`);
  for(let index=1;index<access.points.length;index++) {
    const a=access.points[index-1],b=access.points[index];
    for(let fraction=0;fraction<=1;fraction+=0.05) {
      const point=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];
      for(const wall of scene.objects.filter(object=>(object.group||"").includes("空气墙"))) {
        const yaw=(wall.yawDeg||0)*Math.PI/180,dx=point[0]-wall.pos[0],dz=point[1]-wall.pos[2];
        const localX=dx*Math.cos(yaw)-dz*Math.sin(yaw),localZ=dx*Math.sin(yaw)+dz*Math.cos(yaw);
        assert.ok(Math.abs(localX)>wall.size[0]/2+0.3||Math.abs(localZ)>wall.size[2]/2+0.3,"the counterattack connection stays clear of old invisible walls");
      }
    }
  }
  assert.ok(map.objects.some(object=>object.id===`Defense_Counterattack${exit}Turf`),"the exit has a concealing turf lip");
}
assert.ok(terrain.preAt(-20,70)>(terrain.preAt(-36,70)+terrain.preAt(-4,70))/2+0.5,"the rear ground has a genuine raised mound");
assert.ok(terrain.preAt(-12,-91)<(terrain.preAt(-23,-91)+terrain.preAt(-1,-91))/2-0.4,"the forward ground has a genuine shell depression");
for(const cell of terrain.cells.filter((_,index)=>index%251===0)) {
  const faces=terrain.facesForCell(cell),packed=terrain.packedFacesForCell(cell);
  assert.equal(terrain.packedFacesForCell(cell),packed,'both views reuse one immutable packed terrain cell');
  assert.deepEqual(packed,new Float32Array(faces.flatMap(face=>face.points.flatMap((point,index)=>[...point,...face.vertexColors[index]]))),
    'packed terrain retains every original vertex and color, including shared LOD edges');
  const raster={worldVertices:new Float32Array(16),worldLength:0,triangles:0};
  EncounterRaster.prototype.WorldBatch.call(raster,packed);
  EncounterRaster.prototype.WorldBatch.call(raster,packed);
  assert.equal(raster.triangles,faces.length*2);
  assert.deepEqual(raster.worldVertices.slice(0,raster.worldLength),new Float32Array([...packed,...packed]),'batch growth preserves earlier cells');
}
const campFrame = EvaluateFlow(ReferenceTime(455.569));

const campDefenders = campFrame.actors.filter(actor => ["luo","he","liu","yao"].includes(actor.id));
assert.equal(campDefenders.length,4);
for (const actor of campDefenders) {
  assert.ok(actor.p[1] < 148 && actor.firing && actor.pose === "shoot", "04C squad holds the forward trenches");
  assert.ok(campFrame.effects.some(effect => effect.kind === "fire" && Distance(effect.a,actor.p) < 0.01), "each defender covers the loading party");
  const trench = map.trenches.find(entry => entry.id === (actor.id === "he" ? "CampNorthWestDefense" : actor.id === "luo" ? "CampNorthCenterDefense" : "CampEastDefense"));
  assert.ok(Math.min(...trench.points.slice(1).map((end,index) => SegmentDistance(actor.p,trench.points[index],end))) < 0.1, "defenders stand inside their authored trench floor");
  assert.ok(terrain.heightAt(...actor.p) + 0.5 < terrain.heightAt(actor.p[0],actor.p[1]-4), "the actual scene terrain excavates each fighting position below the forward lip");
}
assert.ok(campFrame.actors.some(actor => actor.id === "yao" && actor.heavy));
assert.equal(campFrame.actors.filter(actor => ["geng","ammoCarrier1","ammoCarrier2"].includes(actor.id)).length,3);
assert.ok(campFrame.actors.some(actor => actor.carryingAmmo && actor.pose === "carry"));
assert.equal(campFrame.actors.filter(actor => ["carrier1","carrier2"].includes(actor.id)).length,2);
const campCover = map.objects.filter(object => /^Camp(North|East).*(Parapet)$/.test(object.id));
assert.equal(campCover.length,4);
for (let stamp = BeatById("04a").start; stamp < BeatById("05a").start; stamp += 0.2) {
  for (const actor of EvaluateFlow(stamp).actors.filter(actor => ["player","winter","cart"].includes(actor.id))) {
    for (const cover of campCover) assert.ok(Math.abs(actor.p[0]-cover.pos[0]) > cover.size[0]/2+0.8 || Math.abs(actor.p[1]-cover.pos[2]) > cover.size[2]/2+0.8, "new parapets preserve casualty and cart clearance");
  }
}
for (const stamp of [435,447,455.569,474.999,475,480,489.999,490].map(ReferenceTime)) {
  const snapshot = EvaluateFlow(stamp);EvaluateFlow(ReferenceTime(0));EvaluateFlow(ReferenceTime(600));
  assert.deepEqual(EvaluateFlow(stamp),snapshot,"camp deployment and loading remain deterministic after seeking");
}
for (const id of ["luo","he","liu","yao","geng"]) {
  for (const boundary of [435,455,475,490].map(ReferenceTime)) {
    const before = EvaluateFlow(boundary-0.001).actors.find(actor => actor.id === id);
    const after = EvaluateFlow(boundary+0.001).actors.find(actor => actor.id === id);
    assert.ok(Distance(before.p,after.p) < 0.03, "camp actors cross beat boundaries continuously");
  }
}
const evacuationIds=["geng","ammoCarrier1","ammoCarrier2"];
const holdRelease=BeatById("05a").start+BeatById("05a").duration*0.8;
for(let stamp=BeatById("04d").start;stamp<holdRelease;stamp+=0.25) {
  const frame=EvaluateFlow(stamp),previous=EvaluateFlow(stamp-0.25);
  const civilians=frame.actors.filter(actor=>evacuationIds.includes(actor.id));
  assert.equal(civilians.length,3,"all ammunition handlers remain visible after loading");
  for(const actor of civilians) {
    assert.ok(Distance(actor.p,previous.actors.find(entry=>entry.id===actor.id).p)<1,"evacuation never teleports");
    assert.equal(actor.pose,"run","ammunition handlers leave promptly with the cart");
  }
  const infantry=frame.actors.filter(actor=>["GroundWest","GroundEast"].includes(actor.groupId)&&actor.pose!=="dead");
  assert.ok(infantry.every(actor=>actor.p[1]<=119.5),"squad fire pins infantry north of the loading area until evacuation clears");
  for(const civilian of civilians) for(const enemy of frame.actors.filter(actor=>actor.side==="enemy"&&actor.pose!=="dead")) {
    assert.ok(Distance(civilian.p,enemy.p)>30,"enemy cannot close on the withdrawing ammunition party");
  }
  const guards=frame.actors.filter(actor=>actor.coveringEvacuation&&actor.firing);
  if(stamp<BeatById("05a").start+BeatById("05a").duration*0.72) {
    assert.ok(guards.length>=2,"one pair always covers while the other pair falls back");
    for(const guard of guards) assert.ok(frame.effects.some(effect=>effect.kind==="fire"&&effect.side==="friend"&&Distance(effect.a,guard.p)<0.01));
    for(const effect of frame.effects.filter(effect=>effect.kind==="fire"&&effect.side==="enemy")) {
      assert.ok(guards.some(guard=>Distance(effect.b,guard.p)<0.01),"covering squad draws enemy fire away from the evacuation");
    }
  }
}
const annotatedEvacuationTime=BeatById("05a").start+12.1794;
const annotatedEvacuation=EvaluateFlow(annotatedEvacuationTime);
assert.equal(annotatedEvacuation.actors.filter(actor=>actor.coveringEvacuation&&actor.firing).length,2);
EvaluateFlow(700);EvaluateFlow(0);
assert.deepEqual(EvaluateFlow(annotatedEvacuationTime),annotatedEvacuation,"annotated evacuation remains seek deterministic");
const previousCampDraft=structuredClone(defaults);
previousCampDraft.revision="2026-11-13-pit-retreat-1";
for(const group of previousCampDraft.groups.filter(group=>group.holdUntil)) {
  delete group.holdUntil;
  for(const plan of group.memberPlans) plan.route.shift();
}
previousCampDraft.groups.find(group=>group.id==="GroundWest").speed=3;
previousCampDraft.groups=previousCampDraft.groups.filter(group=>group.id!=="SearchNeighbor");
const recentCampDraft=structuredClone(previousCampDraft);
recentCampDraft.revision="2026-11-14-friend-reinforcements-1";
assert.deepEqual(UpgradeEncounterDocument(recentCampDraft,defaults),UpgradeEncounterDocument(previousCampDraft,defaults),"the latest reinforcement drafts also receive evacuation cover");
const restoredCamp=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(previousCampDraft),setItem:()=>{}}).value;
assert.equal(restoredCamp.revision,defaults.revision);
assert.deepEqual(restoredCamp.groups.find(group=>group.id==="GroundWest").memberPlans,defaults.groups.find(group=>group.id==="GroundWest").memberPlans);
assert.equal(restoredCamp.groups.find(group=>group.id==="GroundWest").speed,3);
assert.ok(!restoredCamp.groups.some(group=>group.id==="SearchNeighbor"));
previousCampDraft.groups.find(group=>group.id==="GroundWest").memberPlans[0].route[0][0]+=2;
const editedCamp=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(previousCampDraft),setItem:()=>{}}).value;
assert.deepEqual(editedCamp.groups.find(group=>group.id==="GroundWest").memberPlans,previousCampDraft.groups.find(group=>group.id==="GroundWest").memberPlans,"custom member routes stay authored");
assert.equal(editedCamp.groups.find(group=>group.id==="GroundWest").holdUntil,undefined);
for(const holdUntil of [{beat:"missing",fraction:0.5},{beat:"05a",fraction:2}]) {
  const invalid=structuredClone(defaults);invalid.groups.find(group=>group.id==="GroundWest").holdUntil=holdUntil;
  assert.throws(()=>ValidateEncounterDocument(invalid,FLOW_TIMELINE));
}
// The annotated 03B formation is created in one hidden batch. Movement starts
// after deployment and joins the approach around the new walls' open ends.
const spawnWalls=map.objects.filter(object=>["Encounter_NorthSpawnWall","Encounter_EastSpawnWall"].includes(object.id));
assert.equal(spawnWalls.length,2);
function SpawnSightBlocked(from,to,walls=spawnWalls) {
  const distance=Math.hypot(...to.map((value,axis)=>value-from[axis]));
  const steps=Math.ceil(distance/0.08);
  for(let index=1;index<steps;index++) {
    const point=from.map((value,axis)=>value+(to[axis]-value)*index/steps);
    if(terrain.heightAt(point[0],point[2])>point[1]) return true;
    for(const wall of walls) {
      const [x,,z]=wall.pos,[width,height,depth]=wall.size,base=terrain.heightAt(x,z);
      if(Math.abs(point[0]-x)<width/2&&Math.abs(point[2]-z)<depth/2&&point[1]>base&&point[1]<base+height) return true;
    }
  }
  return false;
}
const northSpawnWalls=map.objects.filter(object=>["Encounter_NorthPursuitSpawnScreen","Encounter_NorthPursuitSpawnReturn"].includes(object.id));
assert.equal(northSpawnWalls.length,2);
const northPursuit=Group("RearPursuit");
for(const life of northPursuit.lives) {
  for(const elapsed of [0,0.25,0.5]) {
    const frame=EvaluateFlow(life.born+elapsed);
    const actor=frame.actors.find(actor=>actor.groupId===northPursuit.id&&actor.born===life.born);
    for(const observer of [frame.player,[21.9,67.1],[25.171,71.957],[30,86],[35,131],[46,65.6]]) {
      const eye=[observer[0],terrain.heightAt(...observer)+1.65,observer[1]];
      for(const dx of [-0.25,0,0.25]) for(const height of [0.3,1,1.8]) {
        assert.ok(SpawnSightBlocked(eye,[actor.p[0]+dx,terrain.heightAt(...actor.p)+height,actor.p[1]],northSpawnWalls),`${actor.id} stays hidden behind the northern earth wall at birth + ${elapsed}s`);
      }
    }
  }
}
for(let stamp=northPursuit.start;stamp<northPursuit.end;stamp+=0.1) {
  for(const actor of EvaluateFlow(stamp).actors.filter(actor=>actor.groupId===northPursuit.id&&actor.pose!=="dead")) {
    for(const wall of northSpawnWalls) {
      assert.ok(Math.abs(actor.p[0]-wall.pos[0])>wall.size[0]/2+0.35||Math.abs(actor.p[1]-wall.pos[2])>wall.size[2]/2+0.35,`${actor.id} clears the northern earth wall on the way down`);
    }
  }
}
for(const id of ["Fork","Corner"]) {
  const group=Group(id),frame=EvaluateFlow(group.start);
  assert.equal(group.interval,0);
  assert.equal(group.lives.length,group.count);
  assert.ok(group.lives.every(life=>life.born===group.start),`${id} deploys simultaneously`);
  assert.ok(!EvaluateFlow(group.start-0.001).actors.some(actor=>actor.groupId===id));
  const eye=[frame.player[0],terrain.heightAt(...frame.player)+1.65,frame.player[1]];
  const actors=frame.actors.filter(actor=>actor.groupId===id);
  assert.equal(new Set(actors.map(actor=>actor.p.join(","))).size,group.count);
  for(const [index,actor] of actors.entries()) {
    assert.deepEqual(actor.p,group.area.center.map((value,axis)=>value+group.spawnOffsets[index][axis]));
    for(const dx of [-0.25,0,0.25]) for(const height of [0.3,1,1.8]) {
      assert.ok(SpawnSightBlocked(eye,[actor.p[0]+dx,terrain.heightAt(...actor.p)+height,actor.p[1]]),`${actor.id} whole body is hidden at birth`);
    }
  }
  for(let stamp=group.start;stamp<Math.min(group.end,group.lives[0].fall);stamp+=0.1) {
    for(const actor of EvaluateFlow(stamp).actors.filter(actor=>actor.groupId===id)) for(const wall of spawnWalls) {
      assert.ok(Math.abs(actor.p[0]-wall.pos[0])>wall.size[0]/2+0.25||Math.abs(actor.p[1]-wall.pos[2])>wall.size[2]/2+0.25,`${actor.id} routes around spawn walls`);
    }
  }
}
const markedFrame=EvaluateFlow(ReferenceTime(186.63)).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(markedFrame.length,5);
assert.ok(markedFrame.every(actor=>actor.pose==="kneel"&&!actor.firing));
const firstAdvance=EvaluateFlow(Group("Fork").start+10.1).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(firstAdvance.filter(actor=>actor.pose==="run").length,2);
assert.equal(firstAdvance.filter(actor=>actor.pose==="kneel").length,3,"advance starts are staggered after the hidden batch");
const reportedFrame=EvaluateFlow(ReferenceTime(207.137)).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(reportedFrame.length,5);
assert.ok(reportedFrame.some(actor=>actor.pose==="run") && reportedFrame.some(actor=>actor.firing),"covering fire continues while other members advance");
for(const [id,coverId] of [["Fork_0","Encounter_DugoutDoorBags"],["Fork_2","Encounter_DugoutInnerCrates"]]) {
  const actor=reportedFrame.find(actor=>actor.id===id),cover=map.objects.find(object=>object.id===coverId);
  assert.ok(actor.firing && actor.p[1]<cover.pos[2] && Distance(actor.p,[cover.pos[0],cover.pos[2]])<1.5,"two soldiers hold separate cover positions");
}
for(let stamp=ReferenceTime(178);stamp<ReferenceTime(232);stamp+=0.05) {
  const actors=EvaluateFlow(stamp).actors.filter(actor=>actor.groupId==="Fork");
  for(let first=0;first<actors.length;first++) for(let second=first+1;second<actors.length;second++) {
    assert.ok(Distance(actors[first].p,actors[second].p)>0.75,`formation remains separated at ${stamp}`);
  }
  for(const actor of actors) for(const cover of doorCovers) {
    assert.ok(Math.abs(actor.p[0]-cover.pos[0])>cover.size[0]/2+0.25 || Math.abs(actor.p[1]-cover.pos[2])>cover.size[2]/2+0.25,`${actor.id} stays outside doorway cover`);
  }
}
const settled=EvaluateFlow(ReferenceTime(225)).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(new Set(settled.map(actor=>actor.p.join(","))).size,5,"five separate endpoints remain after movement ends");
EvaluateFlow(ReferenceTime(207.137));EvaluateFlow(ReferenceTime(186.63));
assert.deepEqual(EvaluateFlow(ReferenceTime(225)).actors.filter(actor=>actor.groupId==="Fork"),settled,"formation seeking is deterministic");
const oldBatch=structuredClone(defaults);oldBatch.revision="2026-11-13-batch-1";
const oldFork=oldBatch.groups.find(group=>group.id==="Fork");delete oldFork.memberPlans;oldFork.count=8;
oldBatch.groups=oldBatch.groups.filter(group=>group.id!=="SearchNeighbor");
const upgradedBatch=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(oldBatch),setItem:()=>{}}).value;
assert.deepEqual(upgradedBatch.groups.find(group=>group.id==="Fork").memberPlans,Group("Fork").memberPlans);
assert.equal(upgradedBatch.groups.find(group=>group.id==="Fork").count,8);
assert.ok(!upgradedBatch.groups.some(group=>group.id==="SearchNeighbor"));
oldFork.route=[[75,44],[80,50]];
const customBatch=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(oldBatch),setItem:()=>{}}).value;
assert.equal(customBatch.groups.find(group=>group.id==="Fork").memberPlans,undefined,"a custom route keeps its authored movement");
oldFork.route=structuredClone(Group("Fork").route);
const importedBatch=new EncounterDocument(defaults,FLOW_TIMELINE,null);importedBatch.Replace(oldBatch);
assert.deepEqual(importedBatch.value.groups.find(group=>group.id==="Fork").memberPlans,Group("Fork").memberPlans);

const batchDraft=structuredClone(defaults);batchDraft.revision=FLOW_PREVIOUS_BATCH_ENCOUNTER.revision;
for(const collection of ["groups","triggers"]) batchDraft[collection]=FLOW_PREVIOUS_BATCH_ENCOUNTER[collection].map(previous=>{
  const item={...structuredClone(defaults[collection].find(item=>item.id===previous.id)),...structuredClone(previous)};
  delete item.spawnOffsets;delete item.deployDelay;delete item.memberPlans;delete item.holdUntil;return item;
});
batchDraft.groups.find(group=>group.id==="Corner").speed=3;
batchDraft.groups=batchDraft.groups.filter(group=>group.id!=="SearchNeighbor");
const batchDocument=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(batchDraft),setItem:()=>{}});
assert.deepEqual(batchDocument.value.groups.find(group=>group.id==="Fork"),defaults.groups.find(group=>group.id==="Fork"));
assert.equal(batchDocument.value.groups.find(group=>group.id==="Corner").speed,3);
assert.ok(!batchDocument.value.groups.some(group=>group.id==="SearchNeighbor"));
assert.ok(batchDocument.value.groups.some(group=>group.id==="ForkRelief"),"older drag drafts gain the junction reinforcements");
const batchJunctionDraft=structuredClone(batchDraft);batchJunctionDraft.revision="2026-11-13-junction-1";
const batchJunctionDocument=new EncounterDocument(defaults,FLOW_TIMELINE,{getItem:()=>JSON.stringify(batchJunctionDraft),setItem:()=>{}});
assert.deepEqual(batchJunctionDocument.value.groups.find(group=>group.id==="Fork"),defaults.groups.find(group=>group.id==="Fork"));
assert.ok(!batchJunctionDocument.value.groups.some(group=>group.id==="ForkRelief"),"junction drafts preserve deleted reinforcements while upgrading spawns");
batchDocument.Change(value=>value.groups.find(group=>group.id==="Fork").area.center[0]+=3);
const shifted=EvaluateFlow(Group("Fork").start,batchDocument.value).actors.find(actor=>actor.id==="Fork_0");
assert.equal(shifted.p[0],markedFrame[0].p[0]+3,"editing the region translates every authored spawn point");
assert.throws(()=>batchDocument.Change(value=>value.groups[0].spawnOffsets=[[NaN,1]]));
assert.throws(()=>batchDocument.Change(value=>value.groups[0].deployDelay=-1));
assert.throws(()=>batchDocument.Change(value=>value.groups[0].memberPlans=[{delay:-1,route:[[1,2]]}]));
assert.throws(()=>batchDocument.Change(value=>value.groups[0].memberPlans=[{delay:0,route:[[NaN,2]]}]));
for(const rampId of ["DugoutPressureRamp","NorthPursuitRamp","TrafficFlankRamp"]) {
  const ramp=map.ramps.find(ramp=>ramp.id===rampId),bottom=terrain.heightAt(...ramp.points[0]),top=terrain.heightAt(...ramp.points.at(-1));
  assert.ok(top>bottom+1,`${rampId} connects real ground to the trench floor`);
}
for(const [x,z] of [[21.9,67.1],[25,67.1],[33,100],[35,100],[40,100],[55,150],[88,238],[100,465]]) {
  const pre=terrain.preAt(x,z),expected=terrain.plan.Apply(x,z,pre,terrain.plan.natural(x,z));
  assert.equal(terrain.heightAt(x,z),expected,`real game terrain sampler at ${x},${z}`);
}
assert.ok(terrain.heightAt(33,100)<terrain.heightAt(40,100)-1,"the gully is carved into actual ground");
// A shared edge must consist of identical segments on both sides, including
// 1 m trench cells meeting the coarse surrounding terrain.
const terrainEdges=new Map();
const terrainColors = new Map();
for(const cell of terrain.cells) for(const face of terrain.facesForCell(cell)) for(let index=0;index<3;index++) {
  const a=face.points[index],b=face.points[(index+1)%3];
  const vertexKey = a.join(","), color = face.vertexColors[index];
  assert.ok(color.length === 3 && color.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255));
  if (terrainColors.has(vertexKey)) assert.deepEqual(color, terrainColors.get(vertexKey), "shared terrain vertices have identical shading across cells");
  terrainColors.set(vertexKey, color);
  const vertices=[a.join(","),b.join(",")].sort(),key=vertices.join("|");
  const boundary=Math.abs(a[0])===6144&&a[0]===b[0]||Math.abs(a[2])===6144&&a[2]===b[2];
  const edge=terrainEdges.get(key)||{count:0,boundary};edge.count++;terrainEdges.set(key,edge);
}
assert.ok([...terrainEdges.values()].every(edge=>edge.count===(edge.boundary?1:2)),"terrain has no open internal edges or coarse/fine T-junction cracks");
const ActorAt=(id,time)=>EvaluateFlow(time).actors.find(actor=>actor.id===id);
assert.ok(OPENING_ENEMY_ENTRY_TIME > 32.423);
for (let time = 0; time < OPENING_ENEMY_ENTRY_TIME; time += 0.1) {
  assert.ok(!EvaluateFlow(time).actors.some(actor => /^opening\d+$/.test(actor.id)), "attackers wait until the last retreating soldier clears the bend");
}
assert.ok(!EvaluateFlow(32.423).actors.some(actor => actor.side === "enemy"), "the annotated packing frame has no Japanese troops");
const bend = FLOW_OPENING.retreatRoute[FLOW_OPENING.enemyEntryBendIndex];
const entryFrame = EvaluateFlow(OPENING_ENEMY_ENTRY_TIME);
const withdrawing = entryFrame.actors.filter(actor => ["luo", "he", "liu"].includes(actor.id) || /^openingAlly/.test(actor.id));
assert.equal(withdrawing.length, 12);
assert.ok(withdrawing.every(actor => actor.p[1] >= bend[1] - 0.001), "all twelve soldiers clear the bend before the first attacker enters");
assert.ok(Distance(withdrawing.at(-1).p, bend) < 0.001);
const waiting = EvaluateFlow(BeatById("02b").start - 0.001).actors.filter(actor => ["luo", "he", "liu"].includes(actor.id) || /^openingAlly/.test(actor.id));
for (const actor of waiting) assert.ok(waiting.filter(other => other !== actor).every(other => Distance(actor.p, other.p) > 1.9), "the delayed call leaves individual waiting places instead of stacking twelve soldiers at the route end");
assert.equal(entryFrame.actors.filter(actor => /^opening\d+$/.test(actor.id)).length, 1);
assert.deepEqual(EvaluateFlow(OPENING_ENEMY_ENTRY_TIME - 0.001).actors.filter(actor => /^opening\d+$/.test(actor.id)), []);
// Opening regression: both friendly parties and all three hostile approaches
// must remain continuous across beats and arbitrary backward seeks.
const leaving = EvaluateFlow(ReferenceTime(26.14));
const retreatIds = ["luo", "he", "liu", ...Array.from({length:9}, (_,index)=>`openingAlly${index+3}`)];
assert.equal(leaving.actors.filter(actor=>retreatIds.includes(actor.id)).length,FLOW_OPENING.retreatCount);
assert.ok(FLOW_OPENING.retreatCount>3);
const gunIds = ["yao", "openingGun0", "openingGun1", "openingGun2"];
for (const id of gunIds.slice(1)) assert.ok(Distance(ActorAt(id,ReferenceTime(26.14)).p,ActorAt("yao",ReferenceTime(26.14)).p)<6,"yao leaves with the messenger and gun crew");
const pathDistance = (point,route) => Math.min(...route.slice(1).map((end,index)=>SegmentDistance(point,route[index],end)));
for (let stamp=24;stamp<BeatById("02b").start;stamp+=0.5) {
  for (const id of retreatIds) {
    const actor=ActorAt(id,stamp);
    assert.ok(pathDistance(actor.p,FLOW_OPENING.retreatRoute)<0.01,"the whole party uses the later withdrawal route");
    assert.ok(actor.p[1]>=ActorAt(id,stamp-0.1).p[1],"the rescue party does not return before winter calls");
  }
}
assert.ok(ActorAt("luo",ReferenceTime(64.5)).p[1]<ActorAt("luo",ReferenceTime(64)).p[1],"winter's call reverses retreat toward the branch");
for (const [index,id] of retreatIds.entries()) {
  const group=FLOW_OPENING_RESCUE.groups.find(entry=>entry.members.includes(index));
  const heard=BeatById("02b").start+group.responseDelay+group.members.indexOf(index)*FLOW_OPENING_RESCUE.memberResponseInterval;
  assert.ok(ActorAt(id,heard+0.1).p[1]<ActorAt(id,heard).p[1],"each soldier turns after hearing the call");
}
const rescueReady = retreatIds.map(id => ActorAt(id,ReferenceTime(107.654)));
assert.equal(rescueReady.filter(actor => actor.rescueLane === "branch").length,6);
assert.equal(rescueReady.filter(actor => actor.rescueLane === "south").length,6);
assert.equal(new Set(rescueReady.map(actor => actor.rescueGroup)).size,4,"each approach has two independent trios");
for (const actor of rescueReady) {
  assert.equal(actor.pose,"kneel","both lanes settle into cover before the grenade signal");
  assert.ok(rescueReady.filter(other => other !== actor).every(other => Distance(actor.p,other.p)>2),"the rescue party retains loose individual cover positions");
  assert.ok(actor.rescueLane === "branch" ? actor.p[1]<68 : actor.p[1]>72,"one lane follows the branch while the other approaches around its south side");
}
let mixedRescueFrames = 0;
for (let stamp=ReferenceTime(66);stamp<ReferenceTime(105);stamp+=0.25) {
  const actors = retreatIds.map(id => ActorAt(id,stamp));
  if (actors.some(actor => actor.pose === "walk") && actors.some(actor => actor.pose === "kneel")) mixedRescueFrames++;
  for (const actor of actors) assert.ok(Distance(actor.p,ActorAt(actor.id,stamp+0.01).p)/0.01<2.8,"rescue approaches stay below a headlong sprint");
}
assert.ok(mixedRescueFrames>50,"observation halts and advances are staggered across soldiers");
for (const id of retreatIds) {
  let reachedJunction = false, reachedSouthernBend = false, paused = false;
  for (let stamp=ReferenceTime(66);stamp<ReferenceTime(107);stamp+=0.1) {
    const actor = ActorAt(id,stamp);
    reachedJunction ||= Distance(actor.p,[23.5,67.2])<1.2;
    reachedSouthernBend ||= actor.p[0]>34 && actor.p[1]>84;
    paused ||= actor.pose === "kneel" && Distance(actor.p,ActorAt(id,ReferenceTime(107)).p)>3;
  }
  assert.ok(ActorAt(id,ReferenceTime(107)).rescueLane === "branch" ? reachedJunction : reachedSouthernBend,`${id} follows the corresponding user-drawn approach`);
  assert.ok(paused,`${id} pauses in cover during the approach`);
}
assert.ok(ActorAt("luo",ReferenceTime(112)).p[1]<ActorAt("luo",ReferenceTime(110)).p[1],"the party jumps into the trench after the grenade blasts");
assert.equal(EvaluateFlow(ReferenceTime(130)).actors.filter(actor=>retreatIds.includes(actor.id)&&actor.pose==="dead").length,7);
const openingIds = [...retreatIds,...gunIds,...Array.from({length:9},(_,index)=>`opening${index}`)];
for (let stamp=ReferenceTime(0.1);stamp<ReferenceTime(161);stamp+=0.1) {
  const before=EvaluateFlow(stamp-0.1),after=EvaluateFlow(stamp);
  for (const id of openingIds) {
    const previous=before.actors.find(actor=>actor.id===id),current=after.actors.find(actor=>actor.id===id);
    if (previous&&current) assert.ok(Distance(previous.p,current.p)<0.41,`${id} moves continuously across opening beats at ${stamp}`);
  }
}
const capturing=EvaluateFlow(BeatById("02a").start+0.05).actors.filter(actor=>/^opening\d+$/.test(actor.id));
assert.equal(capturing.length,9);
assert.ok(capturing.some(actor=>actor.pose==="run"),"the capture beat opens with troops still approaching");
for (const enemy of capturing) {
  assert.ok(enemy.born<BeatById("02a").start,"capture troops enter from the preceding scene");
  assert.ok(Distance(ActorAt(enemy.id,enemy.born).p,[66.5,64.5])>35,"troops appear on their distant approach routes");
  assert.ok(Distance(ActorAt(enemy.id,enemy.born+1).p,ActorAt(enemy.id,enemy.born).p)>2.9,"each approach visibly advances");
  assert.ok(Distance(ActorAt(enemy.id,BeatById("02b").start-1).p,FLOW_OPENING.enemyPositions[Number(enemy.id.slice(7))])<0.01,"nine attackers reach their authored stations");
}
for (const stamp of [17,26.14,39.999,40.05,64,85,107,112,130,160].map(ReferenceTime)) {
  const snapshot=EvaluateFlow(stamp);EvaluateFlow(ReferenceTime(0));EvaluateFlow(ReferenceTime(150));
  assert.deepEqual(EvaluateFlow(stamp),snapshot,"opening staging survives rewind without replaying events");
}
const lane=L0610_LANE.line.map(point=>[point.x,point.z]);
const south=L0610_SOUTH_LANE.line.map(point=>[point.x,point.z]);
for(let stamp=BeatById("05a").start;stamp<BeatById("08a").end;stamp+=0.5) {
  const cart=ActorAt("cart",stamp);
  if(cart.p[1]>=161&&cart.p[1]<=378) assert.ok(Math.min(...lane.slice(1).map((b,index)=>SegmentDistance(cart.p,lane[index],b)))<1e-6,"cart follows every canonical road bend");
  const next=ActorAt("cart",stamp+0.05),dx=next.p[0]-cart.p[0],dz=next.p[1]-cart.p[1],distance=Math.hypot(dx,dz);
  if(distance>0.001) assert.ok((Math.sin(cart.heading)*dx-Math.cos(cart.heading)*dz)/distance>0.8,"cart faces its direction of travel");
}
for(let stamp=BeatById("06b").end;stamp<BeatById("06h").end;stamp+=1) assert.deepEqual(ActorAt("cart",stamp).p,ActorAt("cart",BeatById("06b").end).p,"stalled cart stays at its authored waiting point");
assert.ok(Distance(ActorAt("cart",BeatById("09a").start).p,[104.6,379.3])<1e-6,"village parking matches the archived spatial diagram");
// 08A must act out the source passage, including the machine-gun targets.
const villageStart = BeatById("08a").start;
const VillageActors = time => EvaluateFlow(time).actors.filter(actor => actor.groupId === "VillageCasualties");
assert.equal(VillageActors(villageStart + 19.9).length, 0);
assert.deepEqual(EvaluateFlow(villageStart + 19.9).player, [100,383], "the player reaches the ramp before the villagers emerge");
assert.equal(VillageActors(villageStart + 24).length, 2);
assert.ok(VillageActors(villageStart + 24).every(actor => actor.pose === "run" && actor.p[0] > 97 && actor.p[0] < 103.25),
  "both civilians emerge from the east gate and run north in the exposed street");
for (const [id, seconds] of [["villager2",26], ["villager3",28.4]]) {
  const impact = EvaluateFlow(villageStart + seconds + 0.05);
  const victim = impact.actors.find(actor => actor.id === id);
  const shot = impact.effects.find(effect => effect.targetId === id);
  assert.equal(victim.pose, "hit");
  assert.ok(victim.fallProgress > 0 && victim.fallProgress < 1);
  assert.equal(impact.actors.find(actor => actor.id === shot.sourceId).groupId, "VillageGun");
  assert.deepEqual(shot.b, victim.p);
  assert.ok(shot.heavy && shot.phase < 0.3, "the visible machine-gun burst coincides with the hit");
  const corpse = VillageActors(villageStart + seconds + 1).find(actor => actor.id === id);
  assert.equal(corpse.pose, "dead");
  assert.deepEqual(corpse.p, victim.p, "the body stays where the villager was shot");
  assert.deepEqual(ActorAt(id, BeatById("08c").start).p, corpse.p);
  assert.deepEqual(ActorAt(id, BeatById("10b").start).p, corpse.p, "returning stretchers pass the same bodies");
}
const villageSnapshot = EvaluateFlow(villageStart + 26.4);
EvaluateFlow(0); EvaluateFlow(BeatById("10a").start);
assert.deepEqual(EvaluateFlow(villageStart + 26.4), villageSnapshot, "rewinding restores the same run, burst and fall");
const oldVillageDocument = new EncounterDocument(defaults, FLOW_TIMELINE, {getItem:()=>JSON.stringify(previousDraft), setItem:()=>{}}).value;
assert.deepEqual(EvaluateFlow(BeatById("08c").start, oldVillageDocument).actors.filter(actor => actor.groupId === "VillageCasualties"),
  VillageActors(BeatById("08c").start), "saved encounter drafts also receive the missing screenplay actors");
const boardedWinter=ActorAt("winter",BeatById("06d").start),boardingWinter=ActorAt("winter",BeatById("06d").start-0.001);
assert.equal(boardedWinter.parentId,"cart","06D opens with winter already on the cart, matching its source passage");
assert.ok(Distance(boardedWinter.p,boardingWinter.p)<0.01&&Math.abs(boardedWinter.elevation-boardingWinter.elevation)<0.01,"boarding has a continuous position and lift");
for(let stamp=BeatById("10d").start;stamp<BeatById("10f").end;stamp+=0.5) {
  const cart=ActorAt("cart",stamp),winter=ActorAt("winter",stamp);
  if(cart.p[1]>=470) assert.ok(Math.min(...south.slice(1).map((b,index)=>SegmentDistance(cart.p,south[index],b)))<1e-6,"cart uses each south-alley turn");
  assert.equal(winter.parentId,"cart");assert.equal(winter.elevation,1.05);assert.equal(winter.heading,cart.heading);assert.ok(Distance(winter.p,cart.p)<0.2);
}


const screenshot={version:1,width:1280,height:720,image:"data:image/png;base64,AA==",marks:[{kind:"arrow",a:[2,3],b:[40,50],text:""}]};
assert.deepEqual(ValidateScreenshot(screenshot),screenshot);
assert.throws(()=>ValidateScreenshot({...screenshot,marks:[{kind:"world",a:[2,3],b:[4,5],text:""}]}));
assert.throws(()=>ValidateScreenshot({...screenshot,marks:[{kind:"text",a:[NaN,3],b:[4,5],text:"x"}]}));
assert.throws(()=>ValidateScreenshot({...screenshot,width:0}));
console.log("ok  Encounter design: editable causal triggers, spawn caps and behaviors, continuous pursuit/tanks, full scene map, deterministic rewind, undo and PNG round-trip");
