import assert from "node:assert/strict";
import fs from "node:fs";
import { FLOW_TIMELINE, FLOW_DURATION, STAGE_TIMELINE, DEFAULT_ENCOUNTER_DOCUMENT, BeatById, EvaluateFlow, OPENING_ENEMY_ENTRY_TIME, OPENING_GUNFIRE_TIME, OPENING_FRIENDLY_CRY_TIME, Distance } from "./AdvancedTools/Script_LevelFlowModel.mjs";
import { CompileEncounters, ValidateEncounterDocument, UpgradeEncounterDocument } from "./AdvancedTools/Script_LevelFlowEncounter.mjs";
import { FLOW_GROUND, FLOW_GROUND_FORMATIONS, FLOW_PREVIOUS_ENCOUNTER, FLOW_PREVIOUS_DRAG_ENCOUNTER, FLOW_OPENING, FLOW_OPENING_RESCUE, FLOW_PREVIOUS_BATCH_ENCOUNTER, FLOW_PREVIOUS_FLANK, FLOW_PREVIOUS_PURSUIT } from "./AdvancedTools/Data_LevelFlow.mjs";
import { EnterArea, SegmentDistance } from "./AdvancedTools/Script_LevelFlowGeometry.mjs";
import { EncounterDocument, CreateFramePacket, ReadFramePacket, AddPngFrameMetadata, ReadPngFrameMetadata, ValidateScreenshot } from "./AdvancedTools/Script_LevelFlowDocument.mjs";
import { BuildEncounterMap, EncounterFloorConnections, EncounterHeightAt, ENCOUNTER_MAP_MAX_Z, IsMainlineLandmark, LandmarkMode } from "./AdvancedTools/Script_LevelFlowMap.mjs";
import { FLOW_SOURCE_EXCERPTS } from "./AdvancedTools/Data_LevelFlowSource.mjs";
import { FLOW_PREVIOUS_CORNER, FLOW_DRAG_REARGUARD, FLOW_FRIEND_REINFORCEMENTS } from "./AdvancedTools/Data_LevelFlow.mjs";
import { BuildEncounterTerrain } from "./AdvancedTools/Script_LevelFlowTerrain.mjs";
import { EncounterRaster } from "./AdvancedTools/Script_LevelFlowRaster.mjs";
import { IsEncounterCover, ClipPolyline } from "./AdvancedTools/Script_LevelFlowView.mjs";
import { FlowPerspectiveView } from "./AdvancedTools/Script_LevelFlowPerspective.mjs";
import { EncounterSceneControls } from "./AdvancedTools/Script_LevelFlowControls.mjs";
import { L0610_LANE, L0610_SOUTH_LANE } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";
import { FLOW_PREVIOUS_CAMP_COVER, FLOW_PREVIOUS_CAMP_ALIGNED, FLOW_PREVIOUS_CAMP_SCATTER, FLOW_PREVIOUS_CAMP_COMBINED, FLOW_PREVIOUS_TANK_APPROACH } from "./AdvancedTools/Data_LevelFlowAmbushBaseline.mjs";
import { FLOW_DIALOGUE } from "./AdvancedTools/Data_LevelFlow.mjs";
import { SampleFlowDialogue } from "./AdvancedTools/Script_LevelFlowDialogue.mjs";
import { FLOW_STREET_DEFENSE } from "./AdvancedTools/Data_LevelFlow.mjs";
import { FLOW_PREVIOUS_STREET_DEFENSE } from "./AdvancedTools/Data_LevelFlowAmbushBaseline.mjs";
import { EncodeSceneHeights } from "./Script_SceneDoc.mjs";
import { EncounterShadowGeometry } from "./AdvancedTools/Script_LevelFlowLighting.mjs";
import { FLOW_RENDERING } from "./Data_Tuning_LevelFlow.mjs";

const roofShadow=EncounterShadowGeometry([
  {material:"Whitebox/Roof",pos:[0,3.3,0],size:[10,0.2,10]},
  {material:"Whitebox/Plaster",pos:[0,0,0],size:[5,3.5,10]},
],new Set(),()=>0);
const roofHeights=Array.from(roofShadow.slice(0,90)).filter((value,index)=>index%3===1);
const wallHeights=Array.from(roofShadow.slice(90)).filter((value,index)=>index%3===1);
assert.ok(Math.abs(Math.max(...roofHeights)-(3.5+FLOW_RENDERING.roofSurfaceSeparationM))<1e-6,"roof shadows use the same separated cap as the visible geometry");
assert.ok(Math.abs(roofShadow[0])-5>FLOW_RENDERING.roofSurfaceSeparationM*0.99,"roof shadows include the separated fascia footprint");
assert.ok(Math.abs(Math.min(...roofHeights)-3.3)<1e-6,"separating the cap preserves the roof underside");
assert.equal(Math.max(...wallHeights),3.5,"wall tops keep their authored height");

const transferEnd = BeatById("09e").end;
const transferArrival = EvaluateFlow(transferEnd).actors.filter(actor => actor.groupId === "YardTransfer");
assert.equal(transferArrival.length, 5, "all five search soldiers reach the forward junction");
for (const offset of [0.01, 2, 4.4106, 7.99, 8]) {
  const frame = EvaluateFlow(transferEnd + offset);
  const soldiers = frame.actors.filter(actor => actor.groupId === "YardTransfer");
  assert.equal(soldiers.length, 5, "transfer remains visible during the existing cleanup window");
  for (const soldier of soldiers) {
    assert.deepEqual(soldier.p, transferArrival.find(actor => actor.id === soldier.id).p, "beat transition never sends transfers back to their spawn");
    assert.equal(soldier.pose, "stand", "arrived transfers do not run in place");
    assert.equal(soldier.firing, false, "transfers do not acquire an invented combat or alarm response");
  }
  EvaluateFlow(0);
  assert.deepEqual(EvaluateFlow(transferEnd + offset), frame, "transfer staging is deterministic after rewind");
}
assert.ok(!EvaluateFlow(transferEnd + 8.01).actors.some(actor => actor.groupId === "YardTransfer"), "existing group cleanup timing remains unchanged");
const continuingTransfer = structuredClone(DEFAULT_ENCOUNTER_DOCUMENT);
const shortTransfer = continuingTransfer.groups.find(group => group.id === "YardTransfer");
shortTransfer.speed = 0.5;
const transferBeforeEnd = EvaluateFlow(transferEnd, continuingTransfer).actors.find(actor => actor.groupId === "YardTransfer");
const transferAfterEnd = EvaluateFlow(transferEnd + 4, continuingTransfer).actors.find(actor => actor.id === transferBeforeEnd.id);
assert.ok(transferAfterEnd.p[0] > transferBeforeEnd.p[0], "unfinished transfers continue east along their authored lane after the beat ends");
assert.equal(transferAfterEnd.pose, "run");

// Every authored speech binds a current quoted line to a living, sampled actor.
for (const [id, cues] of Object.entries(FLOW_DIALOGUE)) {
  const beat = BeatById(id);
  assert.ok(beat, `speech beat ${id} exists`);
  const quotes = [...beat.passage.matchAll(/[「“]([^」”]+)[」”]/gu)];
  for (const [index, cue] of cues.entries()) {
    assert.ok(cue.text || quotes[cue.quote], `${id} cue ${index} references current dialogue`);
    assert.ok(cue.at >= 0 && cue.duration > 0 && cue.at + cue.duration <= beat.duration);
    const time = beat.start + cue.at, frame = EvaluateFlow(time);
    const speech = frame.dialogue.find(entry => entry.id === `${id}_${index}`);
    assert.ok(speech, `${id} cue ${index} resolves a living speaker`);
    assert.equal(speech.text, cue.text || quotes[cue.quote][1]);
    assert.ok(frame.actors.some(actor => actor.id === speech.actorId));
    assert.ok(!EvaluateFlow(speech.end).dialogue.some(entry => entry.id === speech.id), 'speech expires at its end');
    EvaluateFlow(FLOW_DURATION);
    assert.deepEqual(EvaluateFlow(time).dialogue, frame.dialogue, 'rewinding restores exact dialogue');
    assert.deepEqual(SampleFlowDialogue(beat,time,[]),[], 'missing speakers produce no floating speech');
    assert.deepEqual(SampleFlowDialogue(beat,time,frame.actors.map(actor=>({...actor,pose:"dead"}))),[], 'dead speakers stay silent');
  }
}
for (const id of ["01a", "01d", "09j", "10c"]) {
  assert.deepEqual(EvaluateFlow(BeatById(id).start + 1).dialogue, [], 'stage directions and sound effects stay out of speech');
}

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
  type:"scene", freeCamera:{}, width:64, height:64, focal:32, near:0.25, far:1500, CameraPoint:point => point,
}, [[0,0,0], [1,0,1], [0,1,1]], [[0,0,0], [100,100,100], [200,200,200]]);
assert.ok(clipped.every(vertex => vertex.depth >= 0.25 && vertex.rgb.length === 3));
assert.ok(clipped.some(vertex => Math.abs(vertex.depth - 0.25) < 1e-8 && Math.abs(vertex.rgb[0] - 25) < 1e-8),
  "near-plane clipping interpolates terrain colors with geometry");

const flyView={sceneCamera:{speed:24},freeCamera:{eye:[0,0,0],yaw:0,pitch:0}};
const flyControls={drag:{action:"look",entry:{map:flyView}},keys:new Set(["KeyW"]),wheelViews:new Map()};
EncounterSceneControls.prototype.Tick.call(flyControls,0.25);
assert.deepEqual(flyView.freeCamera.eye,[0,0,6],"right-button fly movement uses the configured metres per second");
flyControls.keys.add("ShiftLeft");
EncounterSceneControls.prototype.Tick.call(flyControls,0.25);
assert.deepEqual(flyView.freeCamera.eye,[0,0,30],"Shift multiplies the configured speed by four");

const lineView=Object.assign(Object.create(FlowPerspectiveView.prototype),{
  type:"scene",freeCamera:{},width:640,height:360,focal:320,sceneCamera:{near:0.5,far:100},
  Ground:()=>0,CameraPoint:point=>[point[0],point[1]-10,point[2]],
});
const visibleRoute=[[-2,10],[0,20],[3,30]];
assert.deepEqual(lineView.ProjectPath(visibleRoute),[visibleRoute.map(point=>lineView.ToScreen(point))],
  "visible route vertices retain their projection and continuous dashes");
for(const route of [
  [[-2,-10],[2,10]], [[2,10],[-2,-10]],
  [[-2,10],[0,-10],[2,10]], [[-2,10],[2,150]],
]) {
  const paths=lineView.ProjectPath(route);
  assert.ok(paths.length>0,"partially visible routes retain their clipped portion");
  assert.ok(paths.flat().every(point=>point.every(Number.isFinite)&&point[1]>=360*0.49),
    "ground routes crossing camera planes never connect to the hidden-point sentinel in the sky");
}
assert.equal(lineView.ProjectPath([[-2,10],[0,-10],[2,10]]).length,2,
  "hidden portions split polylines instead of bridging unrelated visible endpoints");
assert.deepEqual(lineView.ProjectPath([[-2,-10],[2,-20]]),[]);
assert.deepEqual(lineView.ProjectPath([[-2,110],[2,120]]),[]);
let arrowFills=0;
const lineContext={beginPath(){},moveTo(){},lineTo(){},setLineDash(){},stroke(){},closePath(){},fill(){arrowFills++;}};
lineView.DrawArrow(lineContext,[-2,10],[2,150],"#ac4031");
assert.equal(arrowFills,0,"clipped route endpoints do not acquire artificial arrowheads at the camera plane");
lineView.DrawArrow(lineContext,[-2,-10],[2,10],"#ac4031");
assert.equal(arrowFills,1,"visible route destinations keep their direction arrow");
lineView.CameraPoint=point=>point;
lineView.DrawArrow(lineContext,[0,10],[0,150],"#ac4031");
assert.equal(arrowFills,1,"a far-clipped destination stays hidden even when it projects onto the same pixel");

const ReferenceTime = seconds => seconds >= 86 ? seconds + BeatById("02c").start - 86
  : seconds >= 37 ? seconds + BeatById("01e").start - 37 : seconds;
const defaults=DEFAULT_ENCOUNTER_DOCUMENT;
assert.equal(BeatById("10j").end,1959);
assert.equal(FLOW_DURATION,3249);
assert.equal(FLOW_TIMELINE.length,112);
assert.equal(STAGE_TIMELINE.length,18);
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
const pursuitFrame = EvaluateFlow(161.2626);
for (let index=3;index<9;index++) {
  const actor=pursuitFrame.actors.find(actor=>actor.id==='openingAlly'+index);
  const before=EvaluateFlow(BeatById('02g').start).actors.find(entry=>entry.id===actor.id);
  assert.equal(actor.pose,'run','ordinary Sichuan infantry pursue instead of standing at their landings');
  assert.ok(actor.p[0]<before.p[0]-3,'the marked soldiers advance west toward the mouth');
}
const defenseFrame=EvaluateFlow(BeatById('02g').end-1);
assert.ok(defenseFrame.effects.some(effect=>effect.side==='enemy'&&defenseFrame.actors.some(actor=>actor.groupId==='OpeningDefense'&&Distance(effect.b,actor.p)<0.01)),
  'retreating enemies turn and fire at the forward defense rather than ignoring it');
const defenseLeader=defenseFrame.actors.find(actor=>actor.id==='luo');
for(const actor of defenseFrame.actors.filter(actor=>actor.groupId==='OpeningDefense')) {
  assert.ok(actor.firing&&actor.pose==='shoot','the pursuit settles into a firing line');
  assert.ok(Distance(actor.p,defenseLeader.p)<16,'the mouth defenders stay near their squad leader');
  assert.ok(Distance(actor.p,[23.5,67.2])<21,'the line stays near the trench mouth');
  assert.ok(defenseFrame.effects.some(effect=>effect.side==='friend'&&Distance(effect.a,actor.p)<0.01),'each defender has actual outgoing fire');
}
for(let stamp=155;stamp<186;stamp+=0.1) for(const id of ['luo','he','liu','openingAlly3','openingAlly4','openingAlly5','openingAlly6','openingAlly7','openingAlly8']) {
  const before=EvaluateFlow(stamp).actors.find(actor=>actor.id===id);
  const after=EvaluateFlow(stamp+0.1).actors.find(actor=>actor.id===id);
  assert.ok(Distance(before.p,after.p)<0.35,'pursuit, hold, casualties and return never teleport');
}
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
const exposedDraft=structuredClone(defaults);
exposedDraft.revision='2026-11-14-bend-ambush-1';
const exposedFork=exposedDraft.groups.find(group=>group.id==='Fork');
exposedFork.spawnOffsets=[[2.3,-9.9],[10.3,-3.5],[-10.6,-5],[5.5,3.8],[-8.4,1.8]];
exposedFork.memberPlans[2].route=[[64.4,47.8],[62,53],[55,60],[53.5,62.8]];
exposedFork.memberPlans[4].route=[[66.6,51.5],[62,55.5],[61,60.5],[60.8,65.8],[60,66],[51.5,66]];
exposedFork.count=8;
const hiddenDraft=UpgradeEncounterDocument(exposedDraft,defaults);
const hiddenFork=hiddenDraft.groups.find(group=>group.id==='Fork');
assert.deepEqual(hiddenFork.spawnOffsets,defaults.groups.find(group=>group.id==='Fork').spawnOffsets);
assert.deepEqual(hiddenFork.memberPlans,defaults.groups.find(group=>group.id==='Fork').memberPlans);
assert.equal(hiddenFork.count,8,'upgrading the two exposed spawns preserves edited counts');
const customExposedDraft=structuredClone(exposedDraft);
customExposedDraft.groups.find(group=>group.id==='Fork').memberPlans[2].route=[[80,35],[80,50]];
assert.deepEqual(UpgradeEncounterDocument(customExposedDraft,defaults).groups.find(group=>group.id==='Fork').memberPlans,
  customExposedDraft.groups.find(group=>group.id==='Fork').memberPlans,'authored single-soldier routes remain untouched');
const deletedExposedDraft=structuredClone(exposedDraft);
deletedExposedDraft.groups=deletedExposedDraft.groups.filter(group=>group.id!=='Fork');
assert.ok(!UpgradeEncounterDocument(deletedExposedDraft,defaults).groups.some(group=>group.id==='Fork'),'a deleted reinforcement group stays deleted');
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
assert.ok(tankBefore && tankAfter,"the tank is already approaching before the pursuit begins");
assert.ok(Distance(tankBefore.p,tankAfter.p)<0.01,"06A continues the same tank without a spawn or teleport");
assert.ok(EvaluateFlow(BeatById("05b").start).actors.some((actor)=>actor.kind==="tank"));
for(const stamp of [540,550,560,585,603.84]) {
  const frame=EvaluateFlow(stamp),next=EvaluateFlow(stamp+0.02);
  for(const tank of frame.actors.filter(actor=>actor.kind==="tank" && actor.moving)) {
    const after=next.actors.find(actor=>actor.id===tank.id),length=Distance(tank.p,after.p);
    const alignment=((after.p[0]-tank.p[0])*Math.sin(tank.heading)-(after.p[1]-tank.p[1])*Math.cos(tank.heading))/length;
    assert.ok(alignment>0.999,`${tank.id} turns with the road instead of sliding sideways`);
  }
}
const convoyIds=["tank1","tank2",...Array.from({length:5},(_,index)=>`TankEscort_${index}`),...Array.from({length:4},(_,index)=>`TankRearScreen_${index}`)];
for(const boundary of ["05b","05c","06a"]) {
  const stamp=BeatById(boundary).start;
  for(const id of convoyIds) {
    const before=EvaluateFlow(stamp-0.001).actors.find(actor=>actor.id===id);
    const after=EvaluateFlow(stamp+0.001).actors.find(actor=>actor.id===id);
    assert.ok(before && after && Distance(before.p,after.p)<0.02,`${id} stays continuous across ${boundary}`);
  }
}
for(let stamp=BeatById("05a").start;stamp<BeatById("06a").end;stamp+=0.1) {
  const frame=EvaluateFlow(stamp),next=EvaluateFlow(stamp+0.1);
  for(const id of convoyIds) {
    const actor=frame.actors.find(actor=>actor.id===id),after=next.actors.find(actor=>actor.id===id);
    assert.ok(Distance(actor.p,after.p)<0.5,`${id} approaches at a bounded speed without corner jumps`);
  }
  if(stamp<BeatById("06a").start) assert.ok(!frame.effects.some(effect=>effect.kind==="fire" && frame.actors.some(actor=>actor.kind==="tank" && Distance(actor.p,effect.a)<0.01)),"distant convoy does not fire before the pursuit");
}
const approachDraft=structuredClone(defaults);
approachDraft.revision="2026-11-14-opening-defense-1";
for(const collection of ["groups","triggers"]) for(const previous of FLOW_PREVIOUS_TANK_APPROACH[collection]) {
  approachDraft[collection][approachDraft[collection].findIndex(entry=>entry.id===previous.id)]=structuredClone(previous);
}
assert.deepEqual(UpgradeEncounterDocument(approachDraft,defaults),defaults,"saved 06A-spawn drafts receive the complete marching approach");
assert.deepEqual(UpgradeEncounterDocument({...approachDraft,revision:"2026-11-14-front-defense-1"},defaults),defaults,"front-defense drafts also receive the marching approach");
const editedApproach=structuredClone(approachDraft);
editedApproach.groups.find(group=>group.id==="TankEscort").route=[[105,187],[115,240]];
editedApproach.groups.find(group=>group.id==="TankEscort").count=7;
editedApproach.groups=editedApproach.groups.filter(group=>group.id!=="TankRearScreen");
editedApproach.triggers.find(trigger=>trigger.id==="Trigger_TankEscort").area.center=[300,300];
const upgradedApproach=UpgradeEncounterDocument(editedApproach,defaults);
assert.deepEqual(upgradedApproach.groups.find(group=>group.id==="TankEscort").route,[[105,187],[115,240]]);
assert.equal(upgradedApproach.groups.find(group=>group.id==="TankEscort").count,7);
assert.ok(!upgradedApproach.groups.some(group=>group.id==="TankRearScreen"));
assert.deepEqual(upgradedApproach.triggers.find(trigger=>trigger.id==="Trigger_TankEscort").area.center,[300,300]);
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
const sceneMapObjects = scene.objects.filter(object => object.pos && object.pos[2] < ENCOUNTER_MAP_MAX_Z
  && object.layer !== "backdrop" && !/空气墙|^远景/.test(object.group || ""));
for (const object of sceneMapObjects) {
  assert.ok(map.objects.includes(object), `${object.id} remains on the 2D map regardless of its chapter group`);
  assert.ok(!map.farObjects.some(entry => entry.id === object.id), "3D draws restored map objects once");
}
assert.ok(map.objects.some(object => object.id === "Wall_SW2c_Sa"), "the village's southern courtyard walls reach the 2D map");
const sceneMapMarkers = scene.markers.filter(marker => marker.z < ENCOUNTER_MAP_MAX_Z);
assert.equal(map.labels.filter(label => label.id).length, sceneMapMarkers.length, "all scene markers in the active map are loaded");
for (const marker of sceneMapMarkers) {
  const label = map.labels.find(label => label.id === marker.id);
  assert.deepEqual(label, {...marker,p:[marker.x,marker.z]}, "landmarks retain authored names, location, kind, extent and notes");
}
assert.equal(map.labels.filter(label => label.name === "防炮洞").length, 1, "scene names take precedence over duplicate fallback labels");
const mainlineLabels = map.labels.filter(IsMainlineLandmark);
assert.ok(mainlineLabels.length >= 40 && mainlineLabels.length < map.labels.length / 3, "important mainline landmarks filter out background clutter");
for (const id of ["LmDugout", "LmGully", "LmTemple", "LmAid", "LmRailBridge"]) {
  assert.ok(mainlineLabels.some(label => label.id === id), `${id} is included in important mainline landmarks`);
}
for (const id of ["LmWell_1", "LmPond_W", "LmSlogan_NC1", "LmWoodZhao", "LmFarm_N"]) {
  assert.ok(!mainlineLabels.some(label => label.id === id), `${id} is excluded from important mainline landmarks`);
}
assert.ok(!mainlineLabels.some(label => label.detail), "detail door/window labels are excluded from important mainline landmarks");
assert.equal(LandmarkMode({ importantLandmarks: true, landmarks: false }), "important");
assert.equal(LandmarkMode({ importantLandmarks: true, landmarks: true }), "all");
assert.equal(LandmarkMode({ importantLandmarks: false, landmarks: false }), "none");
assert.equal(LandmarkMode({ landmarks: false }), "none");
assert.equal(LandmarkMode({ landmarks: true }), "all");
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
assert.equal(tankGate.start,BeatById("05a").start);
const missedTank=structuredClone(defaults);
missedTank.triggers.find((trigger)=>trigger.id==="Trigger_TankEscort").area.center=[300,300];
assert.ok(!EvaluateFlow(ReferenceTime(652.25),missedTank).actors.some((actor)=>actor.kind==="tank"),"moving the early trigger also controls vehicle arrival");
const noEscort=structuredClone(defaults);noEscort.groups.find((group)=>group.id==="TankEscort").enabled=false;
assert.ok(EvaluateFlow(ReferenceTime(652.25),noEscort).actors.some((actor)=>actor.id==="tank1"),"turning off infantry preserves the triggered vehicle");
let movingTanks=0,waitingTanks=0,grenadeFrames=0,earlyGrenades=0;
for(let time=BeatById("03h").start;time<BeatById("06i").end;time+=0.5) {
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
    for(const [id,x,z,width,height,depth,,yawDeg] of FLOW_GROUND.cover) {
      const yaw=(yawDeg||0)*Math.PI/180,dx=actor.p[0]-x,dz=actor.p[1]-z;
      const lx=dx*Math.cos(yaw)-dz*Math.sin(yaw),lz=dx*Math.sin(yaw)+dz*Math.cos(yaw);
      assert.ok(Math.abs(lx)>width/2+0.25 || Math.abs(lz)>depth/2+0.25,
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
assert.equal(map.ramps.length,13);
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
assert.equal(upgradedEscort.count,9);assert.equal(upgradedEscort.beat,"05a");
assert.deepEqual(upgradedEscort.route,defaults.groups.find((group)=>group.id==="TankEscort").route);
assert.ok(upgraded.groups.some((group)=>group.id==="CampEastGun"));
assert.ok(!upgraded.groups.some((group)=>group.id==="SearchNeighbor"),"a user-deleted group stays deleted during upgrade");
ValidateEncounterDocument(upgraded,FLOW_TIMELINE);

const walkingWoundedIds = ["openingAlly10","openingAlly11"];
const evacuationStart = BeatById("03a").start;
for (let stamp = evacuationStart; stamp < BeatById("05b").start - 0.1; stamp += 0.25) {
  const frame = EvaluateFlow(stamp), next = EvaluateFlow(stamp + 0.02);
  for (const id of walkingWoundedIds) {
    const actor = frame.actors.find(entry => entry.id === id);
    assert.ok(actor?.alive && actor.wounded && !actor.firing, `${id} remains a living noncombatant during evacuation`);
    assert.ok(!actor.meleePartnerId && actor.pose !== "shoot", `${id} no longer fights a former melee partner`);
    assert.ok(Distance(actor.p,next.actors.find(entry => entry.id === id).p) < 0.06, `${id} walks continuously without teleporting`);
  }
}
const woundedFeedbackFrame = EvaluateFlow(298.6793);
assert.equal(woundedFeedbackFrame.beat.id,"03d");
for (const id of walkingWoundedIds) {
  const actor = woundedFeedbackFrame.actors.find(entry => entry.id === id);
  assert.ok(actor.p[1] > 110, `${id} has already left the exposed branch before the annotated grenade`);
  const before = EvaluateFlow(evacuationStart-0.001).actors.find(entry => entry.id === id);
  const after = EvaluateFlow(evacuationStart+0.001).actors.find(entry => entry.id === id);
  assert.ok(Distance(before.p,after.p) < 0.01, `${id} starts from the actual wounded position`);
}
const evacuationLeader = woundedFeedbackFrame.actors.find(actor => actor.id === "luo");
assert.ok(evacuationLeader.p[1] >= 73 && evacuationLeader.firing,"leader guards the southward escape instead of waiting beside the blanket");
assert.equal(woundedFeedbackFrame.actors.find(actor => actor.id === "liu").pose,"shoot");
assert.equal(woundedFeedbackFrame.actors.find(actor => actor.id === "he").wounded,undefined,"blanket carrier stays with the immobile casualty");
for (const boundary of ["03a","03h"]) {
  const stamp = BeatById(boundary).start;
  assert.ok(Distance(EvaluateFlow(stamp-0.001).actors.find(actor => actor.id === "luo").p,
    EvaluateFlow(stamp+0.001).actors.find(actor => actor.id === "luo").p) < 0.03,"leader joins both ends of the evacuation cover continuously");
}
EvaluateFlow(BeatById("05a").end);
assert.deepEqual(EvaluateFlow(298.6793),woundedFeedbackFrame,"wounded evacuation remains deterministic after seeking backwards");

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
const heldSecondBatch=EvaluateFlow(secondBatch[2].born+16).actors.filter(actor=>actor.groupId==="TrafficFlank"&&actor.born>=secondBatch[0].born&&actor.pose!=="dead");
assert.equal(heldSecondBatch.length,3);
assert.ok(heldSecondBatch.every(actor=>actor.p[1]<=84.8&&actor.firing),"the second batch holds behind bend cover while the friendly blocking line survives");
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
for (const source of scene.objects.filter(object => object.asset === "Backdrop/Tree")) {
  const tree = map.farObjects.find(object => object.id === source.id);
  assert.deepEqual(tree.pos, source.pos, "abstract trees retain their authored location and grounding");
  assert.equal(tree.size[1], source.params.h, "backdrop trees retain their original height");
  assert.equal(tree.material, "Whitebox/Foliage");
}
const reliefGrid = {file:"Relief.height.bin", encoding:"int16-cm-le", minX:0, minZ:0, cellM:0.5, cols:32, rows:32};
const reliefHeights = new Float32Array(33 * 33);
reliefHeights[2 * 33 + 6] = 1.4;
reliefHeights[14 * 33 + 18] = -1.4;
const reliefScene={terrain:reliefGrid, bounds:{minX:0,maxX:16,minZ:0,maxZ:16},
  paint:[{color:"#123456",feather:0.1,poly:[{x:0,z:0},{x:1,z:0},{x:1,z:1},{x:0,z:1}]}]};
const reliefMap={trenches:[],
    fieldZones:[{id:"Test",poly:[[0,0],[16,0],[16,16],[0,16]]}],
    fields:[{zone:"Test",x:8,z:8,w:16,d:16,angleDeg:0,
      strips:[{from:-8,to:-2,kind:"plowed"},{from:-2,to:2,kind:"wheat"},{from:2,to:8,kind:"fallow"}]}]};
const reliefBytes=EncodeSceneHeights(reliefHeights);
const relief=BuildEncounterTerrain(reliefScene,reliefBytes,null,reliefMap);
const snapshot=structuredClone(relief.prepareSnapshot());
const restoredRelief=BuildEncounterTerrain(reliefScene,reliefBytes,null,reliefMap,snapshot);
assert.equal(restoredRelief.leafCount,relief.cells.length,'worker snapshots preserve every relief leaf');
for(let index=0;index<120;index++) {
  const x=index*7.31%16,z=index*13.7%16;
  assert.equal(restoredRelief.heightAt(x,z),relief.heightAt(x,z),'hydration preserves terrain and collision samples');
  assert.deepEqual(restoredRelief.surfaceColorAt(x,z),relief.surfaceColorAt(x,z),'hydrated paint uses the original bilinear sampler');
}
for(let index=0;index<relief.cells.length;index+=17) {
  assert.deepEqual(restoredRelief.cells[index].center,relief.cells[index].center);
  assert.deepEqual(restoredRelief.packedFacesForCell(restoredRelief.cells[index],true),relief.packedFacesForCell(relief.cells[index],true),
    'restored and worker-prewarmed cells retain identical packed geometry');
}
assert.deepEqual(relief.surfaceColorAt(2,2).map(Math.round), [181,156,122], "field strips retain plowed soil");
assert.deepEqual(relief.surfaceColorAt(8,2).map(Math.round), [182,191,136], "wheat fields reach the 3D terrain surface");
assert.deepEqual(relief.surfaceColorAt(14,2).map(Math.round), [182,177,151], "the adjacent fallow strip stays distinct");
assert.deepEqual(relief.surfaceColorAt(0.5,0.5).map(Math.round), [18,52,86], "authored scene paint overrides the field fallback");
assert.ok(relief.colorAt(3.5,1)[0]>relief.colorAt(2.5,1)[0]+30,
  "equal soil on the sun-facing mound slope is brighter than its backlit slope");
const reliefSurface=relief.surfaceMaps();
assert.equal(relief.surfaceMaps(),reliefSurface,'all panes reuse the baked terrain surface');
assert.equal(reliefSurface.backdrop,null,'scenes without backdrop paint retain the plain-ground fallback');
assert.ok(reliefSurface.splat&&reliefSurface.macroTint,'baked terrain surface includes 4-layer splat and macroTint maps');
assert.equal(reliefSurface.splat.width,reliefSurface.scene.width,'splat texture shares scene grid width');
assert.equal(reliefSurface.splat.height,reliefSurface.scene.height,'splat texture shares scene grid height');
assert.equal(reliefSurface.macroTint.width,reliefSurface.scene.width,'macroTint texture shares scene grid width');
{
  const SplatAt=(x,z)=>{
    const t=reliefSurface.splat, o=((z-t.minZ)/t.texelM*t.width+(x-t.minX)/t.texelM)*4;
    return [...t.data.slice(o,o+4)];
  };
  const TintAt=(x,z)=>{
    const t=reliefSurface.macroTint, o=((z-t.minZ)/t.texelM*t.width+(x-t.minX)/t.texelM)*4;
    return [...t.data.slice(o,o+3)];
  };
  const plowedSplat=SplatAt(2,2), wheatSplat=SplatAt(8,2), fallowSplat=SplatAt(14,2);
  assert.ok(wheatSplat[2]>plowedSplat[2]+100,'wheat strip writes high stubble weight compared to plowed soil');
  assert.ok(plowedSplat[1]>wheatSplat[1]+50,'plowed strip writes spoil earth weight compared to wheat');
  assert.ok(wheatSplat[2]>fallowSplat[2]+60,'wheat strip writes higher stubble weight than fallow');
  const plowedTint=TintAt(2,2), wheatTint=TintAt(8,2);
  assert.ok(wheatTint[1]>wheatTint[0]&&plowedTint[0]>plowedTint[2],'macroTint preserves spring green wheat vs warm brown plowed strips');
}
for(const [x,z] of [[0.5,0.5],[2,2],[8,2],[14,2]]) {
  const texture=reliefSurface.scene;
  const offset=((z-texture.minZ)/texture.texelM*texture.width+(x-texture.minX)/texture.texelM)*4;
  assert.deepEqual([...texture.data.slice(offset,offset+3)],relief.surfaceColorAt(x,z).map(Math.round),
    'terrain texel centers preserve authored paint and field colors at world coordinates');
  assert.equal(texture.data[offset+3],255);
}
for (const [x,z,height] of [[3,1,1.4],[9,7,-1.4]]) {
  const cell = relief.cells.find(cell => x >= cell.x && x < cell.x + cell.size && z >= cell.z && z < cell.z + cell.size);
  assert.ok(cell.size <= 1, "off-center relief refines even when the coarse cell corners and center are flat");
  assert.ok(relief.facesForCell(cell).some(face => face.points.some(point => point[0] === x && point[2] === z && Math.abs(point[1] - height) < 0.01)),
    "the drawn terrain contains the source mound and depression vertices");
}
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
  assert.deepEqual(packed,new Float32Array(faces.flatMap(face=>face.points.flatMap((point,index)=>[...point,...face.vertexColors[index],...face.vertexNormals[index]]))),
    'packed terrain retains every vertex, color and smooth normal, including shared LOD edges');
  const textured=terrain.packedFacesForCell(cell,true);
  assert.equal(terrain.packedFacesForCell(cell,true),textured,'textured cells are packed once for all cameras');
  assert.ok(textured.length<=packed.length,'flat boundary runs reduce GPU geometry');
  for(let offset=0;offset<textured.length;offset+=9) {
    assert.ok(Math.abs(textured[offset+1]-terrain.heightAt(textured[offset],textured[offset+2]))<1e-5,
      'textured terrain retains source heights');
    assert.ok(Math.abs(Math.hypot(...textured.subarray(offset+6,offset+9))-1)<1e-6,
      'textured terrain retains normalized smooth normals');
  }
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
// The 05A camp defenders occupy the protected side of the actual scene cover.
const encounterSceneRoot=new URL("./Scenes/FirstLevelEncounter/",import.meta.url);
const encounterScene=JSON.parse(fs.readFileSync(new URL("Scene_FirstLevelEncounter.json",encounterSceneRoot)));
const encounterMap=BuildEncounterMap(encounterScene);
const ReadEncounterBytes=name=>{
  const bytes=fs.readFileSync(new URL(name,encounterSceneRoot));
  return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
};
const encounterTerrain=BuildEncounterTerrain(encounterScene,ReadEncounterBytes(encounterScene.terrain.file),ReadEncounterBytes(encounterScene.trenches.datum.file),encounterMap);
// The Beishahe village mouth reaches the 2D map with the 2026-11-15 anti-tank ditch section.
assert.ok(encounterMap.trenches.some(trench=>trench.id==="BeishaheAtDitch"),"the Beishahe anti-tank ditch is drawn on the 2D map");
assert.ok(encounterMap.trenches.some(trench=>trench.id==="VillageNorthEast"),"the 727th Regiment fire trench reaches the 2D map");
assert.ok(encounterMap.labels.some(label=>label.id==="LmMgDitchWest")&&encounterMap.objects.some(object=>object.id==="BshMgEastFront"),"ditch-end guns are mapped");
assert.ok(encounterMap.objects.filter(object=>object.meta?.obstacle==="barbedWire"&&/^BshWire_/.test(object.id)).length>=20,"village-mouth wire uses solid frontline spans");
for(const x of [60,120,150]) {
  const line=encounterScene.ways.trenches.find(points=>points[0].x===40&&points[0].z===1010);
  const index=line.findIndex(point=>point.x>=x),a=line[index-1],b=line[index],centre=a.z+(b.z-a.z)*(x-a.x)/(b.x-a.x);
  const lip=encounterTerrain.heightAt(x,centre-2.6),floor=encounterTerrain.heightAt(x,centre),bank=encounterTerrain.heightAt(x,centre+3);
  assert.ok(lip-floor>2.3,"the ditch is deeper than a man");
  assert.ok(bank-lip>0.6,"spoil is heaped on the village (south) lip");
  assert.ok(encounterTerrain.heightAt(x,centre+1.2)<floor+0.3&&encounterTerrain.heightAt(x,centre-1.4)>floor+0.5,"north wall slopes while the south wall stays sheer");
}
// 2026-11-27: GroundWest & GroundEast originate concealed behind the northern
// embankment (TankApproachScreen), deploy silently around its flanks through
// WestNorthDike and Li family cypress grove, and hold asymmetric multi-man rural
// terrain features (with an LMG pair anchoring the 3.4m grave knoll) instead of
// eight symmetric one-man roadside cubicles.
const campCoverIds={
  GroundWest_0:["WestFieldTerrace"],GroundWest_1:["WestFieldTerrace"],
  GroundWest_2:["WestRoadBank"],GroundWest_3:["WestCraterRim"],
  GroundEast_0:["LiKnollBank"],GroundEast_1:["LiKnollBank"],
  GroundEast_2:["LiEastDike"],GroundEast_3:["LiEastDike"],
};
const allCampCoverIds=["WestNorthDike","WestFieldTerrace","WestCraterRim","WestRoadBank","LiKnollBank","LiEastDike"];
const campCoverObjects=Object.fromEntries(Object.entries(campCoverIds).map(([actorId,ids])=>[actorId,ids.map(id=>{
  const object=encounterScene.objects.find(entry=>entry.id===`Encounter_${id}`);
  assert.ok(object,id+" exists in the encounter scene");
  assert.equal(object.solid,true);assert.ok(object.cover,id+" is tagged as cover");
  return object;
})]));
const campCoverShapes=allCampCoverIds.map(id=>{
  const object=encounterScene.objects.find(entry=>entry.id===`Encounter_${id}`);
  assert.ok(object,id+" exists in the encounter scene");
  return object;
});
assert.ok(!encounterScene.objects.some(object=>/^Encounter_(FieldWestBerm|FieldEastWall|RoadWest|RoadEast)/.test(object.id)),"legacy straight walls and 1-man roadside cubicles are gone");
assert.equal(campCoverShapes.length,6,"six organic angled rural terrain covers replace the 14 mini-cubicle boxes");
assert.ok(campCoverShapes.every(object=>["Whitebox/EarthDark","Whitebox/Plaster"].includes(object.material)),"rural field covers use earthen dikes and weathered stone/earth banks, not crates");
assert.ok(new Set(campCoverShapes.map(object=>object.yawDeg||0)).size===6 && campCoverShapes.some(object=>(object.yawDeg||0)>0) && campCoverShapes.some(object=>(object.yawDeg||0)<-50),"rural covers vary organically in orientation along contours and road instead of parallel rows");
const sharedCoverCounts=new Map();
for(const ids of Object.values(campCoverIds)) sharedCoverCounts.set(ids[0],(sharedCoverCounts.get(ids[0])||0)+1);
assert.ok([...sharedCoverCounts.values()].filter(count=>count===2).length>=3,"fire-base and flanking buddy pairs share natural cover instead of 1-man-per-box symmetry");
function LocalInCover(point,object) {
  const rad=(object.yawDeg||0)*Math.PI/180,dx=point[0]-object.pos[0],dz=point[1]-object.pos[2];
  return [dx*Math.cos(rad)-dz*Math.sin(rad),dx*Math.sin(rad)+dz*Math.cos(rad)];
}
function RayHitsCover3D(from,to,object) {
  const [cx,rawY,cz]=object.pos,base=rawY??encounterTerrain.heightAt(cx,cz),[w,h,d]=object.size,rad=(object.yawDeg||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const ToLocal=([x,y,z])=>[(x-cx)*c-(z-cz)*s,y,(x-cx)*s+(z-cz)*c];
  const a=ToLocal(from),b=ToLocal(to),dv=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const bounds=[[-w/2,w/2],[base,base+h],[-d/2,d/2]];
  let t0=0.001,t1=0.999;
  for(let axis=0;axis<3;axis++) {
    const [lo,hi]=bounds[axis];
    if(Math.abs(dv[axis])<1e-8) {if(a[axis]<lo||a[axis]>hi) return false;}
    else {
      let n=(lo-a[axis])/dv[axis],f=(hi-a[axis])/dv[axis];
      if(n>f) [n,f]=[f,n];
      t0=Math.max(t0,n);t1=Math.min(t1,f);
      if(t0>t1) return false;
    }
  }
  return true;
}
function SightBlockedByTerrain(from,to,objects) {
  const distance=Math.hypot(...to.map((value,axis)=>value-from[axis])),steps=Math.ceil(distance/0.1);
  for(let index=1;index<steps;index++) {
    const point=from.map((value,axis)=>value+(to[axis]-value)*index/steps);
    if(encounterTerrain.heightAt(point[0],point[2])>point[1]) return true;
  }
  for(const object of objects) if(RayHitsCover3D(from,to,object)) return true;
  return false;
}
// 2026-11-28: All 6 artificial green spawn-screen walls are replaced by natural Lunan
// terrain & rural ruins (Li family cypress cemetery ridge LiGrove_*, ruined eastern
// threshing yard RuinsEastYard_*, northern field shrine FieldShrineNorth_*, western
// family grave dike FieldGraveWest_*, and forward military-crest mound FrontPitGrave_*).
const campTankScreen=encounterScene.objects.filter(object=>/^LiGrove_(NorthWall|GraveMound)/.test(object.id));
assert.ok(campTankScreen.length>=4,"Li family cemetery ridge walls and grave mounds replace the artificial TankApproachScreen");
assert.ok(!encounterScene.objects.some(object=>/^Encounter_(TankApproachScreen|NorthSpawnWall|EastSpawnWall|NorthPursuitSpawn|WestPursuit|PitPursuitScreen)/.test(object.id)),
  "artificial green spawn-screen boxes are removed from FirstLevelEncounter");
for(const id of ["GroundWest","GroundEast"]) {
  const group=defaults.groups.find(entry=>entry.id===id);
  for(let index=0;index<group.count;index++) {
    const origin=[group.area.center[0]+group.spawnOffsets[index][0],group.area.center[1]+group.spawnOffsets[index][1]];
    assert.ok(origin[1]<75,`${id}_${index} originates north of the Li family cemetery ridge`);
    for(const observer of [[25,71],[30,86],[35,116],[35,131],[35,141.5],[46,149],[55,154],[57,127],[66,129],[68.6,128.6],[72,137],[84,145],[86.4,143.2]]) {
      const eye=[observer[0],encounterTerrain.heightAt(...observer)+1.65,observer[1]];
      for(const height of [0.3,1.0,1.8]) {
        assert.ok(SightBlockedByTerrain(eye,[origin[0],encounterTerrain.heightAt(...origin)+height,origin[1]],campTankScreen),
          `${id}_${index} spawn point is concealed from [${observer}] at h=${height}`);
      }
    }
  }
}
// Verify natural landscape occluders in FirstLevelEncounter also conceal Fork, Corner,
// RearPursuit, TrafficFlank, Rim, and the 05a tank convoy with zero artificial green walls.
{
  const naturalScreens=encounterScene.objects.filter(o=>o.solid!==false && /^(LiGrove_|RuinsEastYard_|FieldShrineNorth_|FieldGraveWest_|FrontPitGrave_)/.test(o.id));
  assert.ok(naturalScreens.every(o=>!o.cover && !o.meta?.planning),"natural landscape occluders are not tagged as glowing green cover walls");
  for(const elapsed of [0,0.5,1]) {
    const frame=EvaluateFlow(BeatById("05a").start+elapsed);
    for(const id of convoyIds) {
      const actor=frame.actors.find(entry=>entry.id===id);
      for(const observer of [frame.player,[35,141.5],[46,149],[55,154],[79,147]]) {
        const eye=[observer[0],encounterTerrain.heightAt(...observer)+1.65,observer[1]];
        assert.ok(SightBlockedByTerrain(eye,[actor.p[0],encounterTerrain.heightAt(...actor.p)+1.8,actor.p[1]],campTankScreen),
          `${id} is concealed behind LiGrove natural ridge at 05a+${elapsed}s`);
      }
    }
  }
  for(const id of ["Fork","Corner"]) {
    const g=Group(id),fr=EvaluateFlow(g.start);
    for(const actor of fr.actors.filter(a=>a.groupId===id)) {
      for(const obs of [fr.player,[25,65.7],[39,65.5],[46,65.6],[61.8,65.6]]) {
        const eye=[obs[0],encounterTerrain.heightAt(...obs)+1.65,obs[1]];
        for(const h of [0.3,1.0,1.8]) {
          assert.ok(SightBlockedByTerrain(eye,[actor.p[0],encounterTerrain.heightAt(...actor.p)+h,actor.p[1]],naturalScreens),
            `${actor.id} concealed behind ruined eastern threshing yard from [${obs}] h=${h}`);
        }
      }
    }
  }
  for(const id of ["RearPursuit","TrafficFlank"]) {
    const g=Group(id);
    for(const life of g.lives) {
      const fr=EvaluateFlow(life.born+0.01);
      const actor=fr.actors.find(a=>a.groupId===id && a.born===life.born);
      const eye=[fr.player[0],encounterTerrain.heightAt(...fr.player)+1.65,fr.player[1]];
      for(const h of [0.3,1.0,1.8]) {
        assert.ok(SightBlockedByTerrain(eye,[actor.p[0],encounterTerrain.heightAt(...actor.p)+h,actor.p[1]],naturalScreens),
          `${actor.id} concealed behind rural terrain/ruins in FirstLevelEncounter h=${h}`);
      }
    }
  }
  // Verify 3-tier fortification structure & forward military crest terrain profile in FirstLevelEncounter
  assert.ok(encounterTerrain.preAt(0,-10) > encounterTerrain.preAt(0,-60) + 1.8, "forward military crest commands the northern valley by >1.8m");
  assert.ok(encounterTerrain.preAt(0,-10) > encounterTerrain.preAt(0,55) + 1.1, "tier-2 support swale sits in genuine reverse-slope defilade behind the forward military crest");
  assert.ok(encounterTerrain.preAt(35,129) > encounterTerrain.preAt(35,64) + 2.5, "tier-3 topographical crest retains the +3m uphill climb");
  for(const reqId of ["FrontWest","FrontMid","FrontEast","FrontEastRoadblock","SupportWest","SupportEastBreach","CrestWestReserve","CrestEastLink","OutpostWestPit","OutpostEastPit"]) {
    assert.ok(encounterScene.trenches.segments.some(s=>s.id===reqId), `FirstLevelEncounter contains 3-tier fortification segment ${reqId}`);
  }
  for(const removedId of ["ForwardObservationSap","EastListeningSap","AssemblyWestLink","CounterattackWestSteps","FrontWestReturn","FrontEastReturn"]) {
    assert.ok(!encounterScene.trenches.segments.some(s=>s.id===removedId), `obsolete WWI/floating segment ${removedId} removed from FirstLevelEncounter`);
  }
  const fw=encounterScene.trenches.segments.find(s=>s.id==="FrontWest");
  const fe=encounterScene.trenches.segments.find(s=>s.id==="FrontEast");
  assert.ok(Math.min(...fw.points.map(p=>p[0])) <= -114, "FrontWest anchors west into the Jinpu railway embankment");
  assert.ok(Math.max(...fe.points.map(p=>p[0])) >= 144, "FrontEast anchors east onto the Guandao corridor");
  assert.ok(encounterScene.trenches.segments.find(s=>s.id==="Traffic").floorW <= 3.2, "Traffic narrowed to realistic 2.8-3.2m dragging corridor");
  assert.ok(encounterScene.trenches.segments.find(s=>s.id==="Traffic2").floorW <= 2.2, "Traffic2 narrowed to realistic 1.8-2.2m communication trench");
}
// While approaching north of z=82 behind the northern berm, flanking squads stay silent (no firing through the berm).
for(let stamp=BeatById("03h").start;stamp<BeatById("04a").start;stamp+=0.5) {
  for(const actor of EvaluateFlow(stamp).actors.filter(entry=>Object.hasOwn(campCoverIds,entry.id)&&entry.p[1]<82)) {
    assert.equal(actor.firing,false,`${actor.id} does not shoot blindly behind the northern embankment at ${stamp}`);
  }
}
// During 04c..05a hold, all 8 hold asymmetric covered positions north of z<=119.5, shielded in lower torso and visible to the 04c firing trench;
// WestNorthDike remains unoccupied behind the advancing line, and GroundEast_0 anchors the 3.4m grave knoll with an LMG.
for(const stamp of [495.569,BeatById("04c").start+10,BeatById("04d").start+5,530.113,holdRelease-0.3]) {
  const frame=EvaluateFlow(stamp);
  const holds=[];
  for(const [actorId,objects] of Object.entries(campCoverObjects)) {
    const actor=frame.actors.find(entry=>entry.id===actorId);
    assert.ok(actor && actor.pose!=="dead" && actor.pose!=="run",actorId+" holds cover position at "+stamp);
    holds.push(actor.p);
    assert.ok(actor.p[1]<=119.5,"camp defenders stay north of the loading area");
    assert.ok(objects.some(object=>{
      const [lx,lz]=LocalInCover(actor.p,object);
      return Math.abs(lx)<object.size[0]/2+1.2 && Math.abs(lz)<object.size[2]/2+1.8;
    }),actorId+" uses its assigned rural cover");
    for(const observer of [frame.player,...frame.actors.filter(friend=>friend.coveringEvacuation).map(friend=>friend.p)]) {
      const torso=[actor.p[0],encounterTerrain.heightAt(...actor.p)+0.8,actor.p[1]];
      const eye=[observer[0],encounterTerrain.heightAt(...observer)+1.6,observer[1]];
      assert.ok(SightBlockedByTerrain(torso,eye,objects),actorId+" lower torso is shielded by terrain/cover from observer");
    }
    const trenchEye=[68.6,encounterTerrain.heightAt(68.6,128.6)+1.6,128.6];
    const head=[actor.p[0],encounterTerrain.heightAt(...actor.p)+1.58,actor.p[1]];
    assert.ok(!SightBlockedByTerrain(head,trenchEye,campCoverShapes),actorId+" upper body remains engageable from the 04c firing trench");
  }
  const lmg=frame.actors.find(entry=>entry.id==="GroundEast_0");
  assert.ok(lmg.heavy && encounterTerrain.heightAt(...lmg.p)>=3.2,"East LMG fire-base anchors the elevated natural grave knoll");
  const stagingDike=encounterScene.objects.find(entry=>entry.id==="Encounter_WestNorthDike");
  assert.ok(holds.every(point=>Distance(point,[stagingDike.pos[0],stagingDike.pos[2]])>8),"intermediate WestNorthDike is left unoccupied after the squad bounds forward");
  for(const flank of ["GroundWest","GroundEast"]) {
    const flankActors=frame.actors.filter(entry=>entry.groupId===flank);
    assert.ok(flankActors.some(entry=>entry.firing),flank+" sustains active suppressing fire across reload cycles at "+stamp);
    const spots=holds.filter((_,index)=>Object.keys(campCoverIds)[index].startsWith(flank));
    const spread=axis=>Math.max(...spots.map(point=>point[axis]))-Math.min(...spots.map(point=>point[axis]));
    assert.equal(spots.length,4);
    assert.ok(spread(0)>=12 && spread(1)>=6,flank+" defenders spread naturally in both width and depth");
    for(const [index,a] of spots.entries()) for(const b of spots.slice(index+1)) assert.ok(Distance(a,b)>=3,flank+" defenders maintain combat spacing");
  }
}
for(let stamp=BeatById("03h").start;stamp<BeatById("06f").end;stamp+=0.1) {
  for(const actor of EvaluateFlow(stamp).actors.filter(actor=>Object.hasOwn(campCoverIds,actor.id)&&actor.pose!=="dead")) {
    for(const cover of campCoverShapes) {
      const [lx,lz]=LocalInCover(actor.p,cover);
      assert.ok(Math.abs(lx)>cover.size[0]/2+0.3 || Math.abs(lz)>cover.size[2]/2+0.3,actor.id+" enters and leaves camp cover without clipping "+cover.id+" at "+stamp.toFixed(1));
    }
  }
}
// Spawn and early approach stay hidden: no defender is in view of the player during 03h..04a+20.
for(let stamp=BeatById("03h").start;stamp<BeatById("04a").start+20;stamp+=0.5) {
  const frame=EvaluateFlow(stamp);
  const eye=[frame.player[0],encounterTerrain.heightAt(...frame.player)+1.65,frame.player[1]];
  for(const actor of frame.actors.filter(actor=>Object.hasOwn(campCoverIds,actor.id))) {
    for(const height of [0.3,0.8,1.7]) {
      const target=[actor.p[0],encounterTerrain.heightAt(...actor.p)+height,actor.p[1]];
      assert.ok(SightBlockedByTerrain(eye,target,[...campTankScreen,...campCoverShapes]),actor.id+" is not in the player's view while spawning and deploying at "+stamp);
    }
  }
}
const oldCampCover=structuredClone(defaults);
oldCampCover.revision=FLOW_PREVIOUS_CAMP_COVER.revision;
for(const previous of FLOW_PREVIOUS_CAMP_COVER.groups) Object.assign(oldCampCover.groups.find(group=>group.id===previous.id),structuredClone(previous));
const upgradedCampCover=UpgradeEncounterDocument(oldCampCover,defaults);
for(const id of ["GroundWest","GroundEast"]) assert.deepEqual(upgradedCampCover.groups.find(group=>group.id===id).memberPlans,defaults.groups.find(group=>group.id===id).memberPlans);
const editedCampCover=structuredClone(oldCampCover);
const editedWest=editedCampCover.groups.find(group=>group.id==="GroundWest");
editedWest.memberPlans[0].route[0][0]+=2;
editedWest.memberPlans[1].delay+=1;
editedWest.count=3;editedWest.enabled=false;
const editedEast=editedCampCover.groups.find(group=>group.id==="GroundEast");
editedEast.area.center[0]+=2;
const preservedCampCover=UpgradeEncounterDocument(editedCampCover,defaults);
const preservedWest=preservedCampCover.groups.find(group=>group.id==="GroundWest");
assert.deepEqual(preservedWest.memberPlans[0],editedWest.memberPlans[0],"custom member route is preserved");
assert.equal(preservedWest.memberPlans[1].delay,editedWest.memberPlans[1].delay,"custom delay is preserved while its default route upgrades");
assert.deepEqual(preservedWest.memberPlans[1].route,defaults.groups.find(group=>group.id==="GroundWest").memberPlans[1].route);
assert.equal(preservedWest.count,3);assert.equal(preservedWest.enabled,false);
assert.deepEqual(preservedCampCover.groups.find(group=>group.id==="GroundEast"),editedEast,"custom spawn area preserves the corresponding routes");
const deletedCampCover=structuredClone(oldCampCover);
deletedCampCover.groups=deletedCampCover.groups.filter(group=>group.id!=="GroundWest");
assert.ok(!UpgradeEncounterDocument(deletedCampCover,defaults).groups.some(group=>group.id==="GroundWest"));
// Drafts saved with the straight-wall camp upgrade to the scattered cover; edits are kept.
const alignedCamp=structuredClone(defaults);
alignedCamp.revision=FLOW_PREVIOUS_CAMP_ALIGNED.revision;
for(const previous of FLOW_PREVIOUS_CAMP_ALIGNED.groups) Object.assign(alignedCamp.groups.find(group=>group.id===previous.id),structuredClone(previous));
const scatteredCamp=UpgradeEncounterDocument(alignedCamp,defaults);
assert.equal(scatteredCamp.revision,defaults.revision);
for(const id of ["GroundWest","GroundEast"]) assert.deepEqual(scatteredCamp.groups.find(group=>group.id===id).memberPlans,defaults.groups.find(group=>group.id===id).memberPlans);
const editedAligned=structuredClone(alignedCamp);
const editedAlignedWest=editedAligned.groups.find(group=>group.id==="GroundWest");
editedAlignedWest.memberPlans[2].route[0][0]+=1.5;editedAlignedWest.count=3;
editedAligned.groups=editedAligned.groups.filter(group=>group.id!=="GroundEast");
const preservedAligned=UpgradeEncounterDocument(editedAligned,defaults);
assert.deepEqual(preservedAligned.groups.find(group=>group.id==="GroundWest").memberPlans[2],editedAlignedWest.memberPlans[2],"a hand-moved hold point survives");
assert.deepEqual(preservedAligned.groups.find(group=>group.id==="GroundWest").memberPlans[0],defaults.groups.find(group=>group.id==="GroundWest").memberPlans[0]);
assert.equal(preservedAligned.groups.find(group=>group.id==="GroundWest").count,3);
assert.ok(!preservedAligned.groups.some(group=>group.id==="GroundEast"),"a deleted flank stays deleted");
// Drafts saved with the 2026-11-17 scattered roadside boxes upgrade to the 2026-11-27 concealed-origin tactical layout.
const scatterCamp=structuredClone(defaults);
scatterCamp.revision=FLOW_PREVIOUS_CAMP_SCATTER.revision;
for(const previous of FLOW_PREVIOUS_CAMP_SCATTER.groups) {
  const group=scatterCamp.groups.find(entry=>entry.id===previous.id);
  delete group.coverWaitSeconds;delete group.firingArea;delete group.weapon;delete group.fireCycle;
  Object.assign(group,structuredClone(previous));
}
for(const previous of FLOW_PREVIOUS_CAMP_SCATTER.triggers) {
  Object.assign(scatterCamp.triggers.find(entry=>entry.id===previous.id),structuredClone(previous));
}
const tacticalCamp=UpgradeEncounterDocument(scatterCamp,defaults);
assert.equal(tacticalCamp.revision,defaults.revision);
for(const id of ["GroundWest","GroundEast"]) {
  assert.deepEqual(tacticalCamp.groups.find(group=>group.id===id),defaults.groups.find(group=>group.id===id),id+" upgrades cleanly from 2026-11-17 scatter baseline");
  assert.equal(tacticalCamp.triggers.find(trigger=>trigger.id===`Trigger_${id}`).delay,defaults.triggers.find(trigger=>trigger.id===`Trigger_${id}`).delay);
}
const editedScatter=structuredClone(scatterCamp);
editedScatter.groups.find(group=>group.id==="GroundWest").count=3;
editedScatter.groups.find(group=>group.id==="GroundWest").memberPlans[1].delay+=2;
editedScatter.groups=editedScatter.groups.filter(group=>group.id!=="GroundEast");
const preservedScatter=UpgradeEncounterDocument(editedScatter,defaults);
assert.equal(preservedScatter.groups.find(group=>group.id==="GroundWest").count,3);
assert.equal(preservedScatter.groups.find(group=>group.id==="GroundWest").memberPlans[1].delay,editedScatter.groups.find(group=>group.id==="GroundWest").memberPlans[1].delay);
assert.deepEqual(preservedScatter.groups.find(group=>group.id==="GroundWest").area,defaults.groups.find(group=>group.id==="GroundWest").area);
assert.ok(!preservedScatter.groups.some(group=>group.id==="GroundEast"));
// Drafts saved with 2026-11-27-infantry-tank-tactics-1 also upgrade untouched camp flanks cleanly.
const combinedCamp=structuredClone(defaults);
combinedCamp.revision=FLOW_PREVIOUS_CAMP_COMBINED.revision;
for(const previous of FLOW_PREVIOUS_CAMP_COMBINED.groups) {
  const group=combinedCamp.groups.find(entry=>entry.id===previous.id);
  delete group.coverWaitSeconds;delete group.firingArea;
  Object.assign(group,structuredClone(previous));
}
for(const previous of FLOW_PREVIOUS_CAMP_COMBINED.triggers) {
  Object.assign(combinedCamp.triggers.find(entry=>entry.id===previous.id),structuredClone(previous));
}
const upgradedCombined=UpgradeEncounterDocument(combinedCamp,defaults);
assert.equal(upgradedCombined.revision,defaults.revision);
for(const id of ["GroundWest","GroundEast"]) {
  assert.deepEqual(upgradedCombined.groups.find(group=>group.id===id),defaults.groups.find(group=>group.id===id),id+" upgrades cleanly from 2026-11-27-infantry-tank-tactics-1");
  assert.equal(upgradedCombined.triggers.find(trigger=>trigger.id===`Trigger_${id}`).delay,defaults.triggers.find(trigger=>trigger.id===`Trigger_${id}`).delay);
}
assert.equal(UpgradeEncounterDocument(defaults,defaults),defaults);
const futureCampCover={...oldCampCover,revision:"future-camp-layout"};
assert.equal(UpgradeEncounterDocument(futureCampCover,defaults),futureCampCover);

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
const convoyScreen=map.objects.filter(object=>object.id==="Encounter_TankApproachScreen");
assert.equal(convoyScreen.length,1);
for(const elapsed of [0,0.25,0.5,1]) {
  const frame=EvaluateFlow(BeatById("05a").start+elapsed);
  for(const id of convoyIds) {
    const actor=frame.actors.find(actor=>actor.id===id);
    for(const observer of [frame.player,[35,141.5],[46,149],[55,154],[79,147]]) {
      const eye=[observer[0],terrain.heightAt(...observer)+1.65,observer[1]];
      for(const dx of actor.kind==="tank"?[-0.95,0,0.95]:[-0.25,0,0.25]) {
        for(const dz of actor.kind==="tank"?[-1.55,0,1.55]:[0]) {
          const point=[actor.p[0]+dx,actor.p[1]+dz];
          assert.ok(SpawnSightBlocked(eye,[point[0],terrain.heightAt(...actor.p)+1.8,point[1]],convoyScreen),`${id} is fully concealed at creation + ${elapsed}s`);
        }
      }
    }
  }
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
  if(id==='Fork') for(const actor of actors) {
    assert.ok(actor.p[0]>71.5,'all five reinforcements start on the far side of the north earth wall');
    for(const observer of [[25,65.7],[39,65.5],[46,65.6],[61.8,65.6]]) {
      const forwardEye=[observer[0],terrain.heightAt(...observer)+1.65,observer[1]];
      assert.ok(SpawnSightBlocked(forwardEye,[actor.p[0],terrain.heightAt(...actor.p)+1.8,actor.p[1]]),'reinforcements are hidden from both the player and the forward defense');
    }
  }
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
for(const markerId of ["LmAssemblyEntry","LmAssemblyWestEntry","LmAssemblyRoadBridge","LmAssemblySouthExit","LmAssemblyEastBay"]) {
  const marker=scene.markers.find(entry=>entry.id===markerId);
  assert.ok(marker&&map.labels.some(label=>label.name===marker.name&&label.p[0]===marker.x&&label.p[1]===marker.z),`${markerId} explains the assembly circulation on the map`);
}
let uniformTerrainCells=0,varyingTerrainCells=0;
const CheckTerrainColorRange=(cell)=>{
  const range=terrain.colorRangeForCell(cell);
  assert.ok(Number.isFinite(range)&&range>=0&&range<=255);
  if(cell.children) for(const child of cell.children) {
    CheckTerrainColorRange(child);
    assert.ok(range+1e-8>=terrain.colorRangeForCell(child),"coarse color bounds retain every finer transition");
  } else if(cell.near&&cell.size<=1) {
    const colors=terrain.facesForCell(cell).flatMap(face=>face.vertexColors);
    const expected=Math.max(...[0,1,2].map(axis=>Math.max(...colors.map(color=>color[axis]))-Math.min(...colors.map(color=>color[axis]))));
    assert.ok(Math.abs(range-expected)<1e-8,"trench cell bounds include floor and bank shading");
    if(range<=1) uniformTerrainCells++;else varyingTerrainCells++;
  }
};
for(const root of terrain.roots) CheckTerrainColorRange(root);
assert.ok(uniformTerrainCells>0&&varyingTerrainCells>0,"only uniform trench cells can skip color-driven refinement");
// A shared edge must consist of identical segments on both sides, including
// Sub-metre trench cells meeting the coarse surrounding terrain.
const terrainEdges=new Map();
const terrainColors = new Map();
let refinedBanks = 0;
for(const cell of terrain.cells) for(const face of terrain.facesForCell(cell)) for(let index=0;index<3;index++) {
  const a=face.points[index],b=face.points[(index+1)%3];
  const vertexKey = a.join(","), color = face.vertexColors[index];
  assert.ok(color.length === 3 && color.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255));
  const normal = face.vertexNormals[index];
  assert.ok(normal[1] > 0 && Math.abs(Math.hypot(...normal) - 1) < 1e-10, "terrain lighting uses unit height-field normals");
  if (terrainColors.has(vertexKey)) {
    const shared = terrainColors.get(vertexKey);
    assert.deepEqual(color, shared.color, "shared terrain vertices have identical shading across cells");
    assert.deepEqual(normal, shared.normal, "smooth normals agree across cell and LOD boundaries");
  }
  terrainColors.set(vertexKey, {color, normal});
  if (cell.size === FLOW_RENDERING.terrainDetailCellM && Math.abs(normal[0]) + Math.abs(normal[2]) > 0.2) refinedBanks++;
  const vertices=[a.join(","),b.join(",")].sort(),key=vertices.join("|");
  const boundary=Math.abs(a[0])===6144&&a[0]===b[0]||Math.abs(a[2])===6144&&a[2]===b[2];
  const edge=terrainEdges.get(key)||{count:0,boundary};edge.count++;terrainEdges.set(key,edge);
}
assert.ok([...terrainEdges.values()].every(edge=>edge.count===(edge.boundary?1:2)),"terrain has no open internal edges or coarse/fine T-junction cracks");
assert.ok(refinedBanks > 100, "curved banks retain sub-metre geometry for close inspection");
const selectedTerrain=[];
const SelectTerrain=(cell)=>{
  if(cell.children&&cell.size>(cell.x<0?4:8)) cell.children.forEach(SelectTerrain);
  else selectedTerrain.push(cell);
};
terrain.roots.filter(cell=>[-256,0].includes(cell.x)&&cell.z===0).forEach(SelectTerrain);
const selectedBoundaries=terrain.boundariesForCells(selectedTerrain),selectedEdges=new Map();
let incrementalBoundaries={};
const BoundaryValues=lines=>[...lines].map(([key,values])=>[key,[...values]]).sort(([a],[b])=>a-b);
for(const selection of [selectedTerrain,selectedTerrain.slice(0,-7),selectedTerrain.slice(3),[],selectedTerrain]) {
  incrementalBoundaries=terrain.boundariesForCells(selection,incrementalBoundaries);
  const fresh=terrain.boundariesForCells(selection);
  assert.deepEqual(BoundaryValues(incrementalBoundaries.rows),BoundaryValues(fresh.rows),'incremental LOD rows match a full rebuild after additions and removals');
  assert.deepEqual(BoundaryValues(incrementalBoundaries.columns),BoundaryValues(fresh.columns),'incremental LOD columns preserve exact shared corners');
  for(const cell of selection.filter((_,index)=>index%97===0)) assert.deepEqual(
    terrain.packedFacesForCell(cell,true,incrementalBoundaries),terrain.packedFacesForCell(cell,true,fresh),
    'incremental seam meshes retain identical native geometry');
}
let indexedEdges={};
for(const selection of [selectedTerrain,selectedTerrain.slice(3),[],selectedTerrain]) {
  indexedEdges=terrain.visibleBoundariesForCells(selection,indexedEdges);
  const reference=terrain.boundariesForCells(selection);
  assert.deepEqual(BoundaryValues(indexedEdges.rows),BoundaryValues(reference.rows),"indexed visible rows match a full reconstruction");
  assert.deepEqual(BoundaryValues(indexedEdges.columns),BoundaryValues(reference.columns),"indexed visible columns preserve every shared source corner");
}
let selectedFaces=0,fullBoundaryFaces=0;
for(const cell of selectedTerrain) {
  const faces=terrain.facesForCell(cell,selectedBoundaries);
  selectedFaces+=faces.length;fullBoundaryFaces+=terrain.facesForCell(cell).length;
  assert.equal(terrain.packedFacesForCell(cell,false,selectedBoundaries),terrain.packedFacesForCell(cell,false,selectedBoundaries),
    "unchanged LOD boundaries reuse their packed mesh");
  for(const face of faces) for(let index=0;index<3;index++) {
    const a=face.points[index],b=face.points[(index+1)%3];
    const key=[a.join(","),b.join(",")].sort().join("|");
    const outside=a[0]===b[0]&&[-256,256].includes(a[0])||a[2]===b[2]&&[0,256].includes(a[2]);
    const edge=selectedEdges.get(key)||{count:0,outside};edge.count++;selectedEdges.set(key,edge);
  }
}
assert.ok([...selectedEdges.values()].every(edge=>edge.count===(edge.outside?1:2)),
  "mixed 4 m and 8 m LOD cells share complete edges without cracks");
assert.ok(selectedFaces<fullBoundaryFaces,"active LOD boundaries omit unused fine-grid edge vertices");
const flatTerrain=terrain.roots.find(cell=>cell.x===5888&&cell.z===5888);
assert.equal(terrain.facesForCell(flatTerrain).length,2,"an exactly planar, uniformly shaded cell uses two triangles");
let bankCell=terrain.roots.find(cell=>32>=cell.x&&32<cell.x+cell.size&&88>=cell.z&&88<cell.z+cell.size);
while(bankCell.children&&bankCell.size>8) bankCell=bankCell.children.find(cell=>32>=cell.x&&32<cell.x+cell.size&&88>=cell.z&&88<cell.z+cell.size);
const partialBankError=terrain.heightErrorForCell(bankCell,0),completeBankError=terrain.heightErrorForCell(bankCell);
assert.ok(completeBankError>=partialBankError&&completeBankError<=bankCell.heightError+1e-8,
  "threshold queries resume to the measured source error without accumulating LOD deviations");
// A differently tessellated neighbour must meet the cached bank mesh at the
// same heights, including fine samples between the coarse cell's two corners.
const bankPatch=terrain.selectTerrainPatch(bankCell,0.01);
assert.ok(bankPatch.perimeter?.length>0);
assert.equal(terrain.selectTerrainPatch(bankCell,0.01001),bankPatch,"nearby camera depths reuse the resident bank mesh");
const edgeX=bankCell.x+bankCell.size,edgeZ=bankCell.z;
const ContainsEdge=cell=>edgeX>=cell.x&&edgeX<cell.x+cell.size&&edgeZ>=cell.z&&edgeZ<cell.z+cell.size;
let neighbour=terrain.roots.find(ContainsEdge);
while(neighbour.children&&neighbour.size>bankCell.size) neighbour=neighbour.children.find(ContainsEdge);
const seam=terrain.boundariesForCells([bankPatch,neighbour]);
const neighbourMesh=terrain.packedFacesForCell(neighbour,true,seam);
const bankMesh=terrain.packedTerrainPatch(bankPatch,seam);
assert.equal(terrain.packedTerrainPatch(bankPatch,seam),bankMesh,"unchanged edges reuse packed vertices");
// Compare the incremental patch to a fresh, ordered quadtree cut and the
// ordinary sorted-line mesh builder across changing LODs and neighbours.
for(const tolerance of [.001,.014,.017,.023,.025,.031,.09,.014,.001]) {
  const patch=terrain.selectTerrainPatch(bankCell,tolerance);
  if(!patch.perimeter) continue;
  const limit=2**(Math.floor(4*Math.log2(tolerance))/4),expected=[];
  const Cut=cell=>{
    if(cell.children&&terrain.heightErrorForCell(cell)>limit) cell.children.forEach(Cut);
    else expected.push(cell);
  };
  Cut(bankCell);
  assert.equal(patch.cells.length,expected.length);
  assert.ok(patch.cells.every((cell,i)=>cell===expected[i]),"reused threshold intervals preserve the ordered LOD cut");
  for(const neighbours of [[neighbour],neighbour.children||[neighbour],[neighbour]]) {
    const selection=[patch,...neighbours],active=terrain.visibleBoundariesForCells(selection);
    const global=terrain.boundariesForCells(selection),local=terrain.boundariesForCells(expected);
    for(const z of [patch.z,patch.z+patch.size]) local.rows.set(z,global.rows.get(z));
    for(const x of [patch.x,patch.x+patch.size]) local.columns.set(x,global.columns.get(x));
    const batches=terrain.terrainPatchBatches(patch,active),reference=expected.map(cell=>terrain.packedFacesForCell(cell,true,local));
    const expanded=terrain.expandNative(terrain.indexedTerrainPatch(patch,active));
    let offset=0;
    for(const mesh of reference) {assert.deepEqual(expanded.subarray(offset,offset+mesh.length),mesh);offset+=mesh.length;}
    assert.equal(expanded.length,offset);
    assert.equal(batches.reduce((sum,batch)=>sum+batch.length*9,0),offset,"batched and contiguous indices cover the same geometry");
  }
}
function BankEdge(mesh) {
  const heights=new Map();
  for(let i=0;i<mesh.length;i+=9) if(mesh[i]===edgeX) heights.set(mesh[i+2],mesh[i+1]);
  return [...heights].sort((a,b)=>a[0]-b[0]);
}
const bankEdge=BankEdge(bankMesh),neighbourEdge=BankEdge(neighbourMesh);
assert.ok(bankEdge.length>=2&&neighbourEdge.length>=2);
for(const [source,other] of [[bankEdge,neighbourEdge],[neighbourEdge,bankEdge]]) {
  for(const [z,y] of source) {
    if(z<edgeZ||z>edgeZ+bankCell.size) continue;
    const index=other.findIndex(point=>point[0]>=z);
    assert.ok(index>=0);
    const [endZ,endY]=other[index],[startZ,startY]=other[Math.max(0,index-1)];
    const height=endZ===z?endY:startY+(endY-startY)*(z-startZ)/(endZ-startZ);
    assert.ok(Math.abs(y-height)<0.00001,"mixed detail levels retain the same bank edge");
  }
}
const curvedLeaf=terrain.cells.find(cell=>cell.size===FLOW_RENDERING.terrainDetailCellM&&
  [0,1].every(i=>Math.abs(cell.centerHeight-(cell.corners[i]+cell.corners[i+2])/2)>0.001));
assert.ok(curvedLeaf);
const leafEdges=terrain.boundariesForCells([curvedLeaf]);
const referenceVertices=terrain.facesForCell(curvedLeaf,leafEdges).flatMap(face=>
  face.points.flatMap((point,i)=>[...point,198,207,169,...face.vertexNormals[i]]));
assert.deepEqual(terrain.packedFacesForCell(curvedLeaf,true,leafEdges),new Float32Array(referenceVertices),
  "direct quad packing retains native positions, triangle winding and smooth normals");
const ActorAt=(id,time)=>EvaluateFlow(time).actors.find(actor=>actor.id===id);
assert.equal(OPENING_GUNFIRE_TIME, 78);
assert.equal(OPENING_FRIENDLY_CRY_TIME, 104);
assert.ok(ActorAt("opening0", OPENING_GUNFIRE_TIME).arrival < OPENING_GUNFIRE_TIME, "the gun crew waits silently after deploying");
for (let stamp = OPENING_ENEMY_ENTRY_TIME; stamp < OPENING_GUNFIRE_TIME; stamp += 0.25) {
  const silent = EvaluateFlow(stamp);
  assert.ok(!silent.effects.some(effect => ["fire", "grenade"].includes(effect.kind)), "flanking and capture do not reveal the ambush with early gunfire");
  assert.ok(silent.actors.filter(actor => /^opening\d+$/.test(actor.id)).every(actor => !actor.firing));
}
const annotatedOpening = EvaluateFlow(75.6683);
assert.equal(annotatedOpening.actors.find(actor => actor.id === "opening0").status, "静默架枪");
assert.ok(!annotatedOpening.effects.some(effect => effect.kind === "fire"), "the attached frame precedes the first burst from either gun");
const firstBurst = EvaluateFlow(OPENING_GUNFIRE_TIME);
const firstGunner = firstBurst.actors.find(actor => actor.id === "opening0");
assert.equal(firstGunner.pose, "shoot");
assert.equal(firstGunner.firing, true);
assert.ok(firstBurst.effects.some(effect => effect.kind === "fire" && effect.side === "enemy" && Distance(effect.a, firstGunner.p) < 0.01));
assert.ok(firstBurst.effects.some(effect => effect.kind === "fire" && effect.side === "friend" && effect.heavy), "the western gun responds only once the northern gun fires");
assert.equal(ActorAt("luo", OPENING_FRIENDLY_CRY_TIME - 0.001).status, "循枪声接近，准备投弹");
assert.equal(ActorAt("luo", OPENING_FRIENDLY_CRY_TIME).status, "沟里有自己人，暂缓投弹");
assert.equal(ActorAt("winter", OPENING_FRIENDLY_CRY_TIME - 0.001).pose, "kneel");
assert.equal(ActorAt("winter", OPENING_FRIENDLY_CRY_TIME).pose, "wounded");
assert.equal(ActorAt("winter", OPENING_FRIENDLY_CRY_TIME).status, "受刺惨叫");
for (let stamp = OPENING_GUNFIRE_TIME; stamp < BeatById("02f").start; stamp += 0.25) {
  assert.ok(!EvaluateFlow(stamp).effects.some(effect => effect.kind === "grenade"), "relief does not grenade the trench containing friendly prisoners");
}
const aimedGrenades = EvaluateFlow(BeatById("02f").start + 0.5).effects.filter(effect => effect.kind === "grenade");
assert.equal(aimedGrenades.length, 2);
assert.deepEqual(aimedGrenades.map(effect => effect.b), FLOW_OPENING.enemyPositions.slice(0, 2), "the later rescue grenades target only the northern gun positions");
assert.equal(ActorAt("opening0", BeatById("02e").start).firing, false);
const openingSignalTimes = [75.6683, OPENING_GUNFIRE_TIME - 0.001, OPENING_GUNFIRE_TIME, 90, OPENING_FRIENDLY_CRY_TIME - 0.001, OPENING_FRIENDLY_CRY_TIME, BeatById("02e").start];
const openingSignalFrames = openingSignalTimes.map(stamp => EvaluateFlow(stamp));
for (const stamp of [...openingSignalTimes].reverse()) EvaluateFlow(stamp);
assert.deepEqual(openingSignalTimes.map(stamp => EvaluateFlow(stamp)), openingSignalFrames, "gunfire, response and recognition remain deterministic on rewind");
assert.ok(OPENING_ENEMY_ENTRY_TIME > 32.423);
for (let time = 0; time < OPENING_ENEMY_ENTRY_TIME; time += 0.1) {
  assert.ok(!EvaluateFlow(time).actors.some(actor => /^opening\d+$/.test(actor.id)), "attackers wait until the last retreating soldier clears the bend");
}
assert.ok(!EvaluateFlow(32.423).actors.some(actor => actor.side === "enemy"), "the annotated packing frame has no Japanese troops");
const bend = FLOW_OPENING.retreatRoute[FLOW_OPENING.enemyEntryBendIndex];
const entryFrame = EvaluateFlow(OPENING_ENEMY_ENTRY_TIME);
const withdrawing = entryFrame.actors.filter(actor => ["luo", "he", "liu"].includes(actor.id) || /^openingAlly/.test(actor.id));
assert.equal(withdrawing.length, 12);
assert.ok(withdrawing.every(actor => actor.p[1] >= bend[1] - 0.65), "all twelve soldiers clear the bend corridor before the first attacker enters");
assert.ok(Distance(withdrawing.at(-1).p, bend) < 0.65, "tail soldier clears the bend inside the PCG trench corridor");
const waiting = EvaluateFlow(OPENING_GUNFIRE_TIME - 0.001).actors.filter(actor => ["luo", "he", "liu"].includes(actor.id) || /^openingAlly/.test(actor.id));
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
for (let stamp=24;stamp<OPENING_GUNFIRE_TIME;stamp+=0.5) {
  for (const id of retreatIds) {
    const actor=ActorAt(id,stamp);
    assert.ok(pathDistance(actor.p,FLOW_OPENING.retreatRoute)<0.68,"the whole party uses the later withdrawal trench corridor");
    assert.ok(actor.p[1]>=ActorAt(id,stamp-0.1).p[1]-0.03,"the rescue party does not return before the machine gun opens fire");
  }
}
assert.ok(ActorAt("luo",OPENING_GUNFIRE_TIME+0.5).p[1]<ActorAt("luo",OPENING_GUNFIRE_TIME).p[1],"gunfire reverses retreat toward the branch before winter cries");
for (const [index,id] of retreatIds.entries()) {
  const group=FLOW_OPENING_RESCUE.groups.find(entry=>entry.members.includes(index));
  const heard=OPENING_GUNFIRE_TIME+group.responseDelay+group.members.indexOf(index)*FLOW_OPENING_RESCUE.memberResponseInterval;
  assert.ok(ActorAt(id,heard+0.1).p[1]<ActorAt(id,heard).p[1],"each soldier turns after hearing gunfire");
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
const villageBattleStart=BeatById("09j").start;
const priorVillageDraft=structuredClone(defaults);
priorVillageDraft.revision="2026-11-14-double-tank-destruction-1";
for(const group of priorVillageDraft.groups) delete group.engageOn;
priorVillageDraft.groups.find(group=>group.id==="VillageGun").count=2;
priorVillageDraft.groups=priorVillageDraft.groups.filter(group=>group.id!=="VillageRifles");
const migratedVillageDraft=UpgradeEncounterDocument(priorVillageDraft,defaults);
assert.equal(migratedVillageDraft.revision,defaults.revision);
assert.equal(migratedVillageDraft.groups.find(group=>group.id==="VillageGun").engageOn,"09j");
assert.equal(migratedVillageDraft.groups.find(group=>group.id==="VillageGun").count,2);
assert.ok(!migratedVillageDraft.groups.some(group=>group.id==="VillageRifles"));
assert.ok(!priorVillageDraft.groups.find(group=>group.id==="VillageGun").engageOn,"migration does not mutate the attachment");
const customVillageDraft=structuredClone(priorVillageDraft);
customVillageDraft.groups.find(group=>group.id==="VillageGun").engageOn="09f";
assert.equal(UpgradeEncounterDocument(customVillageDraft,defaults).groups.find(group=>group.id==="VillageGun").engageOn,"09f");
const invalidVillageDraft=structuredClone(defaults);
invalidVillageDraft.groups.find(group=>group.id==="VillageGun").engageOn="missing";
assert.throws(()=>ValidateEncounterDocument(invalidVillageDraft,FLOW_TIMELINE),/接战拍号/);
for(const document of [defaults,migratedVillageDraft]) {
  for(let time=villageStart;time<villageBattleStart;time+=2) {
    const frame=EvaluateFlow(time,document);
    const shots=frame.effects.filter(effect=>effect.kind==="fire");
    assert.ok(shots.every(effect=>effect.targetId?.startsWith("villager")),"before the leader opens fire, only civilian-targeted bursts are allowed");
    assert.ok(frame.actors.filter(actor=>["luo","he","yao"].includes(actor.id)).every(actor=>!actor.firing),"frontline allies remain concealed");
  }
  const before=EvaluateFlow(BeatById("09e").start-0.001,document);
  assert.ok(before.actors.some(actor=>actor.groupId==="SearchYard"));
  assert.ok(!before.actors.some(actor=>actor.groupId==="YardTransfer"));
  const first=EvaluateFlow(villageBattleStart,document);
  assert.ok(first.effects.some(effect=>effect.sourceId==="luo"),"leader initiates the battle");
  assert.ok(!first.actors.find(actor=>actor.id==="yao").firing,"yaowa waits for the leader's gunfire");
  assert.ok(EvaluateFlow(BeatById("09e").start+1,document).actors.some(actor=>actor.groupId==="YardTransfer"&&actor.pose==="run"),"search party responds to the enemy recall whistle before the coordinated attack");
  const joined=EvaluateFlow(villageBattleStart+1.5,document);
  assert.ok(joined.effects.some(effect=>effect.sourceId==="yao"),"yaowa joins after the signal");
  assert.ok(joined.actors.some(actor=>actor.groupId==="GengHouse"&&actor.firing),"north-house guards return fire during the coordinated attack");
  EvaluateFlow(BeatById("10a").start,document);
  assert.deepEqual(EvaluateFlow(villageBattleStart+1.5,document),joined,"rewinding restores the same engagement order");
}
const boardedWinter=ActorAt("winter",BeatById("06d").start),boardingWinter=ActorAt("winter",BeatById("06d").start-0.001);
assert.equal(boardedWinter.parentId,"cart","06D opens with winter already on the cart, matching its source passage");
assert.ok(Distance(boardedWinter.p,boardingWinter.p)<0.01&&Math.abs(boardedWinter.elevation-boardingWinter.elevation)<0.01,"boarding has a continuous position and lift");
for(let stamp=BeatById("10d").start;stamp<BeatById("10f").end;stamp+=0.5) {
  const cart=ActorAt("cart",stamp),winter=ActorAt("winter",stamp);
  if(cart.p[1]>=470) assert.ok(Math.min(...south.slice(1).map((b,index)=>SegmentDistance(cart.p,south[index],b)))<1e-6,"cart uses each south-alley turn");
  assert.equal(winter.parentId,"cart");assert.equal(winter.elevation,1.05);assert.equal(winter.heading,cart.heading);assert.ok(Distance(winter.p,cart.p)<0.2);
}


// The street sample keeps one legible defense task while covered pairs close
// the distance. All checks sample the same public entry point as the editor.
const streetIds=FLOW_STREET_DEFENSE.groups.map(group=>group.id);
const streetStart=BeatById("10b").start,streetEnd=BeatById("10f").start;
const streetWalls=map.objects.filter(object=>object.pos[0]>90 && object.pos[0]<220 && object.pos[2]>430 && object.pos[2]<495
  && object.size[1]>=1.5 && (!Number.isFinite(object.pos[1]) || object.pos[1]<1.5)
  && !object.hideOn && !object.showOn);
const streetOccluders=streetWalls.map(wall=>{
  const [x,,z]=wall.pos,[width,height,depth]=wall.size,base=terrain.heightAt(x,z);
  return {min:[x-width/2,base,z-depth/2],max:[x+width/2,base+height,z+depth/2]};
});
function StreetSightBlocked(from,to) {
  return streetOccluders.some(box=>{
    let enter=0,exit=1;
    for(let axis=0;axis<3;axis++) {
      const delta=to[axis]-from[axis];
      if(Math.abs(delta)<1e-8) {
        if(from[axis]<box.min[axis] || from[axis]>box.max[axis]) return false;
      } else {
        const first=(box.min[axis]-from[axis])/delta,last=(box.max[axis]-from[axis])/delta;
        enter=Math.max(enter,Math.min(first,last));
        exit=Math.min(exit,Math.max(first,last));
      }
      if(enter>exit) return false;
    }
    return exit>0 && enter<1;
  });
}
const streetActors=stamp=>EvaluateFlow(stamp).actors.filter(actor=>streetIds.includes(actor.groupId));
let boundingFrames=0,enemyFireFrames=0,northFireFrames=0;
for(let stamp=streetStart;stamp<streetEnd;stamp+=0.5) {
  const frame=EvaluateFlow(stamp),enemies=streetActors(stamp),east=enemies.filter(actor=>actor.groupId==="EastStreet" && actor.pose!=="dead");
  assert.ok(east.length<=4,"east-street live budget stays at four");
  if(east.some(actor=>actor.pose==="run") && east.some(actor=>actor.firing)) boundingFrames++;
  if(frame.effects.some(effect=>effect.kind==="fire" && effect.side==="enemy" && streetIds.includes(effect.groupId))) enemyFireFrames++;
  if(frame.effects.some(effect=>effect.kind==="fire" && effect.groupId==="NorthYard")) northFireFrames++;
  const stretchers=frame.actors.filter(actor=>actor.id.startsWith("stretcher"));
  for(const actor of [...enemies.filter(actor=>actor.pose!=="dead"),...frame.actors.filter(actor=>actor.defenseSector),...stretchers]) {
    assert.ok(!streetWalls.some(wall=>Math.abs(actor.p[0]-wall.pos[0])<wall.size[0]/2+0.16
      && Math.abs(actor.p[1]-wall.pos[2])<wall.size[2]/2+0.16),`${actor.id} clears real walls and buildings at ${stamp}`);
  }
  for(let index=0;index<frame.stretchersPassed;index++) {
    assert.ok(frame.actors.find(actor=>actor.id===`stretcher${index}`).p[1]>=472,"counted stretchers have cleared the alley mouth with their full length");
  }
  for(const shot of frame.effects.filter(effect=>effect.kind==="fire" && effect.sourceId)) {
    const shooter=frame.actors.find(actor=>actor.id===shot.sourceId);
    if(!shooter.defenseSector && !streetIds.includes(shooter.groupId)) continue;
    const ground=terrain.heightAt(...shot.a);
    assert.ok(!StreetSightBlocked([shot.a[0],ground+1.4,shot.a[1]],
      [shot.b[0],terrain.heightAt(...shot.b)+1.4,shot.b[1]]),`${shot.sourceId} fires through an open sightline at ${stamp}: ${JSON.stringify([shot.a,shot.b,shot.targetId])}`);
  }
}
assert.ok(boundingFrames>8 && enemyFireFrames>50 && northFireFrames>0,"advancing pairs receive covering fire and the warned flank reaches the pocket");
for(const group of defaults.groups.filter(group=>streetIds.includes(group.id))) {
  const compiled=CompileEncounters(defaults,FLOW_TIMELINE).groups.find(entry=>entry.id===group.id);
  for(const [index,life] of compiled.lives.entries()) for(const elapsed of [0,0.5]) {
    const frame=EvaluateFlow(life.born+elapsed);
    const actor=frame.actors.find(actor=>actor.id===`${group.id}_${index}`);
    if(!actor) continue;
    for(const eye of [frame.player,...["10b","10c","10d","10e"].map(id=>BeatById(id).p.at(-1))]) for(const height of [0.25,1,1.8]) for(const offset of [-0.25,0,0.25]) {
      assert.ok(StreetSightBlocked([eye[0],terrain.heightAt(...eye)+1.6,eye[1]],
        [actor.p[0]+offset,terrain.heightAt(...actor.p)+height,actor.p[1]]),`${actor.id} spawns behind real cover`);
    }
  }
}
const warningStart=BeatById("10d").start;
assert.ok(EvaluateFlow(warningStart).defenseWarning);
assert.equal(EvaluateFlow(warningStart+12).defenseWarning,null);
assert.ok(streetActors(warningStart+11.5).filter(actor=>actor.groupId==="NorthYard").every(actor=>actor.pose==="kneel"),"flank waits for the full warning");
assert.deepEqual(["10b","10c","10d","10e","10f"].map(id=>EvaluateFlow(BeatById(id).start).stretchersPassed),[0,4,8,8,12]);
assert.equal(EvaluateFlow(BeatById("10e").end-0.01).stretchersPassed,12);
assert.equal(EvaluateFlow(streetEnd+1).effects.filter(effect=>effect.kind==="fire").length,0,"the withdrawal whistle ends all gunfire");
assert.ok(streetActors(streetEnd+8.5).some(actor=>actor.groupId==="TempleGun" && actor.pose==="run"),"survivors keep retreating until they reach concealed origins");
for(let stamp=streetEnd;stamp<streetEnd+45;stamp+=0.5) for(const actor of streetActors(stamp)) {
  assert.ok(actor.pose==="run" || actor.pose==="dead");
  assert.ok(!streetWalls.some(wall=>Math.abs(actor.p[0]-wall.pos[0])<wall.size[0]/2+0.16
    && Math.abs(actor.p[1]-wall.pos[2])<wall.size[2]/2+0.16),`${actor.id} retraces the open route when withdrawing`);
}
assert.ok(!streetActors(FLOW_DURATION).some(actor=>actor.pose!=="dead"),"all surviving attackers have returned behind cover by the end");
const streetSnapshot=EvaluateFlow(warningStart+38);
EvaluateFlow(0);EvaluateFlow(FLOW_DURATION);
assert.deepEqual(EvaluateFlow(warningStart+38),streetSnapshot,"street warning, targets and stretcher batches rewind identically");
const oldStreet=structuredClone(defaults);
oldStreet.revision=FLOW_PREVIOUS_STREET_DEFENSE.revision;
for(const collection of ["groups","triggers"]) for(const previous of FLOW_PREVIOUS_STREET_DEFENSE[collection]) {
  oldStreet[collection][oldStreet[collection].findIndex(entry=>entry.id===previous.id)]=structuredClone(previous);
}
assert.deepEqual(UpgradeEncounterDocument(oldStreet,defaults),defaults,"existing saved street layouts receive the sample");
oldStreet.groups.find(group=>group.id==="EastStreet").count=9;
oldStreet.groups.find(group=>group.id==="NorthYard").route[1][0]-=2;
oldStreet.groups=oldStreet.groups.filter(group=>group.id!=="TempleGun");
const customStreet=UpgradeEncounterDocument(oldStreet,defaults);
assert.equal(customStreet.groups.find(group=>group.id==="EastStreet").count,9);
assert.deepEqual(customStreet.groups.find(group=>group.id==="NorthYard").route,oldStreet.groups.find(group=>group.id==="NorthYard").route);
assert.equal(customStreet.groups.find(group=>group.id==="NorthYard").memberPlans,undefined,"custom routes retain their path representation");
assert.ok(!customStreet.groups.some(group=>group.id==="TempleGun"),"deleted groups stay deleted");
ValidateEncounterDocument(customStreet,FLOW_TIMELINE);
const earlyStreetDraft=structuredClone(defaults);
earlyStreetDraft.revision="2026-11-15-street-defense-1";
for(const group of earlyStreetDraft.groups.filter(group=>["VillageGun","VillageRifles"].includes(group.id))) delete group.engageOn;
assert.deepEqual(UpgradeEncounterDocument(earlyStreetDraft,defaults),defaults,"early street drafts also receive the village engagement signal");
const futureStreetDraft={...earlyStreetDraft,revision:"future-layout-version"};
assert.equal(UpgradeEncounterDocument(futureStreetDraft,defaults),futureStreetDraft,"unknown future documents retain their revision and authored fields");

const screenshot={version:1,width:1280,height:720,image:"data:image/png;base64,AA==",marks:[{kind:"arrow",a:[2,3],b:[40,50],text:""}]};
assert.deepEqual(ValidateScreenshot(screenshot),screenshot);
const brushScreenshot = { ...screenshot, marks: [{ kind: "brush", a: [2, 3], b: [2, 3], points: [[2, 3], [20, 50], [2, 3]], text: "" }] };
assert.deepEqual(ValidateScreenshot(brushScreenshot), brushScreenshot);
assert.throws(() => ValidateScreenshot({ ...brushScreenshot, marks: [{ ...brushScreenshot.marks[0], points: [[2, 3], [NaN, 0]] }] }));
assert.throws(() => ValidateScreenshot({ ...brushScreenshot, marks: [{ ...brushScreenshot.marks[0], points: [] }] }));
assert.deepEqual(ValidateScreenshot({ ...screenshot, marks: [{ kind: "text", a: [2, 3], b: [2, 3], text: "large", fontSize: 300 }] }).marks[0].fontSize, 300);
assert.throws(()=>ValidateScreenshot({...screenshot,marks:[{kind:"world",a:[2,3],b:[4,5],text:""}]}));
assert.throws(()=>ValidateScreenshot({...screenshot,marks:[{kind:"text",a:[NaN,3],b:[4,5],text:"x"}]}));
assert.throws(()=>ValidateScreenshot({...screenshot,width:0}));

// The fifth draft continues from the public editor model through every stage.
const beishaheBeats=FLOW_TIMELINE.filter(beat=>Number(beat.stage)>=11);
assert.equal(beishaheBeats.length,44);
for(const beat of beishaheBeats) for(const fraction of [0,0.25,0.5,0.75,0.999]) {
  const stamp=beat.start+beat.duration*fraction,frame=EvaluateFlow(stamp);
  assert.ok(frame.actors.some(actor=>actor.id==="winter"&&actor.pose==="wounded"),`${beat.id} keeps winter alive`);
  EvaluateFlow(0);EvaluateFlow(FLOW_DURATION);
  assert.deepEqual(EvaluateFlow(stamp),frame,`${beat.id} rewinds deterministically`);
}
for(const signal of ["PlankBridgeRemoved","GuandaoBridgeBlown","AidCartBurned","NierDrawing","MatHomeCovered","BridgeBlown"]) {
  assert.ok(EvaluateFlow(FLOW_DURATION).signals.includes(signal));
  assert.ok(!EvaluateFlow(BeatById("11a").start).signals.includes(signal));
}
assert.equal(ActorAt("winter",BeatById("12f").start).parentId,"cart");
assert.ok(!EvaluateFlow(BeatById("14c").start).actors.some(actor=>actor.id==="cart"),"the burned cart no longer renders an intact duplicate");
assert.equal(ActorAt("medic",BeatById("15a").start).pose,"dead");
assert.ok(EvaluateFlow(BeatById("14a").start+7).effects.some(effect=>effect.kind==="plane"));
assert.ok(EvaluateFlow(BeatById("18f").start+13).signals.includes("BridgeBlown"));
assert.equal(EvaluateFlow(BeatById("18g").start).nightBlend,1);
for(const id of ["17b","17d"]) assert.equal(ActorAt("winter",BeatById(id).start).carried,false);
const bridgeFrame=EvaluateFlow(BeatById("18a").start+22);
assert.equal(bridgeFrame.actors.find(actor=>actor.id==="player").surfaceY,2.545,"crossing actors stand on the sleepers above the riverbed");

const southernWalls=encounterScene.objects.filter(object=>object.pos[2]>900 && object.asset==="Whitebox/Box"
  && object.size[1]>1.3 && object.solid!==false && (!Number.isFinite(object.pos[1])||object.pos[1]<1)
  && !/Roof|Foliage/.test(object.material) && !/Lintel|LightPost/.test(object.id));
for(const beat of beishaheBeats) for(let stamp=beat.start;stamp<beat.end;stamp+=0.5) {
  const frame=EvaluateFlow(stamp);
  const walkers=frame.actors.filter(actor=>actor.id==="player"||actor.carried
    ||actor.id==="winter"&&["17b","17d"].includes(beat.id)
    ||actor.id==="liu"&&["16c","16d","17a","17b","17c","17d","17e","18a","18g"].includes(beat.id));
  for(const actor of walkers) {
    const heading=actor.heading||0;
    const corners=actor.kind==="quilt"?[[-0.4,-0.9],[0.4,-0.9],[0.4,0.9],[-0.4,0.9]]:[[0,0]];
    const feet=(actor.surfaceY??encounterTerrain.heightAt(...actor.p))+(actor.elevation||0);
    for(const [cornerX,cornerZ] of corners) {
      const point=[actor.p[0]+cornerX*Math.cos(heading)-cornerZ*Math.sin(heading),
        actor.p[1]+cornerX*Math.sin(heading)+cornerZ*Math.cos(heading)];
      for(const wall of southernWalls) {
        if(wall.hideOn&&frame.signals.includes(wall.hideOn)||wall.showOn&&!frame.signals.includes(wall.showOn)) continue;
        const bottom=wall.pos[1]??encounterTerrain.heightAt(wall.pos[0],wall.pos[2]);
        if(feet>=bottom+wall.size[1]-0.05) continue;
        const yaw=(wall.yawDeg||0)*Math.PI/180,deltaX=point[0]-wall.pos[0],deltaZ=point[1]-wall.pos[2];
        const x=deltaX*Math.cos(yaw)-deltaZ*Math.sin(yaw),z=deltaX*Math.sin(yaw)+deltaZ*Math.cos(yaw);
        assert.ok(Math.abs(x)>=wall.size[0]/2+0.2 || Math.abs(z)>=wall.size[2]/2+0.2,
          `${beat.id} ${actor.id} clears ${wall.id} at ${stamp}`);
      }
    }
  }
}
const southScreens=encounterScene.objects.filter(object=>object.id.startsWith("Encounter_Beishahe"));
const firstRoadFrame=EvaluateFlow(BeatById("11a").start),thirdTank=firstRoadFrame.actors.find(actor=>actor.id==="tank3");
const roadEye=[firstRoadFrame.player[0],encounterTerrain.heightAt(...firstRoadFrame.player)+1.6,firstRoadFrame.player[1]];
for(const dx of [-0.9,0,0.9]) assert.ok(SightBlockedByTerrain(roadEye,[thirdTank.p[0]+dx,encounterTerrain.heightAt(...thirdTank.p)+1.8,thirdTank.p[1]],southScreens),"the third tank is concealed before the convoy advances");
const southernGroups=CompileEncounters(defaults,FLOW_TIMELINE).groups.filter(group=>Number(group.beat.slice(0,2))>=11);
for(const group of southernGroups) for(const [index,life] of group.lives.entries()) {
  const frame=EvaluateFlow(life.born+0.001),enemy=frame.actors.find(actor=>actor.id===`${group.id}_${index}`);
  if(!enemy) continue;
  const eye=[frame.player[0],encounterTerrain.heightAt(...frame.player)+1.6,frame.player[1]];
  for(const [dx,height] of [[-0.3,1.6],[0,1.8],[0.3,1.6],[0,0.4]]) {
    assert.ok(SightBlockedByTerrain(eye,[enemy.p[0]+dx,encounterTerrain.heightAt(...enemy.p)+height,enemy.p[1]],southScreens),`${enemy.id} is concealed on creation`);
  }
}
const beforeBeishahe=structuredClone(defaults);
beforeBeishahe.revision="2026-11-17-camp-scatter-1";
beforeBeishahe.groups=beforeBeishahe.groups.filter(group=>Number(group.beat.slice(0,2))<11&&group.id!=="GroundEast");
beforeBeishahe.groups.find(group=>group.id==="GroundWest").count=3;
beforeBeishahe.triggers=beforeBeishahe.triggers.filter(trigger=>Number(trigger.beat.slice(0,2))<11);
const migratedBeishahe=UpgradeEncounterDocument(beforeBeishahe,defaults);
assert.equal(migratedBeishahe.groups.find(group=>group.id==="GroundWest").count,3);
assert.ok(!migratedBeishahe.groups.some(group=>group.id==="GroundEast"));
assert.equal(migratedBeishahe.groups.filter(group=>Number(group.beat.slice(0,2))>=11).length,9);
assert.deepEqual(UpgradeEncounterDocument(migratedBeishahe,defaults),migratedBeishahe,"repeat loads preserve new edits and deletions");

{
  const box=[0,0,100,100];
  const inside=[[10,10],[50,20],[90,80]];
  assert.deepEqual(ClipPolyline(inside,box),[{points:inside,offset:0}],"polyline inside the clip box is returned whole with offset 0");
  const excursion=[[10,50],[50,50],[150,50],[150,60],[50,60],[10,60]];
  const runs=ClipPolyline(excursion,box);
  assert.equal(runs.length,2,"leaving and re-entering the clip box splits the polyline");
  assert.deepEqual(runs[0].points,[[10,50],[50,50],[100,50]]);
  assert.equal(runs[0].offset,0);
  assert.deepEqual(runs[1].points,[[100,60],[50,60],[10,60]]);
  assert.ok(Math.abs(runs[1].offset-(40+100+10+50))<1e-9,"dash phase continues along the original polyline");
  const far=ClipPolyline([[50,50],[1e6,50]],box);
  assert.deepEqual(far,[{points:[[50,50],[100,50]],offset:0}],"an endpoint a million pixels away is clipped to the box edge");
  assert.deepEqual(ClipPolyline([[-50,-50],[-10,-200],[-300,-20]],box),[],"polyline outside the clip box vanishes");
  const dirty=ClipPolyline([[10,10],[NaN,20],[30,30],[Infinity,5],[40,40],[60,60]],box);
  assert.ok(dirty.every(run=>run.points.flat().every(Number.isFinite)&&Number.isFinite(run.offset)),"non-finite points never reach the output");
  assert.deepEqual(dirty.map(run=>run.points),[[[40,40],[60,60]]],"non-finite points break the polyline");
  assert.deepEqual(ClipPolyline([[5,5]],box),[],"a single point draws nothing");
}
// Air-wall map extraction, viewport layer schema, and translucent software OverlayFace alpha blending.
{
  assert.ok(Array.isArray(map.airWalls) && map.airWalls.some(o => o.tag === "airWall"), "BuildEncounterMap exports scene airWalls for 2D/3D preview");
  assert.ok(!map.objects.some(o => o.tag === "airWall"), "airWalls stay separate from solid map objects");
  const packetWithAirWalls = structuredClone(packet);
  packetWithAirWalls.context.viewports = {
    count: 1, active: 0,
    views: [{
      type: "plan", mode: "stage", target: "player", center: [0, 0], scale: 4, followZoom: 1, yaw: 0, pitch: -0.5,
      viewport: { width: 640, height: 360 },
      layers: { routes: true, spawns: true, triggers: true, fire: true, names: true, importantLandmarks: true, landmarks: false, airWalls: true },
    }],
  };
  assert.equal(ReadFramePacket(packetWithAirWalls, FLOW_TIMELINE).context.viewports.views[0].layers.airWalls, true);
  packetWithAirWalls.context.viewports.views[0].layers.airWalls = false;
  assert.equal(ReadFramePacket(packetWithAirWalls, FLOW_TIMELINE).context.viewports.views[0].layers.airWalls, false);
  delete packetWithAirWalls.context.viewports.views[0].layers.airWalls;
  assert.equal(ReadFramePacket(packetWithAirWalls, FLOW_TIMELINE).context.viewports.views[0].layers.airWalls, undefined, "legacy viewport layouts without airWalls remain valid");
  const invalidAirWalls = structuredClone(packetWithAirWalls);
  invalidAirWalls.context.viewports.views[0].layers.airWalls = "yes";
  assert.throws(() => ReadFramePacket(invalidAirWalls, FLOW_TIMELINE));
  // Software OverlayFace honors 8-digit #rrggbbaa alpha so 3D airWalls render semi-transparently without WebGL2.
  const prevImageData = globalThis.ImageData;
  globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
  try {
    let captured = null;
    const swRaster = {
      width: 8, height: 8, displayWidth: 8, displayHeight: 8, perspective: false, accelerated: false,
      Occluded: () => false,
      overlay: { width: 0, height: 0, getContext: () => ({ putImageData(img) { captured = img; } }) },
    };
    const fakeCtx = { drawImage() {} };
    EncounterRaster.prototype.OverlayFace.call(swRaster, fakeCtx, [{ x: 0, y: 0, depth: 10 }, { x: 8, y: 0, depth: 10 }, { x: 8, y: 8, depth: 10 }, { x: 0, y: 8, depth: 10 }], "#ff000040", { visible: 0, hidden: 0 }, 0.08);
    assert.ok(captured && captured.data[0] === 255 && captured.data[3] === 64, `software OverlayFace writes #rrggbbaa alpha cleanly (${captured?.data[3]})`);
  } finally {
    if (prevImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = prevImageData;
  }
  // 3D DrawAirWalls must draw in oblique mode (camera distance ~far/2 = 750m) as well as perspective scene mode, and respect dynamic signals.
  for (const mode of ["oblique", "scene"]) {
    let faces = 0, strokes = 0;
    const view3d = Object.assign(Object.create(FlowPerspectiveView.prototype), {
      type: mode, freeCamera: mode === "scene" ? {} : null, width: 640, height: 360, focal: 320, scale: 4,
      viewFar: 1500, sceneCamera: { near: 0.15, far: 1500, verticalFov: 60 },
      center: [120, 560], centerHeight: 0, yaw: -0.45, pitch: 0.67,
      eye: [120, 450, 560 - 600], right: [1, 0, 0], up: [0, 0.8, 0.6], forward: [0, -0.6, 0.8],
      mapData: { airWalls: [
        { id: "StaticWall", pos: [120, 0, 560], size: [10, 6, 0.4], yawDeg: 0, tag: "airWall", visual: false },
        { id: "GateWall", pos: [122, 0, 560], size: [8, 6, 0.4], yawDeg: 0, tag: "airWall", visual: false, hideOn: "MgSilenced" },
      ] },
      Ground: () => 0,
      CameraPoint: () => [0, 0, mode === "oblique" ? 750 : 40],
      raster: { OverlayFace() { faces++; }, Stroke() { strokes++; } },
    });
    view3d.DrawAirWalls({}, { beat: { id: "09b" }, signals: [] });
    assert.ok(faces >= 2 && strokes >= 8, `3D ${mode} view draws both static & active dynamic airWalls (${faces} faces, ${strokes} strokes)`);
    const before = faces;
    view3d.DrawAirWalls({}, { beat: { id: "10a" }, signals: ["MgSilenced"] });
    assert.equal(faces - before, 1, `3D ${mode} view hides dynamic gate once its hideOn signal is active`);
  }
}
console.log("ok  Encounter design: editable causal triggers, spawn caps and behaviors, continuous pursuit/tanks, full scene map, deterministic rewind, undo and PNG round-trip");
