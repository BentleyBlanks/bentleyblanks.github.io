import { FRONT_BREACHES } from "./Data_FirstLevelMissionFront.mjs";
import { CollectBulletNearMisses,ApplyBulletNearMisses } from "./Script_BallisticSuppression.mjs";
import { MISSION_VOICE_ALIGNMENT } from "./Data_FirstLevelMissionVoiceAlignment.mjs";
import { FirstLevelMissionBattleSound } from "./Script_FirstLevelMissionBattleSound.mjs";
import { MISSION_TRAIN, MissionTrainMotion } from "./Data_FirstLevelMissionTrain.mjs";
import { FirstLevelMissionTrain } from "./Script_FirstLevelMissionTrain.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { FirstLevelMissionFlow } from "./Script_FirstLevelMissionFlow.mjs";
import { FirstLevelMissionColumn, MissionCarryRoutePoint, MissionGuideSpeed, MissionSquadRoute, MissionSquadPace } from "./Script_FirstLevelMissionColumn.mjs";
import { MISSION_STAGES, MISSION_TUNING as R, FIRST_LEVEL_MISSION_PHASE, MISSION_TACTICS, MISSION_ENCOUNTERS } from "./Data_FirstLevelMission.mjs";
import { MISSION_LAYOUT, MISSION_ROUTES, MISSION_ANCHORS as A, MISSION_PLACEMENT as P } from "./Data_FirstLevelMissionLayout.mjs";
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
import { CreateP012Terrain } from "./Data_FirstLevelP012Terrain.mjs";
import { MISSION_DIALOGUE, MissionVoicePrompt } from "./Data_FirstLevelMissionDialogue.mjs";
import { FirstLevelMissionVoice } from "./Script_FirstLevelMissionVoice.mjs";
{
  for (const time of [0,10,30,55]) {
    const a=MissionTrainMotion(time),b=MissionTrainMotion(time+.1);
    assert.ok(Math.abs((a.offsetM-b.offsetM)/.1-6)<1e-6,"train keeps real cruise speed before shell impact");
  }
  for (const impactAt of [56,57.5,60]) {
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
const reliefRoutes=Object.fromEntries(P.reliefPositions.map((point,i)=>["Relief"+i,[MISSION_TRAIN.cars[2].muster[i],...P.reliefApproach,{x:point.x,z:-123},point]]));
for (const [name, route] of Object.entries({ ...MISSION_ROUTES, ...tacticalRoutes, ...reliefRoutes, ...Object.fromEntries(P.guardWithdrawalRoutes.map((route,i)=>["Guard"+i,route])) })) {
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
for(const id of ["FrontTraverseBlastScreen","BundleParapet","FlankParapet","MachineGunSideCover-1","MachineGunSideCover1"]){
  const wall=MISSION_LAYOUT.blocks.find(b=>b.id===id);assert.ok(wall,"hand-built cover survives generic route cleanup: "+id);
  for(const x of [-1,0,1])for(const z of [-1,0,1])assert.ok(wall.y-wall.h/2<=SampleMissionTerrain(wall.x+x*wall.w/2,wall.z+z*wall.d/2),"cover foundations follow the trench slope");
}
console.log("ok authored capsule routes clear walls, crates and gun supports");
// Each waiting team occupies an authored work area, with clear paths for both bearer ends.
import {MISSION_CROWD_AREAS as areas} from './Data_FirstLevelMissionCrowd.mjs';import {MISSION_LAYOUT as crowdLayout} from './Data_FirstLevelMissionLayout.mjs';import {SampleMissionTerrain as crowdGround} from './Data_FirstLevelMissionTerrain.mjs';import {MissionCarryRoutePoint as crowdPoint,MissionRouteLength as crowdLength} from './Script_FirstLevelMissionColumn.mjs';
const bad=[];for(const a of areas)for(const [kind,points] of [['litter',a.pockets],['walker',a.walkerPockets]])for(const [i,p] of points.entries()){const routes=[[a.trigger,{x:a.trigger.x,z:a.entryZ},{x:p.x,z:a.entryZ},p],[p,{x:p.x,z:a.exitZ},a.merge]];for(const route of routes)for(let d=0;d<crowdLength(route);d+=.3){const c=crowdPoint(route,d);for(const offset of kind==='litter'?[-1.28,0,1.28]:[0]){const x=c.x-Math.sin(c.yaw)*offset,z=c.z-Math.cos(c.yaw)*offset,y=crowdGround(x,z);for(const b of crowdLayout.blocks){if(b.solid===false||crowdLayout.walkableSurfaces.some(s=>s.id===b.id))continue;const dx=x-b.x,dz=z-b.z,co=Math.cos(b.ry||0),si=Math.sin(b.ry||0);if(Math.abs(dx*co-dz*si)<b.w/2+.32&&Math.abs(dx*si+dz*co)<b.d/2+.32&&b.y+b.h/2>y+.3&&b.y-b.h/2<y+1.7)bad.push({area:a.id,kind,i,box:b.id,x,z});}}}}
assert.deepEqual(bad,[],"all staging routes clear real walls and furniture, including both bearers");
assert.ok(areas.every(a=>a.walkerPockets.length===R.walkingWoundedCount+R.medicCount+R.civilianCount));
const c = new FirstLevelMissionColumn();
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
assert.ok(waitingTravel.filter(d=>d>.15).length>=5,"waiting wounded and medics make staggered short steps");
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
assert.equal(c.vehicles[2].load.length, 3);
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
  "ok 20 litters, closed gate, physical load queue, 2 departing carts, interrupted transfer, three passages, reception and actual rear exit",
);
// Survivor counts change the number of useful loads; missing people cannot fill a cart.
for (const lost of [1, 6, 7, 10, 11]) {
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
  assert.deepEqual(events,["TrainNearShell","TrainProneOrder"]);
  assert.equal(voice.State().segment,"WoundedSoldier");
  assert.ok(!subtitles.some(text=>text.includes("手遭打中了")),"injury speech waits for actual impact");
  facts.add("trainSoldierWounded");
  for(let i=0;i<360;i++)voice.Update(1/60);
  assert.ok(events.includes("TrainProneOrder"));
  voice.Pause();const paused=voice.State();
  voice.Update(40);assert.deepEqual(voice.State(),paused);
  voice.Resume();
  for(let i=0;i<1800;i++)voice.Update(1/60);
  assert.equal(voice.State().segment,"EmergencyUnload");
  assert.equal(voice.State().playbackPhase,"waiting");
  assert.ok(!subtitles.some(text=>text.includes("停稳了")),"unload command waits for physical emergency braking");
  facts.add("trainStopped");
  for(let i=0;i<360;i++)voice.Update(1/60);
  assert.deepEqual(done,["TrainShelling"]);
  assert.ok(sources.every(source=>source.maxDuration>0&&source.offset>=0));
  assert.equal(events.filter(id=>id==="TrainNearShell").length,1,"resume never re-fires a shell");
}
console.log("ok paused audio ranges, subtitle source timing, queued cues and shell-impact gates");

// Regression: 40 real recruit bodies plus Luo, stable carriage-local positions, all three doors.
{
  const dt = 1/60, actors = [];
  const Make = () => { const a = { id: actors.length, alive: true, position: {x:0,y:1.17,z:0}, goal:{x:0,z:0} }; actors.push(a); return a; };
  const originals = Array.from({length:6}, Make), guide = Make();
  let offset = R.trainTravelM, player = {...MISSION_TRAIN.player,z:MISSION_TRAIN.player.z+offset};
  const train = new FirstLevelMissionTrain({ Originals:()=>originals, Guide:()=>guide, Spawn:Make,
    Offset:()=>offset, Place:(a,p)=>Object.assign(a.position,p), Hold:a=>Object.assign(a.goal,a.position),
    Move:(a,p,speed)=>{assert.equal(a.missionTrainLife.weight,0,"passengers stand before physical walking");const d=Math.hypot(p.x-a.position.x,p.z-a.position.z);if(d>MISSION_TRAIN.arrivalRadiusM){const step=Math.min(speed*dt,d)/d;a.position.x+=(p.x-a.position.x)*step;a.position.z+=(p.z-a.position.z)*step;}},
    Player:()=>player, Exited:()=>{},
  });
  train.Initialize(); train.Initialize();
  assert.equal(actors.length,41);assert.deepEqual(train.State().counts,[8,24,8]);
  assert.equal(actors.filter(a=>a.missionTrainLife.seated).length,32);
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
  console.log('ok train 8/24/8, Luo separate, unchanged local positions while moving, all physical exits in '+(ticks*dt).toFixed(1)+'s');
}

{
 const calls=[], sound=new FirstLevelMissionBattleSound({Play:(cue,options)=>{calls.push({cue,...options});return null;}});
 for(let i=0;i<120;i++)sound.Update(.5,"Train");
 assert.equal(calls.length,0,"the carriage stays clear of premature front sound");
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
 clock=5.3;voice.Update(.1);voice.Pause();clock=90;voice.Update(60);
 assert.equal(events.length,0,"pause cannot release the handoff");
 voice.Resume();clock=90.11;voice.Update(.01);
 assert.deepEqual(events,["TrainFoodReceived"],"Shunzi's completed reply releases the handoff at its source timestamp");
 clock=91;voice.Update(1);assert.equal(events.length,1);
}
console.log("ok receiving-food release follows the source clock and survives pause/resume");

{
  assert.equal(MISSION_ENCOUNTERS.front.length,30,"first contact has three authored sections plus the original line");
  assert.equal(MISSION_ENCOUNTERS.approach.length,6,"two approach positions provide actual enemy fire");
  assert.ok(MISSION_STAGES.find(s=>s.id==="Support").requirements.includes("frontRifleDefense"));
  assert.ok(FIRST_LEVEL_MISSION_PHASE.whitebox.actorCapacity>=130,"small graphics scale cannot cut the mission manifest");
  for(const point of FRONT_BREACHES){
    const h=SampleMissionTerrain(point.x,point.z);
    assert.ok(h>-.8 && h<-.35,"broken trench lips remain shallow walkable soil: "+h);
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
