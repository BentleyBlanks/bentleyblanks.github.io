import assert from 'node:assert/strict';
import {MISSION_STAGES as Steps,MISSION_ENCOUNTERS as Enemies} from './Data_FirstLevelMission.mjs';
import {FIRST_LEVEL_STAGES as Phases} from './Data_FirstLevelMissionStages.mjs';
import {MISSION_ANCHORS as A,MISSION_ROUTES as Routes,MISSION_LAYOUT as Layout} from './Data_FirstLevelMissionLayout.mjs';
import {MISSION_RECEPTION_SPACE as Reception,MISSION_REARGUARD_POCKETS as Pockets} from './Data_FirstLevelMissionTopology.mjs';
import {MISSION_RETURN_ROUTES} from './Data_FirstLevelMissionReturn.mjs';
import {FirstLevelMissionFlow} from './Script_FirstLevelMissionFlow.mjs';
import {MissionRouteLength,MissionRouteProjection,MissionRouteNextIndex} from './Script_FirstLevelMissionColumn.mjs';
import {SampleMissionTerrain} from './Data_FirstLevelMissionTerrain.mjs';
// Notion rear stages plus the user's later September 14 front-sortie revision.
const expected=[
 ['trainShelling'],
 ['trainStopped','trainDerailed','luoRescueComplete','unloadOrdersHeard','unloaded'],
 ['trenchEntered','trenchCleared','shelterReached','escapeWhisperHeard','woundedSeen','supportOrdersHeard','frontReached','frontContact','frontRifleDefense','rifleWithdrawalResolved','zhouGunWounded'],
 ['frontAttackRepelled','guardWithdrawalResolved'],['bundleRouteTraversed','bundleTaken','tankImmobilized'],['ordersReached','volunteerHeard','zhouOnLitter'],
 ['southTransitionComplete','southTraversed'],['innerCourtReached'],['meleeResolved'],['villageGunSilent','courtyardGateOpen','courtyardPassed'],
 ['transferApproachReached','transferHopeHeard'],['transferArrived','vehiclesDeparted','transferAttacksResolved','zhouNext','followVehicleHeard'],
 ['firstAirPassComplete','firstAirOrdersHeard','zhouCarried','atDitchMouth','carryOrdersHeard'],
 ['diveComplete','zhouRecovered','rescuePassageClear'],['retreatFirstPassed','retreatWallPassed','retreatYardPassed'],
 ['receptionPassed','zhouPlaced'],['deathSceneComplete'],['rearLaneClear','medicsEscaped','playerAtHandoff','finalExitHeard'],
];
assert.equal(Phases.length,18);
assert.ok(!Steps.find(step=>step.id==='Tank').requirements.includes('bundleDirectionsHeard'),
 'the September 14 revision allows taking the bundle without waiting for the supply speech');
for(const [i,phase] of Phases.entries()){
 const steps=phase.steps.map(id=>Steps.find(step=>step.id===id));
 assert.deepEqual(steps.flatMap(step=>step.requirements),expected[i],`Notion phase ${i+1}`);
 for(const step of steps)for(const missing of step.requirements){
  const flow=new FirstLevelMissionFlow();flow.index=Steps.indexOf(step);flow.started=true;
  for(const fact of step.requirements)if(fact!==missing)flow.Record(fact);
  flow.Update(10000);assert.equal(flow.stage.id,step.id,`${step.id} cannot skip ${missing}`);
 }
}
for(const [id,seconds] of [['TransferApproach',45],['Transfer',150]])
 assert.equal(Steps.find(step=>step.id===id).minimumSeconds,seconds);
const Distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
assert.ok(Distance(A.gun,A.throw)<45,'gun and tank are one front');
assert.ok(Distance(A.village,A.melee)<35&&Distance(A.melee,A.gate)<35,'village, kitchen and court are adjacent');
assert.deepEqual(Steps.find(s=>s.id==='AirFirst').target,Steps.find(s=>s.id==='Transfer').target);
assert.ok(A.ditchMouth.x<A.queue.x&&Distance(A.queue,A.ditchMouth)<35,'carry west inside transfer yard');
assert.ok(Distance(A.ditchMouth,A.ditch)<16,'second strike at the same ditch mouth');
const anchors=[A.ditch,A.retreatA,A.retreatB,A.retreatC];
assert.ok(anchors.slice(1).every((p,i)=>p.z>anchors[i].z),'withdrawal turns south');
assert.ok(A.retreatB.x>A.retreatA.x&&A.retreatC.x<A.retreatB.x,'alternating bends, not a single straight corridor');
for(const pocket of Pockets){
 assert.ok(pocket.route.some(p=>Distance(p,pocket.anchor)<.01));
 assert.deepEqual(MISSION_RETURN_ROUTES[pocket.id],pocket.route,'return warning follows the actual bent route');
 const n=MissionRouteNextIndex(Routes.evacuation,pocket.anchor);
 assert.ok(Distance(Routes.evacuation[n],pocket.anchor)<.01,'pursuit never selects an unrelated point by east/west coordinate');
}
// A standing eye must lose the next pocket behind actual geometry.
function SolidBetween(a,b){
 const from={...a,y:SampleMissionTerrain(a.x,a.z)+1.6},to={...b,y:SampleMissionTerrain(b.x,b.z)+1.6};
 const distance=Distance(a,b);
 return Layout.blocks.some(box=>box.solid!==false&&Array.from({length:Math.ceil(distance*4)},(_,i)=>i/(distance*4)).some(t=>{
  const x=from.x+(to.x-from.x)*t-box.x,z=from.z+(to.z-from.z)*t-box.z,y=from.y+(to.y-from.y)*t;
  return Math.abs(x)<box.w/2&&Math.abs(z)<box.d/2&&y>box.y-box.h/2&&y<box.y+box.h/2;
 }));
}
assert.ok(SolidBetween(A.retreatA,A.retreatB),'A to B long sightline is broken');
assert.ok(SolidBetween(A.retreatB,A.retreatC),'B to C long sightline is broken');
const gapWalls=Layout.blocks.filter(box=>box.id.startsWith('RearWallGap'));
assert.equal(gapWalls.length,2);
assert.ok(gapWalls.every(box=>box.z===A.retreatB.z),'the route crosses the wall at pocket B');
assert.ok(gapWalls.some(box=>box.x+box.w/2<A.retreatB.x)&&gapWalls.some(box=>box.x-box.w/2>A.retreatB.x),
 'B is the traversed opening between two wall sections');
const bounds=Reception.bounds,Inside=p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ;
for(const id of ['reception','zhouPickup','zhouDrop','finalCover'])assert.ok(Inside(A[id]),`${id} shares the reception compound`);
assert.ok(!Inside(A.rearExit)&&A.rearExit.x<bounds.minX,'back door leads west into the liaison alley');
assert.ok(Distance(A.zhouPickup,A.zhouDrop)<18,'last carry stays in the same courtyard');
assert.ok(MissionRouteLength(Routes.exit)<100,'final defense and handoff stay local');
const gate=Layout.gates.find(g=>g.id==='MissionBridgeWreck');
assert.equal(gate.appearSignal,'MissionBridgeDestroyed');
assert.ok(gate.h>3&&gate.w>=8,'destroyed road has visible structural obstruction');
for(const id of ['retreatWall','retreatYard','reception','final'])assert.ok(Enemies[id].length>=3,'all local encounters retained');
console.log('ok Notion 2026.09.14: all 18 phase conditions, independent missing-fact gates, escort transition and 45/150 seconds, west-to-south pockets, broken sightlines and one reception compound');
