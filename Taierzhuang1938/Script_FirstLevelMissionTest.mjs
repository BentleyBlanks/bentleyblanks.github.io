import { MissionVoiceTimeline } from "./Data_FirstLevelMissionVoiceTiming.mjs";
import { MISSION_CIVILIAN_AFTERMATH } from "./Data_FirstLevelMissionCivilianAftermath.mjs";
import { OPENING } from "./Data_FirstLevelOpening.mjs";
import { FirstLevelOpening } from "./Script_FirstLevelOpening.mjs";
import { MISSION_AFTERMATH, FRONT_BREACHES, FRONT_ASSAULT, FRONT_COVER, FRONT_FIELD_MEN, FRONT_RESERVES, FRONT_ASSAULT_STARTS, FrontAssaultLane, FrontReserveLane } from "./Data_FirstLevelMissionFront.mjs";
import { COVER } from "./Data_Tuning_AiCover.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { CollectBulletNearMisses,ApplyBulletNearMisses } from "./Script_BallisticSuppression.mjs";
import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { CARRIAGE_SOUND, CARRIAGE_SOUND_ASSETS } from "./Data_FirstLevelCarriageSound.mjs";
import { FirstLevelCarriageSound } from "./Script_FirstLevelCarriageSound.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { MISSION_TRAIN, MissionTrainMotion } from "./Data_FirstLevelMissionTrain.mjs";
import { FirstLevelMissionTrain } from "./Script_FirstLevelMissionTrain.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { TransferBeatReady, GuardCrossingPair, FrontReplacementSlots } from "./Script_FirstLevelMissionPacing.mjs";
import { FIRST_LEVEL_STAGES, ResolveFirstLevelStage, FirstLevelStageForStep } from "./Data_FirstLevelMissionStages.mjs";
import { BuildFirstLevelCheckpoint } from "./Script_FirstLevelMissionCheckpoint.mjs";
import { FirstLevelMissionColumn, MissionCarryRoutePoint, MissionGuideSpeed, MissionGuideRoute, MissionSquadRoute, MissionSquadPace } from "./Script_FirstLevelMissionColumn.mjs";
import { MISSION_STAGES, MISSION_TUNING as R, FIRST_LEVEL_MISSION_PHASE, MISSION_TACTICS, MISSION_ENCOUNTERS, MISSION_PURSUIT_ROUTE } from "./Data_FirstLevelMission.mjs";
import { MISSION_LAYOUT, MISSION_ROUTES, MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TERRAIN, SampleMissionTerrain, MissionPathDistance } from "./Data_FirstLevelMissionTerrain.mjs";
import { CreateP012Terrain } from "./Data_FirstLevelP012Terrain.mjs";
import { MISSION_DIALOGUE, MissionVoicePrompt } from "./Data_FirstLevelMissionDialogue.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
assert.ok(P.stationCasualties.every(person=>person.health>0),"station shelling does not manufacture dead recruits at muster");
for(const person of MISSION_CIVILIAN_AFTERMATH) {
  assert.ok(["male","female"].includes(person.variant) && person.side==="civilian");
  assert.ok(Object.values(MISSION_ROUTES).every(route=>MissionPathDistance(person,route)>=2.4),"civilian bodies leave stretcher and player routes clear: "+person.id);
  const wall=MISSION_LAYOUT.blocks.find(b=>b.id===person.houseId+"West");
  assert.ok(wall && Math.hypot(person.x-wall.x,person.z-wall.z)<26,"civilian remains belong to an actual nearby house");
  for(const other of [...MISSION_AFTERMATH,...MISSION_CIVILIAN_AFTERMATH])
    if(other!==person)assert.ok(Math.hypot(person.x-other.x,person.z-other.z)>=1.9,"new civilian bodies do not overlap existing remains");
}
for(const point of [MISSION_TRAIN.guideMuster,...MISSION_TRAIN.cars.flatMap(car=>car.muster)])
  assert.ok(MISSION_AFTERMATH.every(body=>Math.hypot(body.x-point.x,body.z-point.z)>=1.8),"living recruits never muster on historical bodies");
{
  const beat={earliestS:35,latestS:60,loaded:4,restS:12};
  assert.equal(TransferBeatReady(beat,{seconds:35,loaded:4,previousClearedAt:30}),false,"vehicle event cannot erase the breathing window");
  assert.equal(TransferBeatReady(beat,{seconds:44,loaded:4,previousClearedAt:30}),true);
  assert.equal(TransferBeatReady(beat,{seconds:59,loaded:0,previousClearedAt:10}),false);
  assert.equal(TransferBeatReady(beat,{seconds:60,loaded:0,previousClearedAt:10}),true,"casualties or delayed loading cannot starve the next finite attack");
  assert.equal(TransferBeatReady(beat,{seconds:600,loaded:20,previousClearedAt:null}),false,"an uncleared previous attack never stacks another wave");
  assert.deepEqual(GuardCrossingPair([{id:1,alive:false},{id:2,alive:true},{id:3,alive:true}],2),[2],"a fallen partner does not strand the surviving crossing man");
  assert.deepEqual(GuardCrossingPair([{id:1,alive:true,safe:true},{id:2,alive:false},{id:3,alive:true}],2),[3]);
  assert.equal(FrontReplacementSlots({alive:149,queued:1,spawned:0},R),0,"queued men reserve live capacity");
  assert.equal(FrontReplacementSlots({alive:24,queued:0,spawned:5},{...R,waveBudget:6}),1,"last finite replacement is not rounded up to a squad");
  assert.equal(FrontReplacementSlots({alive:0,queued:0,spawned:R.waveBudget},R),0,"no infinite replacement loop");
  for(const spec of MISSION_ENCOUNTERS.front)assert.ok(spec.x>MISSION_LAYOUT.bounds.minX && spec.x<MISSION_LAYOUT.bounds.maxX && spec.z>MISSION_LAYOUT.bounds.minZ && spec.z<MISSION_LAYOUT.bounds.maxZ,"every simultaneous soldier starts inside the playable heightfield");
}
{
  for (const time of [0,10,20,R.trainTravelM/R.trainCruiseSpeedMps-1]) {
    const a=MissionTrainMotion(time),b=MissionTrainMotion(time+.1);
    assert.ok(Math.abs((a.offsetM-b.offsetM)/.1-6)<1e-6,"train keeps real cruise speed before shell impact");
  }
  for (const impactAt of [24,26,28]) {
    const start=MissionTrainMotion(impactAt),stop=MissionTrainMotion(impactAt,impactAt,start.offsetM);
    let previous=start;
    for(let t=.01;t<=stop.brakeSeconds+.02;t+=.01) {
      const current=MissionTrainMotion(impactAt+t,impactAt,start.offsetM);
      assert.ok(current.offsetM<=previous.offsetM && current.offsetM>=0);
      assert.ok(current.speedMps<=previous.speedMps && current.speedMps>=0);
      previous=current;
    }
    assert.equal(previous.offsetM,0);assert.ok(previous.stopped);
    assert.equal(stop.speedMps,start.speedMps,"impact does not accelerate or jerk the train");
  }
  assert.ok(MISSION_TRAIN.cars.at(-1).z+R.trainTravelM+8<MISSION_LAYOUT.bounds.maxZ,"whole train begins inside the extended approach");
}
const flow = new FirstLevelMissionFlow();
{
 const calls=[],moved=[],stopped=[],levels=[];
 const actor={alive:true,position:{x:-78.65,y:1,z:92.8}};
 const audio={Ambience:id=>calls.push(id),SetAmbienceLayerLevel:(...args)=>levels.push(args),
  Play:(id,options)=>{calls.push({id,...options});return {duration:7};},
  MoveVoice:(_voice,position)=>moved.push({...position}),StopVoice:voice=>stopped.push(voice)};
 const sound=new FirstLevelCarriageSound(audio,()=>[{actor,carIndex:1,slot:CARRIAGE_SOUND.cheerSlots[0]}]);
 sound.Start();sound.Handle(CARRIAGE_SOUND.reactions[0].id);
 assert.equal(calls[0],CARRIAGE_SOUND.preset);
 assert.equal(calls[1].id,CARRIAGE_SOUND.cheerCue);
 assert.equal(calls[1].position.y,2.2,'rear reactions come from mouth height');
 actor.position.z-=6;sound.Update(1);
 assert.equal(moved[0].z,actor.position.z,'the source follows the moving train passenger');
 sound.Handle('CarriageUneasy');assert.equal(levels.at(-1)[1],CARRIAGE_SOUND.uneasyScale);
 sound.Impact();assert.equal(stopped.length,1);assert.equal(calls.at(-1),'trainInterior');
 sound.Stopped();assert.equal(calls.at(-1),'firstLevelFront','rolling wheels stop with the actual train');
 sound.Start();assert.equal(levels.at(-1)[1],1,'restart restores the lively crowd');
 const manifest=JSON.parse(fs.readFileSync(new URL('./Audio/Amb/Data_AmbManifest.json',import.meta.url)));
 for(const asset of CARRIAGE_SOUND_ASSETS){
  const entry=manifest.carriageSources[asset.id];
  const bytes=fs.readFileSync(new URL('./Audio/Amb/'+asset.file,import.meta.url));
  assert.equal(entry.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(entry.promptHash,crypto.createHash('sha256').update(asset.prompt).digest('hex'));
  assert.equal(entry.requests,1);assert.ok(entry.continuous&&entry.seconds>2);
 }
}
assert.equal(FIRST_LEVEL_STAGES.length,18);
assert.deepEqual(FIRST_LEVEL_STAGES.flatMap(stage=>stage.steps),MISSION_STAGES.slice(0,-1).map(step=>step.id));
for (const phase of FIRST_LEVEL_STAGES) {
  const saved=BuildFirstLevelCheckpoint(phase.number), step=MISSION_STAGES[saved.index];
  assert.equal(ResolveFirstLevelStage(phase.id),phase);
  assert.equal(FirstLevelStageForStep(step.id),phase);
  assert.ok(MISSION_STAGES.slice(0,saved.index).flatMap(s=>s.requirements).every(f=>saved.facts.includes(f)));
  assert.ok(step.requirements.some(f=>!saved.facts.includes(f)),"destination must still require gameplay: "+phase.id);
  const column=new FirstLevelMissionColumn(); column.Restore(saved.column);
  const before=column.Snapshot();column.Update(.1);assert.ok(Number.isFinite(column.zhou.x));
  assert.deepEqual(BuildFirstLevelCheckpoint(phase.id).column,before,"cached starts cannot be mutated by a run");
  if(phase.number>=11)assert.ok(column.gateOpen&&column.litters.every(l=>l.passedGate));
  if(phase.number>=13)assert.equal(column.loadEvents.length,R.zhouQueueIndex);
  if(phase.number===14)assert.equal(column.zhou.state,"carried");
  if(phase.number===17)assert.equal(column.zhou.state,"placed");
  if(phase.number===18)assert.equal(column.zhou.health,0);
}
for(const value of [0,19,-1,1.5,"Complete","Carry",null])assert.throws(()=>ResolveFirstLevelStage(value));
console.log("ok 18 Notion stages, complete prior facts, live destination gates and independent reconstructed columns");
flow.Start();
for (const stage of MISSION_STAGES.slice(0, -1)) {
  assert.equal(flow.stage.id, stage.id);
  flow.Update(600);
  assert.equal(flow.stage.id, stage.id, "Elapsed time alone cannot pass a mission");
  for (const fact of stage.requirements) flow.Record(fact);
  const snapshot = flow.Snapshot(),
    restored = new FirstLevelMissionFlow();
  restored.Restore(snapshot);
  assert.deepEqual(restored.State(), flow.State());
  flow.Update(1);
}
assert.equal(flow.completed, true);
console.log("ok all mission gates require recorded gameplay facts and restore exactly");
{
  const Position=(x,z)=>({x,y:0,z,clone:()=>({x,y:0,z,project(){this.x=0;this.y=0;this.z=0;}})});
  const enemies=[...Array(8)].map((_,i)=>({id:i+1,missionId:`Enemy${i}`,alive:true,
    position:Position(0,i===7?3:40+i),stance:0,missionEncounter:"front"}));
  const r={time:0,flow:{stage:{id:"Support"}},enemies:new Map(enemies.map(a=>[a.id,a])),
    player:{position:Position(0,0),EyePosition:Position(0,0),camera:{}},Point:p=>p,BlocksSight:()=>false};
  const opening=new FirstLevelOpening(r);
  for(let slot=0;slot<8;slot++){
    r.time=slot*OPENING.fireSlotSeconds;opening.FireWindows();
    assert.equal(enemies[7].missionFireHold,false,"close enemy keeps a firing window across distant rotations");
    assert.ok(enemies.filter(a=>!a.missionFireHold).length<=OPENING.playerFireLimit);
  }
  r.BlocksSight=(from)=>from===enemies[7].position;opening.FireWindows();
  assert.equal(enemies[7].missionFireHold,true,"wall-blocked close enemy cannot displace visible shooters");
}
{
  const facts=new Map(),calls=[];
  const r={column:{zhou:{id:"Zhou",health:100,visible:false}},Has:id=>facts.has(id),Record:(id,detail)=>facts.set(id,detail),
    Point:p=>p,MoveActor:()=>calls.push("move"),OnPlayerDown:()=>calls.push("fail"),MissionFailure:id=>calls.push(id),
    emplacement:{NpcVacate:()=>calls.push("vacate")},ai:{SetStance(){},Remove:()=>calls.push("remove")}};
  const opening=new FirstLevelOpening(r);
  opening.zhou={id:54,alive:true,health:80,lastFire:5,position:{...OPENING.zhouGunSeat},yaw:0};
  opening.UpdateZhou();
  assert.ok(calls.includes("move")&&!facts.has("zhouGunWounded"),"an early actual wound makes Zhou leave the gun, not wait under fire for later gates");
  opening.zhou.position={...OPENING.zhouRest};opening.UpdateZhou();
  assert.equal(r.column.zhou.health,80,"representation transfer preserves actual injury");
  assert.ok(facts.get("zhouGunWounded").alive&&calls.includes("remove"));
  facts.clear();calls.length=0;opening.zhou.alive=false;opening.zhou.health=0;
  opening.UpdateZhou();
  assert.ok(facts.has("zhouGunKilled")&&!facts.has("zhouGunWounded")&&calls.includes("fail"),"actual death fails the mission instead of becoming a living litter");
}
for(const [index,step] of MISSION_STAGES.filter(s=>!["TrenchEntry","Shelter"].includes(s.id)).entries()){
  const legacy={version:1,index,time:42,stageTime:2,facts:[],log:[]};
  const restored=new FirstLevelMissionFlow();restored.Restore(legacy);
  assert.equal(restored.stage.id,step.id,"v1 index migrates through the old stage order");
  restored.Restore({...legacy,log:[{kind:"stage",id:step.id,time:40}]});
  assert.equal(restored.stage.id,step.id,"v1 log preserves the named stage");
}
const stable=new FirstLevelMissionFlow();stable.Restore({version:2,stageId:"Shelter",index:0,time:1,stageTime:0,facts:["trenchCleared"],log:[]});
assert.equal(stable.stage.id,"Shelter","v2 stable stage id overrides positional index");
const terrain = CreateP012Terrain(MISSION_LAYOUT);
for (const [x, z] of [
  [-24, -53],
  [-8, -106],
  [12, -124],
  [20, 109],
])
  assert.ok(SampleMissionTerrain(x, z) < -0.8, "Excavated soil is below natural ground");
for (const point of Object.values(A)) assert.ok(Number.isFinite(terrain.SampleHeight(point.x, point.z)));
assert.ok(!MISSION_LAYOUT.blocks.some((block) => block.semantic === "ground"));
assert.equal(FIRST_LEVEL_MISSION_PHASE.whitebox.fullMission, true);
assert.ok(SampleMissionTerrain(135,90)>2.8 && SampleMissionTerrain(-204,90)>3.8,
  "Peripheral earth banks frame the plain through the same physical heightfield");
console.log("ok shared terrain, excavated trenches, structural floors only");
const tacticalRoutes = Object.fromEntries(Object.entries(MISSION_TACTICS).map(([id, plan]) => [id,
  [Object.values(MISSION_ENCOUNTERS).flat().find(spec => spec.id === id), ...plan.points]]));
for(const spec of [...MISSION_ENCOUNTERS.retreat,...MISSION_ENCOUNTERS.air])
  tacticalRoutes[spec.id+"Pursuit"]=[spec,...MISSION_PURSUIT_ROUTE.slice(MISSION_PURSUIT_ROUTE.findIndex(point=>point.x<=spec.x))];
// Bounding-assault lanes: every front rifleman and every wave drop point must rush between lines without cutting a cover block.
// FRONT_ASSAULT_STARTS is the single roster the cover rows are built around and the runtime spawns
// from; walking it here is what keeps the three in step.
assert.deepEqual(MISSION_ENCOUNTERS.front,[...FRONT_FIELD_MEN,...FRONT_RESERVES],"the front encounter roster includes every assault and supporting actor");
const reserveLanes=Object.fromEntries(FRONT_RESERVES.map(spec=>[spec.id,[spec,...FrontReserveLane(spec.x,spec.z)]]));
assert.equal(Object.keys(reserveLanes).length,R.frontReserveCount);
const assaultLanes=Object.fromEntries(FRONT_ASSAULT_STARTS.map(start=>
  ["Assault"+start.id,[start,...FrontAssaultLane(start.x,start.z)]]));
assert.ok(Object.values(assaultLanes).every(route=>route.length>=2&&route.at(-1).z===FRONT_ASSAULT.lines.at(-1)),"every assault lane ends on the last bound line");
assert.ok(Object.keys(assaultLanes).length>=24,"most front riflemen and every wave drop point get a bounding lane: "+Object.keys(assaultLanes).length);
const reliefRoutes=Object.fromEntries(P.reliefPositions.map((point,i)=>["Relief"+i,[MISSION_TRAIN.cars[2].muster[i],...P.reliefApproach,{x:point.x,z:-123},point]]));
for (const [name, route] of Object.entries({ ...MISSION_ROUTES, ...Object.fromEntries(MISSION_TERRAIN.trenches.filter(t=>t.role).map(t=>[t.id,t.points])), ...tacticalRoutes, ...assaultLanes, ...reserveLanes, ...reliefRoutes, ...Object.fromEntries(P.guardWithdrawalRoutes.map((route,i)=>["Guard"+i,route])) })) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      distance = Math.hypot(a.x - b.x, a.z - b.z);
    for (let d = 0; d <= distance; d += 0.4) {
      const t = d / distance,
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t,
        y = SampleMissionTerrain(x, z);
      for (const box of MISSION_LAYOUT.blocks) {
        if (MISSION_LAYOUT.walkableSurfaces.some((surface) => surface.id === box.id)) continue;
        const dx=x-box.x, dz=z-box.z, cosine=Math.cos(box.ry||0), sine=Math.sin(box.ry||0);
        const blocked =
          Math.abs(dx*cosine-dz*sine) < box.w / 2 + 0.35 &&
          Math.abs(dx*sine+dz*cosine) < box.d / 2 + 0.35 &&
          box.y + box.h / 2 > y + 0.3 &&
          box.y - box.h / 2 < y + 1.7;
        assert.equal(
          blocked,
          false,
          `${name} capsule route intersects ${box.id} at ${x.toFixed(1)},${z.toFixed(1)}`,
        );
      }
    }
  }
}
const frontCover=MISSION_LAYOUT.blocks.filter(block=>block.id.startsWith("FrontCover"));
for(const wall of [...["FrontTraverseBlastScreen","BundleParapet","FlankParapet","MachineGunSideCover-1","MachineGunSideCover1"]
  .map(id=>{const found=MISSION_LAYOUT.blocks.find(b=>b.id===id);assert.ok(found,"hand-built cover survives generic route cleanup: "+id);return found;}),...frontCover]){
  for(const x of [-1,0,1])for(const z of [-1,0,1])assert.ok(wall.y-wall.h/2<=SampleMissionTerrain(wall.x+x*wall.w/2,wall.z+z*wall.d/2),"cover foundations follow the slope: "+wall.id);
}
console.log("ok authored capsule routes clear walls, crates and gun supports");
// ---------------------------------------------------------------------------
// Front assault cover (docs/Data_FrontCover.md)
// ---------------------------------------------------------------------------
// The gate behind "far enemies take cover": a bound line the AI can reach with nothing to kneel
// behind is the open-field pose the capture caught. These assertions hold the two halves together
// - the cover has to be there, and the rush lane still has to get past it.
{
  const columns=FRONT_ASSAULT.blockedX.map(([a,b])=>[a,b]).sort((left,right)=>left[0]-right[0]);
  assert.deepEqual(columns,FRONT_COVER.columns.map(column=>[...column.x]),"blockedX is exactly the cover columns, in order");
  for(const [index,[a,b]] of columns.entries()){
    // A bound moves at most 2 x lateralM in x and ClearLaneX only ever pushes a man 0.6 m clear,
    // so a column this wide cannot be straddled: both ends of every rush stay on one side of it.
    assert.ok(b-a>=FRONT_COVER.minColumnM,`cover column ${FRONT_COVER.columns[index].id} is at least minColumnM wide: ${(b-a).toFixed(1)}`);
    assert.ok(b-a>2*FRONT_ASSAULT.lateralM,"a lane jitter cannot step over a cover column");
    if(index)assert.ok(columns[index-1][1]<a,"cover columns never overlap");
    const build=FRONT_COVER.columns[index].coverX||FRONT_COVER.columns[index].x;
    assert.ok(build[0]>=a&&build[1]<=b,"a column only ever builds inside its own lane span");
  }
  for(const [name,route] of Object.entries(assaultLanes))for(const point of route.slice(1)){
    assert.ok(point.x>=FRONT_ASSAULT.xRange[0]&&point.x<=FRONT_ASSAULT.xRange[1],name+" bounds inside the assault span");
    for(const [a,b] of columns)assert.ok(!(point.x>a&&point.x<b),`${name} never bounds into a cover column at x=${point.x.toFixed(1)}`);
  }
  // Every bank is a crouch-and-hide cover: too tall to walk over, too low to hide a standing man.
  const points=frontCover.map(block=>({x:block.x,z:block.z,h:block.h}));
  assert.ok(points.length>=90,"the four rows are actually built: "+points.length);
  for(const block of frontCover){
    assert.ok(block.h>TRAVERSAL.stepMax&&block.h<COVER.tallM,`${block.id} stays in the crouch-and-hide band: ${block.h.toFixed(2)}`);
    assert.ok(block.h>=COVER.minUsefulM,block.id+" registers as a usable cover point");
    assert.ok(block.cover&&block.d/2<COVER.standoffM-.2,block.id+" is thin enough that its hide position clears the face");
  }
  for(const row of FRONT_COVER.rows){
    assert.ok(row.z>row.line&&row.z-row.line<=2.5,`the ${row.id} row sits 0-2.5 m south of its line, between the man and the Chinese line`);
    const xs=points.filter(point=>Math.abs(point.z-row.z)<.6).map(point=>point.x).sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++)assert.ok(xs[i]-xs[i-1]>=COVER.minAllySpacingM,
      `${row.id} cover points stay minAllySpacingM apart so a squad line can hold neighbours: ${(xs[i]-xs[i-1]).toFixed(2)}`);
  }
  // Coverage: how much of a bound line has a registered cover point inside assaultCoverSearchM.
  // Before this pass the four lines read 30 / 68 / 48 / 57 %; the capture that started it found
  // 2 of 31 live Japanese in the 46-74 m band holding a cover point at all.
  const registered=MISSION_LAYOUT.blocks.filter(block=>block.cover&&block.h>=COVER.minUsefulM);
  let covered=0,samples=0;
  for(const line of FRONT_ASSAULT.lines){
    const near=registered.filter(block=>Math.abs(block.z-line)<=R.assaultCoverSearchM);
    let hit=0,count=0;
    for(let x=FRONT_ASSAULT.xRange[0];x<=FRONT_ASSAULT.xRange[1];x+=1){
      count++;
      if(near.some(block=>Math.hypot(block.x-x,block.z-line)<=R.assaultCoverSearchM))hit++;
    }
    covered+=hit;samples+=count;
    assert.ok(hit/count>=.7,`bound line ${line} has cover within assaultCoverSearchM over 70% of its span: ${(hit/count*100).toFixed(1)}%`);
  }
  assert.ok(covered/samples>=.7,"the whole assault front is covered: "+(covered/samples*100).toFixed(1)+"%");
  // The tank advances by interpolation with no collision response, so its lane stays clear of the
  // new banks whichever target it is tracking. Half hull width is 1.2 m: the collider in
  // Script_FirstLevelMissionView is h=[1.075,1.28,2.15] and it drives along its own length.
  // (FieldRuin1 already stands in the default advance; that predates this pass and is left alone.)
  for(const destinationX of [R.tankPursuitBounds.minX,36,R.tankPursuitBounds.maxX]){
    const from=P.tankStart,to={x:destinationX,z:R.tankFirstFireZ},length=Math.hypot(to.x-from.x,to.z-from.z);
    for(let travelled=0;travelled<=length;travelled+=.25){
      const t=travelled/length,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      for(const block of frontCover)assert.ok(Math.abs(block.x-x)>=block.w/2+1.2||Math.abs(block.z-z)>=block.d/2+1.2,
        `${block.id} stands in the tank advance to x=${destinationX}`);
    }
  }
}
console.log("ok four cover rows fill the assault front, the rush lanes still clear them and the tank lane stays open");
// Each waiting team occupies an authored work area, with clear paths for both bearer ends.
import {MISSION_CROWD_AREAS as areas} from './Data_FirstLevelMissionCrowd.mjs';import {MISSION_LAYOUT as crowdLayout} from './Data_FirstLevelMissionLayout.mjs';import {SampleMissionTerrain as crowdGround} from './Data_FirstLevelMissionTerrain.mjs';import {MissionCarryRoutePoint as crowdPoint,MissionRouteLength as crowdLength} from './Script_FirstLevelMissionColumn.mjs';
const bad=[];for(const a of areas)for(const [kind,points] of [['litter',a.pockets],['walker',a.walkerPockets]])for(const [i,p] of points.entries()){const routes=[[a.trigger,{x:a.trigger.x,z:a.entryZ},{x:p.x,z:a.entryZ},p],[p,{x:p.x,z:a.exitZ},a.merge]];for(const route of routes)for(let d=0;d<crowdLength(route);d+=.3){const c=crowdPoint(route,d);for(const offset of kind==='litter'?[-1.28,0,1.28]:[0]){const x=c.x-Math.sin(c.yaw)*offset,z=c.z-Math.cos(c.yaw)*offset,y=crowdGround(x,z);for(const b of crowdLayout.blocks){if(b.solid===false||crowdLayout.walkableSurfaces.some(s=>s.id===b.id))continue;const dx=x-b.x,dz=z-b.z,co=Math.cos(b.ry||0),si=Math.sin(b.ry||0);if(Math.abs(dx*co-dz*si)<b.w/2+.32&&Math.abs(dx*si+dz*co)<b.d/2+.32&&b.y+b.h/2>y+.3&&b.y-b.h/2<y+1.7)bad.push({area:a.id,kind,i,box:b.id,x,z});}}}}
assert.deepEqual(bad,[],"all staging routes clear real walls and furniture, including both bearers");
assert.ok(areas.every(a=>a.walkerPockets.length===R.walkingWoundedCount+R.medicCount+R.civilianCount));
const c = new FirstLevelMissionColumn();
assert.equal(c.litters.length,10,"one squad escorts ten litters");
assert.ok(c.litters.every(l=>l.bearers.length===2),"each litter has exactly two bearer slots");
assert.deepEqual(c.walkers.map(w=>w.kind),["medic","medic","civilian","civilian"],"only essential unarmed support accompanies the litters");
function CheckStagingClearance(column){
  const teams=column.litters.filter(l=>l.staging);
  for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++)
    assert.ok(Math.hypot(teams[i].x-teams[j].x,teams[i].z-teams[j].z)>2,"arriving and departing litters do not pass through resting teams");
}
c.Activate();
for (let i = 0; i < 6000; i++){c.Update(0.1);if(i%5===0)CheckStagingClearance(c);}
assert.equal(c.State().gatePassed, 0);
assert.ok(c.litters.every(l=>l.staging?.mode==="resting"&&l.staging.area==="courtyard"));
assert.ok(Math.max(...c.litters.map(l=>l.x))-Math.min(...c.litters.map(l=>l.x))>25,"waiting litters occupy the width of the sheltered yard");
assert.ok(c.walkers.every(w=>w.staging?.mode==="resting"),"walkers reach separate waiting places");
const waitingStart=c.walkers.map(w=>({x:w.x,z:w.z})),waitingTravel=c.walkers.map(()=>0);
for(let frame=0;frame<240;frame++){c.Update(.1);c.walkers.forEach((w,i)=>waitingTravel[i]=Math.max(waitingTravel[i],Math.hypot(w.x-waitingStart[i].x,w.z-waitingStart[i].z)));}
assert.ok(waitingTravel.filter(d=>d>.15).length>=Math.ceil(c.walkers.length*.75),"waiting wounded and medics make staggered short steps");
assert.ok(waitingTravel.every(d=>d<1.1),"waiting people remain near their assigned places");
c.gateOpen = true;
for (let i = 0; i < 6000; i++){c.Update(0.1);if(i%5===0)CheckStagingClearance(c);}
assert.equal(c.State().gatePassed, R.litterCount);
c.loading = true;
let transferReadyAt=null;
for (let i = 0; i < 6000; i++){c.Update(0.1);if(transferReadyAt===null&&c.TransferReady())transferReadyAt=(i+1)*.1;}
assert.ok(transferReadyAt>=120&&transferReadyAt<=240,"physical staging and loading fit the planned two-to-four-minute transfer");
assert.equal(c.State().loaded, R.zhouQueueIndex);
assert.equal(c.departed, 2);
assert.equal(c.QueueAhead(), 0);
assert.equal(c.zhou.loaded, false);
assert.ok(c.vehicles.slice(0, 2).every((cart) => cart.z > 180));
assert.equal(c.vehicles[2].load.length, R.zhouQueueIndex % R.cartCapacity);
const zhouBefore = { x: c.zhou.x, z: c.zhou.z };
assert.ok(c.BeginZhouBoarding());
for (let i = 0; i < 50; i++) c.Update(0.1);
assert.ok(Math.hypot(c.zhou.x - zhouBefore.x, c.zhou.z - zhouBefore.z) > R.boardingWitnessM);
assert.equal(
  c.zhou.loaded,
  false,
  "Zhou is physically taken to the loading bay before the raid interrupts boarding",
);
const saved = c.Snapshot(),
  copy = new FirstLevelMissionColumn();
copy.Restore(saved);
assert.deepEqual(copy.State(), c.State());
c.AirDamage();
const originalBearerBodies=structuredClone(c.bearerCasualties);
assert.equal(originalBearerBodies.length,3,"three raid casualties are recorded where they fell");
assert.equal(c.litters.filter((l) => l.state === "fallen").length, 2);
assert.ok(c.vehicles.some((cart) => cart.overturned));
c.zhou.state = "waiting";
c.zhou.bearers = [75, 75];
for (const litter of c.litters) if (litter.state === "fallen") litter.state = "waiting";
c.StartRetreat();
for (const point of [A.retreatA, A.retreatB, A.retreatC]) {
  const living = c.litters.filter((l) => !l.loaded && l.health > 0),
    pass = c.RetreatLimit(point) - 12,
    cap = pass + living.length * R.litterSpacingM + 5;
  for (let i = 0; i < 4000; i++) c.Update(0.1, { maxProgress: cap });
  assert.ok(
    living.every((l) => l.progress > pass),
    "Every surviving litter must physically pass the rearguard position",
  );
}
c.StartReception();
for (let i = 0; i < 4000; i++) c.Update(0.1);
assert.ok(c.litters.filter((l) => !l.loaded && l.health > 0).every((l) => l.received));
assert.ok(Math.hypot(c.zhou.x - A.zhouPickup.x, c.zhou.z - A.zhouPickup.z) < 0.01);
c.StartFinalExit();
for (let i = 0; i < 4000; i++) c.Update(0.1);
assert.ok(c.walkers.filter((w) => w.kind === "medic" && w.health > 0).every((w) => w.escaped));
assert.deepEqual(c.bearerCasualties.slice(0,originalBearerBodies.length),originalBearerBodies,"fallen bearers stay at the original position after rescue and departure");
console.log(
  "ok 10 litters, closed gate, physical load queue, 2 departing carts, interrupted transfer, three passages, reception and actual rear exit",
);
// Survivor counts change the number of useful loads; missing people cannot fill a cart.
for (const lost of Array.from({length:R.zhouQueueIndex+1},(_,i)=>i)) {
  const reduced = new FirstLevelMissionColumn();
  reduced.Activate(); reduced.gateOpen = true; reduced.loading = true;
  for (let i = 0; i < lost; i++) reduced.litters[i].health = 0;
  for (let i = 0; i < 10000; i++) reduced.Update(.1);
  assert.ok(reduced.TransferReady(), 'Surviving transport reaches a real departure after '+lost+' losses');
  assert.ok(reduced.litters.slice(0, R.zhouQueueIndex).filter(l => l.health > 0).every(l => l.loaded));
  assert.ok(reduced.litters.slice(0, lost).every(l => l.health === 0 && !l.loaded), 'Casualties are never manufactured as passengers');
  assert.ok(reduced.BeginZhouBoarding());
}
const movingCartColumn = new FirstLevelMissionColumn();
movingCartColumn.Activate(); movingCartColumn.gateOpen = true; movingCartColumn.loading = true;
let sawApproach = false, sawLift = false;
for (let i = 0; i < 10000; i++) {
  movingCartColumn.Update(.1);
  sawApproach ||= movingCartColumn.vehicles.some(cart => cart.state === 'approaching' && cart.approachProgress > 0);
  sawLift ||= movingCartColumn.litters.some(l => l.liftFraction > 0 && l.liftFraction < 1);
}
assert.ok(sawApproach && sawLift, 'Next cart drives into the bay and litters visibly lift aboard');
console.log('ok partial survivor loads, sequential bay arrivals and continuous boarding');
const rescueColumn=new FirstLevelMissionColumn();
rescueColumn.Activate();rescueColumn.gateOpen=true;
for(let i=0;i<5000;i++)rescueColumn.Update(.1);
const walkerPoints=rescueColumn.walkers.map(w=>[w.x,w.z]);
for(let i=0;i<walkerPoints.length;i++)for(let j=i+1;j<walkerPoints.length;j++)
  assert.ok(Math.hypot(walkerPoints[i][0]-walkerPoints[j][0],walkerPoints[i][1]-walkerPoints[j][1])>1,'walking wounded hold distinct queue positions');
const lostBearerLitter=rescueColumn.litters[4];lostBearerLitter.bearers[0]=0;
rescueColumn.Update(.1);
const helper=rescueColumn.walkers.find(w=>w.rescueTarget?.litter===lostBearerLitter.id);
assert.ok(helper&&lostBearerLitter.bearers[0]===0,'requesting a helper does not instantly replace a casualty');
let approachTravel=0;
for(let i=0;i<3000&&!helper.assigned;i++){
  const before={x:helper.x,z:helper.z};rescueColumn.Update(.1);
  const step=Math.hypot(helper.x-before.x,helper.z-before.z);approachTravel+=step;
  assert.ok(step<=R.bearerApproachMps*.1+R.bearerReachM+R.litterSpeedMps*.1+.001,'helper walks every metre to the actual handle');
}
assert.ok(helper.assigned===lostBearerLitter.id&&approachTravel>3,'the same medical worker takes the vacant handle');
rescueColumn.StartRetreat();for(let i=0;i<7000;i++)rescueColumn.Update(.1);
assert.ok(Math.hypot(helper.x-lostBearerLitter.x,helper.z-lostBearerLitter.z)<1.7,'assigned helper travels with the same litter');
rescueColumn.StartReception();for(let i=0;i<4000;i++)rescueColumn.Update(.1);
rescueColumn.StartFinalExit();for(let i=0;i<4000;i++)rescueColumn.Update(.1);
assert.ok(helper.escaped&&lostBearerLitter.escaped,'medical identity completes the physical rear exit with its patient');
console.log('ok separate queues, physical medical approach and continuous bearer identity');
const lateRecovery=new FirstLevelMissionColumn();lateRecovery.Restore(saved);
lateRecovery.StartRetreat();for(let i=0;i<6000;i++)lateRecovery.Update(.1);
lateRecovery.StartReception();lateRecovery.Update(.1);
for(const mode of ['reception','exit']) {
  if(mode==='exit')lateRecovery.StartFinalExit();
  const patient=lateRecovery.litters.find(l=>!l.loaded&&!l.zhou&&l.health>0&&!(mode==='reception'?l.received:l.escaped));
  assert.ok(patient,'a surviving patient still travels in '+mode);
  const before={x:patient.x,z:patient.z};patient.bearers[0]=0;
  lateRecovery.Update(.1);
  assert.equal(Math.hypot(patient.x-before.x,patient.z-before.z),0,'a litter cannot travel without its bearer in '+mode);
  const substitute=lateRecovery.walkers.find(w=>w.rescueTarget?.litter===patient.id);
  assert.ok(substitute,'an available medical worker responds in '+mode);
  for(let i=0;i<5000&&patient.bearers[0]<=0;i++)lateRecovery.Update(.1);
  assert.ok(patient.bearers[0]>0&&substitute.assigned===patient.id,'actual replacement resumes '+mode);
  for(let i=0;i<6000;i++)lateRecovery.Update(.1);
  assert.ok(mode==='reception'?patient.received:patient.escaped,'the same patient finishes '+mode);
}
console.log('ok bearer casualties recover during reception and the final exit');
const localThreatColumn=new FirstLevelMissionColumn();localThreatColumn.Restore(saved);
localThreatColumn.StartRetreat();for(let i=0;i<6000;i++)localThreatColumn.Update(.1);
localThreatColumn.StartReception();for(let i=0;i<6000;i++)localThreatColumn.Update(.1);
localThreatColumn.StartFinalExit();
const departingPatients=localThreatColumn.litters.filter(l=>!l.zhou&&!l.loaded&&l.health>0);
localThreatColumn.Update(.2,{routeSafe:false,SafeAt:entry=>entry.id!==departingPatients[0].id});
assert.equal(departingPatients[0].exitProgress,0,'a patient in a threatened lane holds');
assert.ok(departingPatients[1].exitProgress>0,'sheltered patients still advance while another lane is threatened');
console.log('ok final evacuation responds to local threats without freezing the whole ward');
const casualtyColumn = new FirstLevelMissionColumn();
casualtyColumn.litters[0].health = 0;
casualtyColumn.litters[1].health = 12;
casualtyColumn.AirDamage();
assert.equal(casualtyColumn.litters[0].health, 0, "An air-raid event never revives a previous casualty");
assert.equal(casualtyColumn.litters[1].health, 12, "An air-raid event never heals an injured patient");
assert.equal(new Set(MISSION_DIALOGUE.map((cue) => cue.id)).size, MISSION_DIALOGUE.length);
for (const cue of MISSION_DIALOGUE) {
  assert.ok(MissionVoicePrompt(cue).includes(cue.lines[0].text));
  assert.ok(cue.lines.every((line) => MissionVoicePrompt(cue).includes(line.text)));
}
if (process.argv.includes("--audio")) {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json", import.meta.url), "utf8"),
  );
  for (const cue of MISSION_DIALOGUE) {
    const entry = manifest.cues[cue.id];
    const aligned=MISSION_VOICE_ALIGNMENT[cue.id];
    assert.equal(aligned.sha256,entry.sha256,cue.id+' timing is bound to this recording');
    assert.equal(aligned.lines.length,cue.lines.length);
    aligned.lines.forEach(([start,end],i)=>{
      assert.ok(start>=0 && end>=start && end<=entry.seconds+.02,cue.id+' source interval');
      if(start===end)assert.ok(aligned.note,'ambiguous interval must be explained');
      if(i)assert.ok(start>=aligned.lines[i-1][1],cue.id+' subtitles do not overlap');
    });
    assert.ok(entry?.continuous && entry.requests === 1 && entry.seconds > 0.5, cue.id);
    const bytes=fs.readFileSync(new URL('./Audio/FirstLevel/'+cue.file,import.meta.url));
    assert.equal(bytes.length,entry.bytes,cue.id+' bytes');
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,cue.id+' content hash');
    assert.equal(crypto.createHash('sha256').update(MissionVoicePrompt(cue)).digest('hex'),entry.promptHash,cue.id+' current complete script');
    if(cue.id==='ZhouDeath')assert.ok(entry.seconds>=8 && entry.seconds<=12.1,'whole death exchange fits the authored short scene');
  }
}
console.log(process.argv.includes("--audio")
  ? "ok all 41 continuous audio assets, current script/file hashes and short death-scene duration"
  : "ok continuous dialogue prompts; audio assets require --audio acceptance");
// Source-range playback preserves pauses, queued cues and physical event gates.
{
  const offsets=[], done=[];
  const voice=new FirstLevelMissionVoice({
    audio:{PlayStoryVoice:(_key,options)=>{offsets.push(options.offset||0);return {duration:1};},StopStoryVoice(){}},
    hud:{Say(){}},Done:id=>done.push(id),
  });
  voice.manifest={cues:{ThreeMagazines:{seconds:3.109},TwoMagazines:{seconds:2.429}}};
  voice.Enqueue("ThreeMagazines");voice.Enqueue("TwoMagazines");
  voice.Update(0);voice.Update(.3);voice.Pause();voice.Update(10);
  assert.equal(voice.current.time,.3);
  voice.Resume();
  for(let i=0;i<400;i++)voice.Update(1/60);
  assert.deepEqual(done,["ThreeMagazines","TwoMagazines"]);
  assert.deepEqual(offsets,[0,.3,0]);
}
{
  const events=[], sources=[], subtitles=[], done=[], facts=new Set();
  const voice=new FirstLevelMissionVoice({
    audio:{PlayStoryVoice:(key,options)=>{sources.push({key,...options});return {duration:22.544};},StopStoryVoice(){}},
    hud:{Say:(_who,text)=>subtitles.push(text)},Done:id=>done.push(id),
    Event:id=>events.push(id),Ready:id=>facts.has(id),
  });
  voice.Enqueue("TrainShelling");
  for(let i=0;i<900;i++)voice.Update(1/60);
  assert.deepEqual(events,[]);
  assert.equal(voice.State().segment,"FirstShellWarning");
  assert.equal(voice.State().playbackPhase,"waiting","the shout cannot anticipate the first shell impact");
  assert.equal(sources.length,0,"no arrival speech precedes the actual surprise impact");
  facts.add("trainFirstShellImpact");
  for(let i=0;i<360;i++)voice.Update(1/60);
  assert.deepEqual(events,["TrainNearShell"]);
  assert.equal(voice.State().segment,"DerailImpact");
  assert.ok(!subtitles.some(text=>text.includes("手遭打中了")),"injury speech waits for actual impact");
  facts.add("trainNearShellImpact");
  for(let i=0;i<360;i++)voice.Update(1/60);
  assert.ok(events.includes("TrainProneOrder"));
  voice.Pause();const paused=voice.State();
  voice.Update(40);assert.deepEqual(voice.State(),paused);
  voice.Resume();
  for(let i=0;i<1800;i++)voice.Update(1/60);
  assert.equal(voice.State().segment,"LuoRescue");
  assert.equal(voice.State().playbackPhase,"waiting");
  assert.ok(!subtitles.some(text=>text.includes("抓到我")),"unload command waits for physical emergency braking");
  facts.add("trainStopped");
  for(let i=0;i<1200;i++)voice.Update(1/60);
  assert.ok(events.includes("TrainRescue"));
  assert.equal(voice.State().segment,"GroundFire");
  assert.ok(!done.length,"orders cannot rush ahead of Luo releasing the player");
  facts.add("luoRescueComplete");
  for(let i=0;i<1800;i++)voice.Update(1/60);
  assert.deepEqual(done,["TrainShelling"]);
  assert.ok(sources.every(source=>source.maxDuration>0&&source.offset>=0));
  assert.equal(events.filter(id=>id==="TrainNearShell").length,1,"resume never re-fires a shell");
}
console.log("ok paused audio ranges, subtitle source timing, queued cues and shell-impact gates");

// Regression: 40 real recruit bodies plus Luo, stable carriage-local positions, all three doors.
for(const preparedAnimation of [false,true]) {
  const dt = 1/60, actors = [];
  const Make = () => { const a = { id: actors.length, alive: true, position: {x:0,y:1.17,z:0}, goal:{x:0,z:0} }; actors.push(a); return a; };
  const originals = Array.from({length:6}, Make), guide = Make();
  let offset = R.trainTravelM, player = {...MISSION_TRAIN.player,z:MISSION_TRAIN.player.z+offset};
  const train = new FirstLevelMissionTrain({ Originals:()=>originals, Guide:()=>guide, Spawn:Make,
    Offset:()=>offset, Place:(a,p)=>Object.assign(a.position,p), Hold:a=>Object.assign(a.goal,a.position),
    Move:(a,p,speed)=>{assert.equal(a.missionTrainLife.weight,0,"passengers stand before physical walking");const d=Math.hypot(p.x-a.position.x,p.z-a.position.z);if(d>MISSION_TRAIN.arrivalRadiusM){const step=Math.min(speed*dt,d)/d;a.position.x+=(p.x-a.position.x)*step;a.position.z+=(p.z-a.position.z)*step;}},
    Player:()=>player, Exited:()=>{},
    // Deliberately simple animation fixture: the production sampler is checked
    // independently in FirstLevelTrainAnimationTest. Here its measured anchor
    // must fit the same 41-body queue without changing its movement authority.
    PrepareAnimation:preparedAnimation?a=>({duration:5,config:{riseStaggerSeconds:.35},
      SeatOffset:()=>({x:.002,z:-(a.id%4===2?.28:.24)-.35*(.96+(a.id%9)*.01)}),
      State:t=>({weight:t<5?1:0,gestureWeight:0})}):undefined,
  });
  train.Initialize(); train.Initialize();
  assert.equal(actors.length,41);assert.deepEqual(train.State().counts,[12,16,12]);
  assert.equal(actors.filter(a=>a.missionTrainLife.seated).length,39);
  const local=actors.map(a=>({x:a.position.x,z:a.position.z-offset}));
  for(let i=0;i<120;i++){offset-=R.trainTravelM/120;train.Translate(-R.trainTravelM/120);train.Update(dt,false);}
  for(const [i,a] of actors.entries()) {assert.ok(Math.abs(a.position.z-offset-local[i].z)<1e-8);assert.equal(a.position.x,local[i].x);assert.ok(a.p012OnMovingTrain);}
  player={x:-71,z:110};
  let ticks=0;
  for(;ticks<180/dt;ticks++) {
    train.Update(dt,true);
    for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)assert.ok(Math.hypot(actors[i].position.x-actors[j].position.x,actors[i].position.z-actors[j].position.z)>=.899,'train queue bodies do not overlap');
    if(train.entries.every(e=>e.arrived))break;
  }
  assert.equal(train.State().exited,40,JSON.stringify(train.State()));
  assert.ok(train.entries.every(e=>e.arrived),'all passengers physically reach their own muster point: '+JSON.stringify(train.State().entries.filter(e=>!e.arrived)));
  assert.ok(actors.every(a=>!a.p012OnMovingTrain&&a.missionUnloaded));
  console.log('ok train 12/16/12, Luo separate, '+(preparedAnimation?'prepared standing anchors':'fallback seats')+', unchanged local positions while moving, all physical exits in '+(ticks*dt).toFixed(1)+'s');
}

{
 const calls=[], sound=new FirstLevelMissionBattleSound({Play:(cue,options)=>{calls.push({cue,...options});return null;}});
 // 【2026-09-09 这一条改了口径】原来断言的是「车厢里一声前线都不许有」。
 // 实测下来那正是用户报的问题：整整一分钟的车厢里只有三句对白，然后第一发
 // 凭空炸在车边上。现在的口径是**由远及近**，闸门有三道，一道都不能松：
 //   1. 头 24 秒仍然一声不许有（车厢自己的动静与那顿饭的对话独占）；
 //   2. 之后只许是**闷的**（airCut ≤ 340 Hz —— 隔着木板与铁皮）；
 //   3. 头一段必须比后一段轻（军列在往前线开，不是前线在靠近）。
 for(let i=0;i<48;i++)sound.Update(.5,"Train");
 assert.equal(calls.length,0,"the carriage stays clear of front sound for the first 24s");
 for(let i=0;i<40;i++)sound.Update(.5,"Train");
 const early=calls.slice();
 assert.ok(early.length>0,"the front creeps in through the carriage wall before the shelling");
 assert.ok(early.every(c=>c.airCut<=340&&c.soundField&&c.bus==="ambience"),
   "everything heard from inside the carriage is muffled: "+JSON.stringify(early[0]));
 for(let i=0;i<40;i++)sound.Update(.5,"Train");
 const late=calls.slice(early.length), Loudest=(rows,cue)=>Math.max(0,...rows.filter(c=>c.cue===cue).map(c=>c.volume));
 assert.ok(Loudest(late,"amb.cannonFar")>Loudest(early,"amb.cannonFar"),
   "the front grows as the train rolls north: "+JSON.stringify({early:Loudest(early,"amb.cannonFar"),late:Loudest(late,"amb.cannonFar")}));
 calls.length=0;
 for(let i=0;i<120;i++)sound.Update(.5,"Support");
 assert.ok(calls.some(c=>c.cue==="amb.cannonFar")&&calls.some(c=>c.cue==="type92")&&calls.some(c=>c.cue==="rifleNraFar"));
 assert.ok(calls.every(c=>c.position.z< -190&&c.soundField&&c.bus==="ambience"));
 const north=sound.sources.find(s=>s.spec.id==="NorthArtillery");
 assert.ok(north.count>=5,"sustained cannon pressure throughout the support trench");
 const supportVolume=calls.find(c=>c.cue==="rifleNraFar").volume, count=calls.length;
 for(let i=0;i<120;i++)sound.Update(.5,"South",true);
 const south=calls.slice(count);
 assert.ok(south.length>8&&south.find(c=>c.cue==="rifleNraFar").volume<supportVolume);
 const frozen=sound.State();sound.Update(10,"Complete");
 assert.deepEqual(sound.State(),frozen);
 console.log("ok directional sustained front combat, quieter south and no train/end leakage");
}
{
 let clock=10;const events=[],subtitles=[];
 const voice=new FirstLevelMissionVoice({audio:{PlayStoryVoice:()=>({voice:{t:clock+.005}}),StopStoryVoice(){}},
   hud:{Say:(_who,text)=>subtitles.push(text)},Clock:()=>clock,Event:id=>events.push(id)});
 voice.Enqueue("AircraftReturn");voice.Update(0);
 voice.Update(30);assert.equal(voice.State().sourceTime,0,"gameplay stepping cannot outrun a live audio clock");
 clock+=4.4;voice.Update(.01);assert.deepEqual(events,[]);
 clock+=.3;voice.Update(.01);assert.deepEqual(events,["AircraftDiveOrder"]);
 voice.Pause();clock+=20;voice.Update(20);voice.Resume();clock+=.2;voice.Update(.01);
 assert.equal(events.length,1,"resuming the source never repeats the physical dive");
 console.log("ok real audio clock governs subtitles and second-aircraft dive order");
}

{
  const Actor=(x,z)=>({alive:true,position:{x,y:0,z},stance:0,suppression:0});
  const nearby=Actor(1,-12),behindWall=Actor(.1,-24),occluded=Actor(-1,-12),far=Actor(5,-12);
  const near=new Map();
  CollectBulletNearMisses({x:0,y:1.05,z:0},{x:0,y:0,z:-1},18,[nearby,behindWall,occluded,far],near);
  ApplyBulletNearMisses(near,(point,body)=>body.x<0);
  assert.ok(nearby.suppression>0,"real near miss suppresses adjacent enemy");
  assert.equal(behindWall.suppression,0,"stopped bullet cannot suppress beyond solid");
  assert.equal(occluded.suppression,0,"cover between path and body blocks suppression");
  assert.equal(far.suppression,0,"distant scenery fire cannot affect gameplay");
}

{
 const actor={x:0,z:0},target={x:0,z:-60};
 assert.equal(MissionGuideSpeed(actor,{x:0,z:40},target),0,"leader waits for a trailing player");
 assert.equal(MissionGuideSpeed(actor,{x:0,z:-40},target),R.squadCatchupMps,"only a trailing guide accelerates");
 assert.equal(MissionGuideSpeed(actor,{x:0,z:5},target),R.squadSpeedMps,"nearby guide keeps walking pace");
 assert.equal(MissionGuideSpeed(actor,{x:0,z:-40},target,true),0,"spacing still takes priority");
 assert.equal(MissionGuideSpeed({x:0,z:-124},{x:48,z:-20},{x:-1,z:-123},false,[{x:-8,z:-112},{x:-24,z:-60},{x:-24,z:-18},{x:0,z:0},{x:48,z:-20}]),R.squadCatchupMps,"a squad behind a route bend catches up instead of waiting forever");
 const pending=[{x:25,z:-110},{x:15,z:-111},{x:6,z:-124},{x:-8,z:-112},A.orders];
 const south=MissionGuideRoute({x:27,z:-113},pending,MISSION_ROUTES.south);
 assert.deepEqual(south.slice(0,4),pending.slice(0,4),"a delayed companion returns through the bundle trench before heading south");
 const village=MissionGuideRoute({x:-8,z:-78},south,MISSION_ROUTES.village);
 assert.deepEqual(village.slice(0,south.length),south,"village orders preserve the unfinished southbound path");
 assert.deepEqual(MissionGuideRoute({x:16,z:-124},pending,MISSION_ROUTES.bundle,MISSION_ROUTES.bundle,true),MISSION_ROUTES.bundle,"explicit entry starts at the cleared central junction");
}

{
  const routes=R.squadRouteLanesM.map((_,slot)=>MissionSquadRoute(MISSION_ROUTES.support,slot));
  assert.ok(routes.every(route=>route.length>MISSION_ROUTES.support.length*3));
  for(const route of routes){
    assert.deepEqual(route.at(-1),MISSION_ROUTES.support.at(-1),"firing-post approach retains the final authored point");
    for(const p of route) {
      assert.ok(Number.isFinite(terrain.SampleHeight(p.x,p.z)));
      for(const box of MISSION_LAYOUT.blocks){
        if(MISSION_LAYOUT.walkableSurfaces.some(surface=>surface.id===box.id))continue;
        const y=terrain.SampleHeight(p.x,p.z),dx=p.x-box.x,dz=p.z-box.z;
        const c=Math.cos(box.ry||0),s=Math.sin(box.ry||0),localX=dx*c-dz*s,localZ=dx*s+dz*c;
        assert.ok(!(Math.abs(localX)<box.w/2+.4&&Math.abs(localZ)<box.d/2+.4&&box.y+box.h/2>y+.3&&box.y-box.h/2<y+1.7),"personal squad route clears rotated geometry "+box.id);
      }
    }
  }
  assert.ok(Math.hypot(routes[0][10].x-routes[1][10].x,routes[0][10].z-routes[1][10].z)>.9,"soldiers occupy distinct lanes instead of one exact line");
  const sample={speed:3,slot:0,yaw:0,target:{x:0,z:-10},position:{x:0,z:0},gap:Infinity,previous:2,dt:.1};
  assert.ok(MissionSquadPace({...sample,yaw:Math.PI/2})<MissionSquadPace(sample),"turning slows actual travel");
  assert.equal(MissionSquadPace({...sample,gap:1}),0,"personal space wins over catching up");
  assert.equal(MissionSquadPace({...sample,speed:0}),0,"leader waiting cannot leak residual movement");
  assert.notEqual(MissionSquadPace({...sample,slot:1}),MissionSquadPace({...sample,slot:2}),"individual stride cadence");
}
console.log("ok individual trench lanes, rounded corners, safe spacing and variable march pace");

{
 let clock=0;const events=[];
 const voice=new FirstLevelMissionVoice({audio:{StopStoryVoice(){},PlayStoryVoice(){return {voice:{t:clock}};}},hud:{Say(){}},Clock:()=>clock,Event:id=>events.push(id)});
 voice.Enqueue("TrainMeal");voice.Update(5);voice.Update(90);
 assert.equal(events.length,0,"simulation time cannot finish the receiving gesture ahead of audio");
 const handoffAt=MISSION_VOICE_ALIGNMENT.TrainMeal.lines[1][1];
 clock=handoffAt-.05;voice.Update(.1);voice.Pause();clock=90;voice.Update(60);
 assert.equal(events.length,0,"pause cannot release the handoff");
 voice.Resume();clock=90.11;voice.Update(.01);
 assert.deepEqual(events,["TrainFoodReceived"],"Shunzi's completed reply releases the handoff at its source timestamp");
 clock=91;voice.Update(1);assert.equal(events.length,1);
}
console.log("ok receiving-food release follows the source clock and survives pause/resume");

{
  assert.equal(MISSION_ENCOUNTERS.front.length+MISSION_ENCOUNTERS.surface.length+MISSION_ENCOUNTERS.intrusion.length+MISSION_ENCOUNTERS.tank.length,32,
    "32 finite opening/front enemies; no replacement waves");
  assert.equal(new Set(Object.values(MISSION_ENCOUNTERS).flat().map(spec=>spec.id)).size,Object.values(MISSION_ENCOUNTERS).flat().length);
  assert.equal(MISSION_ENCOUNTERS.surface.length,6,"two surface sections provide actual enemy fire");
  assert.ok(MISSION_STAGES.find(s=>s.id==="Support").requirements.includes("frontRifleDefense"));
  assert.ok(FIRST_LEVEL_MISSION_PHASE.whitebox.actorCapacity>=R.openingEnemyBudget+40,"small graphics scale leaves capacity for real friendlies and dormant village");
  for(const point of FRONT_BREACHES){
    const h=SampleMissionTerrain(point.x,point.z);
    assert.ok(h> -2 && h<-.8,"the breached sap remains a walkable excavated passage below surface fire: "+h);
  }
  const corner=[{x:0,z:0},{x:0,z:5},{x:5,z:5}],step=1.4/60;
  let before=MissionCarryRoutePoint(corner,3);
  for(let d=3+step;d<7;d+=step){
    const at=MissionCarryRoutePoint(corner,d);
    assert.ok(Math.hypot(at.x-before.x,at.z-before.z)<=step+.00001,"corner never teleports the litter");
    const turn=Math.atan2(Math.sin(at.yaw-before.yaw),Math.cos(at.yaw-before.yaw));
    assert.ok(Math.abs(turn)<.09,"litter heading turns gradually");
    before=at;
  }
  assert.deepEqual(MissionCarryRoutePoint(corner,10),{x:5,z:5,yaw:-Math.PI/2},"arrival position and hidden passage distance stay stable");
}

{
 const cue=MISSION_DIALOGUE.find(c=>c.id==='TrainMeal');
 const entry=JSON.parse(fs.readFileSync(new URL('./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json',import.meta.url))).cues.TrainMeal;
 const sources=[],subtitles=[],done=[];
 const voice=new FirstLevelMissionVoice({audio:{StopStoryVoice(){},PlayStoryVoice:(_key,options)=>{sources.push(options);return {}; }},
   hud:{Say:(_who,text)=>subtitles.push(text)},Done:id=>done.push(id)});
 voice.manifest={cues:{TrainMeal:entry}};
 voice.Enqueue('TrainMeal');
 for(let t=0;t<entry.seconds+12;t+=1/60)voice.Update(1/60);
 assert.equal(sources.length,1,'the carriage ensemble has no artificial playback breaks');
 assert.equal(sources[0].offset,0);
 assert.equal(sources[0].maxDuration,entry.seconds,'the complete recording plays through its final reply');
 assert.deepEqual(subtitles,cue.lines.map(line=>line.text),'every passenger reply appears once, in order');
 assert.deepEqual(done,['TrainMeal']);
 const plan=MissionVoiceTimeline(cue,entry.seconds);
 const impactAt=plan.segments.reduce((t,s)=>t+s.end-s.start+(s.wait||0),plan.tail)+R.trainFirstShellFlightS;
 const before=MissionTrainMotion(impactAt),after=MissionTrainMotion(impactAt+.1);
 assert.ok(before.offsetM>0 && Math.abs(before.offsetM-after.offsetM-R.trainCruiseSpeedMps*.1)<1e-6,
   'the train still moves when the first shell arrives after the longer exchange');
}
