import assert from "node:assert/strict";
import fs from "node:fs";
import { FLOW_TIMELINE, FLOW_DURATION, STAGE_TIMELINE, DEFAULT_ENCOUNTER_DOCUMENT, BeatById, EvaluateFlow, Distance } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { CompileEncounters, ValidateEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { FLOW_GROUND, FLOW_PREVIOUS_ENCOUNTER, FLOW_PREVIOUS_DRAG_ENCOUNTER, FLOW_OPENING, FLOW_OPENING_RESCUE, FLOW_PREVIOUS_BATCH_ENCOUNTER } from "./AdvancedTools/Data_LevelFlow.mjs";
import { EnterArea, SegmentDistance } from "./AdvancedTools/Script_LevelFlowGeometry.mjs";
import { EncounterDocument, CreateFramePacket, ReadFramePacket, AddPngFrameMetadata, ReadPngFrameMetadata, ValidateScreenshot } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { BuildEncounterMap, EncounterFloorConnections, EncounterHeightAt } from "./AdvancedTools/Script_LevelFlowMap.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./AdvancedTools/Data_LevelFlowSource.mjs";
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
// The fugitives meet the northeastern relief, then hold the branch junction.
const survivorsAt = (time) => EvaluateFlow(time).actors.filter((actor) => actor.groupId === "OpeningSurvivors");
assert.equal(survivorsAt(149.63).length,3);
assert.deepEqual(survivorsAt(160).map((actor)=>actor.id),survivorsAt(149.63).map((actor)=>actor.id),"the same three survivors persist across the 02/03 boundary");
const rallyFrame=EvaluateFlow(145);
const reliefAtRally=rallyFrame.actors.filter((actor)=>actor.groupId==="ForkRelief");
assert.equal(reliefAtRally.length,2);
assert.ok([...survivorsAt(145),...reliefAtRally].every((actor)=>Distance(actor.p,[12,44])<2),"both groups meet at marked point 1");
const blockingFrame=EvaluateFlow(165);
const blockers=blockingFrame.actors.filter((actor)=>["OpeningSurvivors","ForkRelief"].includes(actor.groupId));
assert.equal(blockers.length,5);
assert.ok(blockers.every((actor)=>actor.pose==="shoot"&&actor.firing&&Distance(actor.p,[23.5,67.1])<4),"five reunited enemies block marked point 2");
for(const actor of blockers) assert.ok(blockingFrame.effects.some((effect)=>effect.kind==="fire"&&effect.side==="enemy"&&Distance(effect.a,actor.p)<0.01&&Distance(effect.b,blockingFrame.player)<0.01),"each blocker fires toward the squad");
for(const stamp of [130,145,160]) for(const id of ["opening6","opening7","opening8"]) {
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
assert.ok(!EvaluateFlow(652.25,missedTank).actors.some((actor)=>actor.kind==="tank"),"moving the early trigger also controls vehicle arrival");
const noEscort=structuredClone(defaults);noEscort.groups.find((group)=>group.id==="TankEscort").enabled=false;
assert.ok(EvaluateFlow(652.25,noEscort).actors.some((actor)=>actor.id==="tank1"),"turning off infantry preserves the triggered vehicle");
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
assert.equal(map.ramps.length,12);
assert.equal(map.objects.filter((object)=>object.planning).length,27);
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

// The annotated door approach precedes the ramp chase and fork pursuit.
const Group=(id)=>baseline.groups.find(group=>group.id===id);
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
assert.ok(flankStart>BeatById("03h").start&&flankStart<BeatById("03h").end);
assert.ok(!EvaluateFlow(flankStart-0.01).actors.some(actor=>actor.groupId==="TrafficFlank"));
assert.ok(EvaluateFlow(flankStart+0.01).actors.some(actor=>actor.groupId==="TrafficFlank"));
const shiftedFlank=structuredClone(defaults);
shiftedFlank.triggers.find(trigger=>trigger.id==="Trigger_TrafficFlank").area.center=[300,300];
assert.equal(CompileEncounters(shiftedFlank,FLOW_TIMELINE).groups.find(group=>group.id==="TrafficFlank").start,null);
assert.ok(!EvaluateFlow(380,shiftedFlank).actors.some(actor=>actor.groupId==="TrafficFlank"),"west-ramp reinforcement depends on reaching point 2");
assert.equal(EvaluateFlow(227.14).actors[0].pose,"kneel","the box-stack firing pause uses a low protected posture");
const doorCoverIds=new Set(["DugoutDoorBags","DugoutDoorReturn","DugoutInnerCrates","DragFirstShield","DragCornerShield","TrafficFlankBags"].map(id=>`Encounter_${id}`));
const doorCovers=map.objects.filter(object=>doorCoverIds.has(object.id));
assert.equal(doorCovers.length,6);
for(let stamp=160;stamp<400;stamp+=0.25) {
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

const invalidViews=structuredClone(packet);invalidViews.context.viewports={count:4,active:0,views:[]};
assert.throws(()=>ReadFramePacket(invalidViews,FLOW_TIMELINE),"invalid viewport data is rejected before importing the document");
const ReadSceneBytes=(name)=>{const bytes=fs.readFileSync(new URL(`./Scenes/FirstLevelWhitebox/${name}`,import.meta.url));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);};
const terrain=BuildEncounterTerrain(scene,ReadSceneBytes(scene.terrain.file),ReadSceneBytes(scene.trenches.datum.file),map);
// The annotated 03B formation is created in one hidden batch. Movement starts
// after deployment and joins the approach around the new walls' open ends.
const spawnWalls=map.objects.filter(object=>["Encounter_NorthSpawnWall","Encounter_EastSpawnWall"].includes(object.id));
assert.equal(spawnWalls.length,2);
function SpawnSightBlocked(from,to) {
  const distance=Math.hypot(...to.map((value,axis)=>value-from[axis]));
  const steps=Math.ceil(distance/0.08);
  for(let index=1;index<steps;index++) {
    const point=from.map((value,axis)=>value+(to[axis]-value)*index/steps);
    if(terrain.heightAt(point[0],point[2])>point[1]) return true;
    for(const wall of spawnWalls) {
      const [x,,z]=wall.pos,[width,height,depth]=wall.size,base=terrain.heightAt(x,z);
      if(Math.abs(point[0]-x)<width/2&&Math.abs(point[2]-z)<depth/2&&point[1]>base&&point[1]<base+height) return true;
    }
  }
  return false;
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
const markedFrame=EvaluateFlow(186.63).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(markedFrame.length,5);
assert.ok(markedFrame.every(actor=>actor.pose==="kneel"&&!actor.firing));
const firstAdvance=EvaluateFlow(Group("Fork").start+10.1).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(firstAdvance.filter(actor=>actor.pose==="run").length,2);
assert.equal(firstAdvance.filter(actor=>actor.pose==="kneel").length,3,"advance starts are staggered after the hidden batch");
const reportedFrame=EvaluateFlow(207.137).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(reportedFrame.length,5);
assert.ok(reportedFrame.some(actor=>actor.pose==="run") && reportedFrame.some(actor=>actor.firing),"covering fire continues while other members advance");
for(const [id,coverId] of [["Fork_0","Encounter_DugoutDoorBags"],["Fork_2","Encounter_DugoutInnerCrates"]]) {
  const actor=reportedFrame.find(actor=>actor.id===id),cover=map.objects.find(object=>object.id===coverId);
  assert.ok(actor.firing && actor.p[1]<cover.pos[2] && Distance(actor.p,[cover.pos[0],cover.pos[2]])<1.5,"two soldiers hold separate cover positions");
}
for(let stamp=178;stamp<232;stamp+=0.05) {
  const actors=EvaluateFlow(stamp).actors.filter(actor=>actor.groupId==="Fork");
  for(let first=0;first<actors.length;first++) for(let second=first+1;second<actors.length;second++) {
    assert.ok(Distance(actors[first].p,actors[second].p)>0.75,`formation remains separated at ${stamp}`);
  }
  for(const actor of actors) for(const cover of doorCovers) {
    assert.ok(Math.abs(actor.p[0]-cover.pos[0])>cover.size[0]/2+0.25 || Math.abs(actor.p[1]-cover.pos[2])>cover.size[2]/2+0.25,`${actor.id} stays outside doorway cover`);
  }
}
const settled=EvaluateFlow(225).actors.filter(actor=>actor.groupId==="Fork");
assert.equal(new Set(settled.map(actor=>actor.p.join(","))).size,5,"five separate endpoints remain after movement ends");
EvaluateFlow(207.137);EvaluateFlow(186.63);
assert.deepEqual(EvaluateFlow(225).actors.filter(actor=>actor.groupId==="Fork"),settled,"formation seeking is deterministic");
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
  delete item.spawnOffsets;delete item.deployDelay;delete item.memberPlans;return item;
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
// Opening regression: both friendly parties and all three hostile approaches
// must remain continuous across beats and arbitrary backward seeks.
const leaving = EvaluateFlow(26.14);
const retreatIds = ["luo", "he", "liu", ...Array.from({length:9}, (_,index)=>`openingAlly${index+3}`)];
assert.equal(leaving.actors.filter(actor=>retreatIds.includes(actor.id)).length,FLOW_OPENING.retreatCount);
assert.ok(FLOW_OPENING.retreatCount>3);
const gunIds = ["yao", "openingGun0", "openingGun1", "openingGun2"];
for (const id of gunIds.slice(1)) assert.ok(Distance(ActorAt(id,26.14).p,ActorAt("yao",26.14).p)<6,"yao leaves with the messenger and gun crew");
const pathDistance = (point,route) => Math.min(...route.slice(1).map((end,index)=>SegmentDistance(point,route[index],end)));
for (let stamp=24;stamp<BeatById("02b").start;stamp+=0.5) {
  for (const id of retreatIds) {
    const actor=ActorAt(id,stamp);
    assert.ok(pathDistance(actor.p,FLOW_OPENING.retreatRoute)<0.01,"the whole party uses the later withdrawal route");
    assert.ok(actor.p[1]>=ActorAt(id,stamp-0.1).p[1],"the rescue party does not return before winter calls");
  }
}
assert.ok(ActorAt("luo",64.5).p[1]<ActorAt("luo",64).p[1],"winter's call reverses retreat toward the branch");
for (const [index,id] of retreatIds.entries()) {
  const group=FLOW_OPENING_RESCUE.groups.find(entry=>entry.members.includes(index));
  const heard=BeatById("02b").start+group.responseDelay+group.members.indexOf(index)*FLOW_OPENING_RESCUE.memberResponseInterval;
  assert.ok(ActorAt(id,heard+0.1).p[1]<ActorAt(id,heard).p[1],"each soldier turns after hearing the call");
}
const rescueReady = retreatIds.map(id => ActorAt(id,107.654));
assert.equal(rescueReady.filter(actor => actor.rescueLane === "branch").length,6);
assert.equal(rescueReady.filter(actor => actor.rescueLane === "south").length,6);
assert.equal(new Set(rescueReady.map(actor => actor.rescueGroup)).size,4,"each approach has two independent trios");
for (const actor of rescueReady) {
  assert.equal(actor.pose,"kneel","both lanes settle into cover before the grenade signal");
  assert.ok(rescueReady.filter(other => other !== actor).every(other => Distance(actor.p,other.p)>2),"the rescue party retains loose individual cover positions");
  assert.ok(actor.rescueLane === "branch" ? actor.p[1]<68 : actor.p[1]>72,"one lane follows the branch while the other approaches around its south side");
}
let mixedRescueFrames = 0;
for (let stamp=66;stamp<105;stamp+=0.25) {
  const actors = retreatIds.map(id => ActorAt(id,stamp));
  if (actors.some(actor => actor.pose === "walk") && actors.some(actor => actor.pose === "kneel")) mixedRescueFrames++;
  for (const actor of actors) assert.ok(Distance(actor.p,ActorAt(actor.id,stamp+0.01).p)/0.01<2.8,"rescue approaches stay below a headlong sprint");
}
assert.ok(mixedRescueFrames>50,"observation halts and advances are staggered across soldiers");
for (const id of retreatIds) {
  let reachedJunction = false, reachedSouthernBend = false, paused = false;
  for (let stamp=66;stamp<107;stamp+=0.1) {
    const actor = ActorAt(id,stamp);
    reachedJunction ||= Distance(actor.p,[23.5,67.2])<1.2;
    reachedSouthernBend ||= actor.p[0]>34 && actor.p[1]>84;
    paused ||= actor.pose === "kneel" && Distance(actor.p,ActorAt(id,107).p)>3;
  }
  assert.ok(ActorAt(id,107).rescueLane === "branch" ? reachedJunction : reachedSouthernBend,`${id} follows the corresponding user-drawn approach`);
  assert.ok(paused,`${id} pauses in cover during the approach`);
}
assert.ok(ActorAt("luo",112).p[1]<ActorAt("luo",110).p[1],"the party jumps into the trench after the grenade blasts");
assert.equal(EvaluateFlow(130).actors.filter(actor=>retreatIds.includes(actor.id)&&actor.pose==="dead").length,7);
const openingIds = [...retreatIds,...gunIds,...Array.from({length:9},(_,index)=>`opening${index}`)];
for (let stamp=0.1;stamp<161;stamp+=0.1) {
  const before=EvaluateFlow(stamp-0.1),after=EvaluateFlow(stamp);
  for (const id of openingIds) {
    const previous=before.actors.find(actor=>actor.id===id),current=after.actors.find(actor=>actor.id===id);
    if (previous&&current) assert.ok(Distance(previous.p,current.p)<0.41,`${id} moves continuously across opening beats at ${stamp}`);
  }
}
const capturing=EvaluateFlow(40.05).actors.filter(actor=>/^opening\d+$/.test(actor.id));
assert.equal(capturing.length,9);
assert.ok(capturing.some(actor=>actor.pose==="run"),"the capture beat opens with troops still approaching");
for (const enemy of capturing) {
  assert.ok(enemy.born<BeatById("02a").start,"capture troops enter from the preceding scene");
  assert.ok(Distance(ActorAt(enemy.id,enemy.born).p,[66.5,64.5])>35,"troops appear on their distant approach routes");
  assert.ok(Distance(ActorAt(enemy.id,enemy.born+1).p,ActorAt(enemy.id,enemy.born).p)>2.9,"each approach visibly advances");
  assert.ok(Distance(ActorAt(enemy.id,63).p,FLOW_OPENING.enemyPositions[Number(enemy.id.slice(7))])<0.01,"nine attackers reach their authored stations");
}
for (const stamp of [17,26.14,39.999,40.05,64,85,107,112,130,160]) {
  const snapshot=EvaluateFlow(stamp);EvaluateFlow(0);EvaluateFlow(150);
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
