// P012实际状态机的纯Node宿主测试：用注册交互回调/玩家动作/正式信号驱动，不写beat跳关。
import assert from "node:assert/strict";
import { FirstLevelP012Director, P012_WAVES } from "./Script_FirstLevelP012Flow.mjs";
import { FIRST_LEVEL_P012_WHITEBOX_PHASE as phase } from "./Data_FirstLevelP012Whitebox.mjs";
import { CarrySystem } from "./Script_Carry.mjs";
import { AllowAutonomousBark } from "./Script_FirstLevelWhiteboxFlow.mjs";
import { StoryDirector } from "./Script_Story.mjs";
import { EscortColumn, StepP012RoadCover } from "./Script_MissionSetpieces.mjs";
import { VOICE_LINES as CH1_VOICES, CHAPTER as CH1_CHAPTER } from "./Data_MissionCh1.mjs";
import { existsSync, readFileSync } from "node:fs";

const points = new Map();
// Execute the production Blast method with a deterministic wall raycast seam.
// This is a logic fixture, not a claim of a full browser grenade trajectory.
{
  class Vec {
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    clone(){return new Vec(this.x,this.y,this.z);}
    copy(v){Object.assign(this,{x:v.x,y:v.y,z:v.z});return this;}
    subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;}
    length(){return Math.hypot(this.x,this.y,this.z);}
    divideScalar(n){this.x/=n;this.y/=n;this.z/=n;return this;}
    distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  }
  const source=readFileSync(new URL("./Script_Combat.mjs",import.meta.url),"utf8");
  const method=source.slice(source.indexOf("  Blast(position"),source.indexOf("  get MortarLeft"));
  const blast=Function("Clamp01",`return ({${method}}).Blast;`)(v=>Math.max(0,Math.min(1,v)));
  const director=new FirstLevelP012Director({EnemyPosition:actor=>actor.alive?actor.position:null},phase.whitebox);
  director.beat=21;
  const enemies=Array.from({length:6},(_,id)=>({id,alive:true,side:"ija",suppression:0,position:new Vec(2+id,0,0),TakeHit(damage){this.health=(this.health??100)-damage;return false;}}));
  director.enemyRoutes=enemies.map(handle=>({encounterBeat:21,handle}));
  const before=director.Snapshot();
  let wall=true;
  const host={host:{battlefield:{Raycast:()=>wall?{t:.1}:null},ai:{soldiers:enemies}},tmp:new Vec(),tmpB:new Vec()};
  const receipt=(target,damage,position)=>director.RecordSouthGrenadeEffect(target,damage,position);
  blast.call(host,new Vec(),4,100,"grenade","ija",true,receipt);
  assert.equal(director.State().lastSouthGrenadeEffect,null,"solid wall blocks both damage and receipt");
  wall=false;
  blast.call(host,new Vec(100,0,100),4,100,"grenade","ija",true,receipt);
  assert.equal(director.State().lastSouthGrenadeEffect,null,"unrelated explosion gives no receipt");
  assert.equal(receipt({},100,new Vec()),false,"other encounter target is not a B21 effect");
  assert.equal(receipt(enemies[0],0,new Vec()),false);
  blast.call(host,new Vec(),4,100,"grenade","ija",true,receipt);
  assert.ok(enemies[0].health<100);
  assert.ok(director.State().lastSouthGrenadeEffect.damage>0);
  const actual=director.State().lastSouthGrenadeEffect;
  director.Restore(before);
  assert.deepEqual(director.State().lastSouthGrenadeEffect,actual,"world-preserving retry retains actual explosion receipt");
  assert.ok(director.facts.has("southGrenadeThrown"));
  assert.equal(new FirstLevelP012Director({},phase.whitebox).State().lastSouthGrenadeEffect,null,"new test starts clean");
  assert.match(source,/p\.owner === "player", p\.OnHit/);
}
const signals = new Set();
const carry = new CarrySystem();
const spawned = [];
let acceptSpawns = true;
let restoredSignals = null;
let shelling = 0;
let currentClips = 3;
let checkWeaponCalls = 0;
let currentGrenades = 0;
let smokeDeployments = 0;
let bandagesIssued = 0;
const flow = new FirstLevelP012Director({
  Register: (spec) => points.set(spec.id, spec), Carry: () => carry,
  Signal: (name) => signals.add(name), Signalled: (name) => signals.has(name),
  RestoreSignals: (list) => { restoredSignals = list; },
  CurrentClips: () => currentClips,
  GiveClips: (request) => { currentClips += request; return request; },
  GiveBandages: (request) => { bandagesIssued += request; return request; },
  CheckWeapon: () => { checkWeaponCalls++; },
  GiveGrenades: (request) => { currentGrenades += request; return request; },
  DeployRetreatSmoke: () => { smokeDeployments++; return true; },
  SpawnEnemy: (spec) => {
    if (!acceptSpawns) return null;
    const actor = { ...spec, position: { x: spec.x, z: spec.z }, alive: true };
    spawned.push(actor); return actor;
  },
  EnemyPosition: (actor) => actor.alive ? actor.position : null,
  EnemyGoal: (actor, goal) => { actor.goal = goal; }, Shelling: () => { shelling += 1; },
}, phase.whitebox);
let sample = { position: phase.spawn, yaw: 0, stance: "stand", sprint: 0,
  zone: "Z00", enemyDeaths: 0, carryKind: null, columnArrived: false,
  weaponActionCount: 0, trafficReady: true };
function Tick(patch = {}, dt = 0.1) { sample = { ...sample, ...patch }; return flow.Update(dt, sample); }
function Use(id) {
  const point = points.get(id);
  assert.ok(point, `${id} has a real registered interaction`);
  assert.notEqual(point.Enabled?.(), false, `${id} must be enabled at this beat`);
  point.OnComplete?.();
}
function At(zone, point = null) {
  const p = point || phase.zones.find((item) => item.id === zone);
  return Tick({ zone, position: p });
}
function KillWave() { for (const actor of spawned) actor.alive = false; return Tick({ enemyDeaths: spawned.length }, 40); }
function Walk(route, extra = {}) {
  for (const point of route) Tick({ position: point, guidePosition: point, ...extra });
}

assert.equal(points.get("p012_ammoPickup").Enabled(), false, "ammo cannot be taken during arrival");
At("Z00", phase.whitebox.anchors.trainDoor);
assert.equal(flow.State().beat, "B00", "door proximity alone does not replace train traversal");
Walk(phase.whitebox.activities.trainRoute);
assert.equal(flow.State().beat, "B01");
Use("p012_weaponCheck"); Tick();
assert.equal(flow.State().beat, "B01", "supply interaction alone does not complete weapon handling");
Use("p012_ammoIssue");
Tick({weaponActionCount:1,position:phase.whitebox.activities.weaponInspectPosition});
assert.equal(flow.State().checkpointId, "CP00");
const villageRoute = phase.whitebox.activities.villageRoute;
Tick({zone:"Z01",position:{x:70,z:100},guidePosition:villageRoute[2],guideRouteIndex:3,trafficReady:false});
assert.equal(flow.State().routeIndex,0,"a remote guide does not grant followed segments");
for (let i=0;i<villageRoute.length;i++) {
  const point=villageRoute[i];
  Tick({zone:"Z01",position:{x:point.x+3.1,z:point.z},guidePosition:{x:point.x+1.9,z:point.z},
    guideRouteIndex:Math.min(i+1,villageRoute.length-1),trafficReady:false});
}
assert.equal(flow.State().routeIndex,villageRoute.length,"following 1.2m behind guide acknowledges nodes outside old 3m circle");
assert.equal(flow.State().beat,"B02","route alone does not fabricate opposing village traffic");
Tick({trafficReady:true});
At("Z02"); Use("p012_hubSupply"); Tick({yaw:1.4});
const issuedAtHub=checkWeaponCalls;
assert.equal(points.get("p012_hubSupply").Enabled(),false,"hub supply is single issue at its own stage");
points.get("p012_hubSupply").OnComplete();
assert.equal(checkWeaponCalls,issuedAtHub,"repeating the supply callback cannot mint more clips");
assert.equal(flow.State().beat, "B03", "turning in place does not identify three landmarks");
for (const observation of phase.whitebox.activities.orientations) {
  if (observation.via) Tick({position:observation.via});
  const p=observation.position,l=observation.lookAt;
  const yaw=Math.atan2(-(l.x-p.x),-(l.z-p.z)),index=flow.orientationIndex;
  for(const pitch of [-1.4,1.4]){
    Tick({position:p,yaw,pitch,orientationVisible:[false,false,false,false]},phase.whitebox.activities.observationSeconds+0.1);
    assert.equal(flow.orientationIndex,index,"looking up/down with correct yaw does not consume a landmark");
  }
  Tick({position:p,yaw,pitch:0,orientationVisible:[false,false,false,false]},phase.whitebox.activities.observationSeconds+0.1);
  assert.equal(flow.orientationIndex,index,"occluded landmark with correct yaw does not count");
  Tick({position:p,yaw,orientationVisible:[true,true,true,true]},phase.whitebox.activities.observationSeconds/2);
  Tick({orientationVisible:[false,false,false,false]},.1);
  assert.equal(flow.observationTime,0,"losing real visibility resets continuous observation");
  Tick({position:p,yaw,orientationVisible:[true,true,true,true]},phase.whitebox.activities.observationSeconds+0.1);
}
assert.equal(flow.State().beat, "B04");
At("Z03"); Tick({position:{x:0,z:-31},sprint:1}); Tick({position:{x:0,z:-34},sprint:1});
Tick({position:{x:0,z:-37},sprint:1,stance:"crouch"});
for(const p of phase.whitebox.activities.shellCoverRoute) {
  Tick({position:p,zone:"Z03",stance:"crouch",guidePosition:p});
  const index=flow.routeIndex;
  Tick({yaw:Math.atan2(7,3)},3.1);
  assert.equal(flow.routeIndex,index,"looking without the real impact does not complete a cover leg");
  Tick({mortarImpactCount:(sample.mortarImpactCount||0)+1},3.1);
}
At("Z04");
assert.equal(shelling,4,"four cover legs produce four actual impact events");
assert.equal(flow.State().beat,"B05");
Use("p012_ammoPickup"); assert.equal(carry.KindId,"ammoCrate");
carry.load.canDrop=false;
assert.equal(points.get("p012_ammoDrop").Enabled?.(),false,"delivery requires the carried dogleg route");
Walk(phase.whitebox.activities.ammoRoute,{carryKind:"ammoCrate"});
assert.equal(points.get("p012_ammoDrop").Enabled?.(),true);
Use("p012_ammoDrop"); Tick({carryKind:null});
assert.equal(carry.Active,false,"delivery physically releases even a non-droppable ammo load");
assert.equal(flow.State().beat,"B06");
const beforeSpawn = flow.Snapshot();
const ammoPoint=points.get("p012_frontlineAmmo");
currentClips=1;
assert.equal(ammoPoint.OnComplete({point:ammoPoint}),true);
assert.equal(currentClips,4,"supply fills only the spare-clip carry cap");
assert.equal(flow.State().frontlineAmmo.remainingClips,9,"stock loses actual three clips, not a fixed batch");
assert.equal(ammoPoint.OnComplete({point:ammoPoint}),false,"full carrier does not consume box stock");
for(let i=0;i<3;i++) { currentClips=0; ammoPoint.OnComplete({point:ammoPoint}); }
assert.equal(flow.State().frontlineAmmo.dispensedClips,12);
assert.equal(flow.State().frontlineAmmo.remainingClips,0);
assert.equal(ammoPoint.label,"弹药箱已空");
assert.equal(ammoPoint.OnComplete({point:ammoPoint}),false,"empty stock cannot produce ammunition");
flow.Restore(beforeSpawn);
assert.equal(flow.State().frontlineAmmo.remainingClips,0,"rewinding before a withdrawal never replenishes finite stock");
assert.ok(flow.facts.has("supply"),"one-time issued supply retains its completion fact after rewind");
acceptSpawns=false; Tick();
assert.equal(flow.State().pendingEnemies,2,"failed spawns stay in finite pending budget");
acceptSpawns=true; Tick();
assert.equal(spawned.length,2,"first pressure is exactly two scouts");
assert.ok(flow.elapsed<285,"fast completed preparation is not held idle until the target timestamp");
assert.equal(flow.State().totalEnemyBudget,37);
for (const actor of spawned) actor.alive=false;
Tick({enemyDeaths:2},0.1); Tick({},0.1);
assert.equal(spawned.length,7,"cleared scouts immediately release the finite front group without empty waiting");
assert.ok(flow.State().pressureHistory[1].interval<1,"all-clear interval records actual short pacing instead of a fake 40s wait");
assert.equal(flow.State().pressureHistory[1].mechanism,"sameAxisReinforcement");
assert.equal(flow.State().pressureHistory[1].reason,"clearReinforcement");
KillWave(); Tick({},40);
At("Z05",phase.whitebox.anchors.gunports[0]); At("Z05",phase.whitebox.anchors.gunports[1]);
assert.equal(flow.CurrentObjective().requiredStance,"prone","moving between gunports follows the protected prone route");
KillWave(); Tick({},40);
assert.equal(flow.State().beat,"B08","dead MG enemies do not pretend the friendly gun resumed firing");
const mgSnapshot=flow.Snapshot();
const fallbackMg=new FirstLevelP012Director({EnemyPosition:(actor)=>actor.alive?actor.position:null},phase.whitebox);
fallbackMg.Restore(mgSnapshot);
// World actors intentionally live outside checkpoint snapshots, just as in Main.
fallbackMg.enemyRoutes=flow.enemyRoutes;
const remainingRifle=spawned.at(-1);remainingRifle.alive=true;
fallbackMg.Update(0.1,{...sample,enemyMgDestroyed:true,friendlyMgFiredAfterSuppression:false});
assert.equal(fallbackMg.State().beat,"B08","destroying the enemy MG while another threat lives cannot use all-clear fallback");
remainingRifle.alive=false;
fallbackMg.Update(0.1,{...sample,enemyMgDestroyed:true,friendlyMgFiredAfterSuppression:false});
assert.equal(fallbackMg.State().beat,"B09");
assert.equal(fallbackMg.State().completionReasons[8],"threatCleared");
assert.ok(fallbackMg.CurrentObjective().text.startsWith("机枪威胁已清除"),"all-clear is not falsely described as friendly fire");
Tick({friendlyMgFiredAfterSuppression:true});
assert.equal(flow.State().completionReasons[8],"friendlyMgResumed");
Tick({position:{x:5,z:-65},mortarWarningActive:true,mortarWarningPosition:{x:5,z:-65}});
assert.equal(flow.CurrentObjective().requiredAction,"sprint","mortar escape starts with sprint, never slow prone crawling");
assert.equal(flow.CurrentObjective().requiredStance,"stand");
Tick({position:{x:-3,z:-65}});
assert.equal(flow.CurrentObjective().requiredStance,"prone","after actual six-metre escape the remaining transfer is prone");
Tick({position:phase.whitebox.anchors.gunports[0]});
assert.equal(flow.CurrentObjective().requiredStance,null,"arrival at a safe gunport permits standing to fire");
const mortarFightingSample=flow.lastSample;
flow.lastSample={...mortarFightingSample,nearEnemyDeaths:11,stance:"stand"};
assert.equal(flow.CurrentObjective().requiredStance,"prone","cleared mortar fight explicitly requests the low stance needed to finish relocation");
flow.lastSample=mortarFightingSample;
Tick({mortarImpactCount:(sample.mortarImpactCount||0)+1,mortarImpactPosition:{x:100,z:100}});
KillWave(); Tick({},40); KillWave();
assert.equal(flow.State().beat,"B11");
Use("p012_woundedCheck"); Tick();
assert.equal(flow.State().beat,"B11","wounded check cannot replace reloading");
Tick({weaponActionCount:sample.weaponActionCount+1}); At("Z04");
assert.equal(flow.State().beat,"B11","checking and loading do not replace physically dragging the wounded");
Walk(phase.whitebox.activities.woundedDragRoute,{carryKind:"wounded"});
Tick({carryKind:null,woundedDragDelivered:true,woundedDragDistance:34});
assert.equal(flow.State().beat,"B12","arrival cannot volunteer automatically");
assert.equal(signals.has("EscortCall"),false,"column is not released before the player volunteers");
assert.equal(points.get("p012_volunteer").Enabled(),false,"volunteer cannot target a moving or missing guide");
Tick({guideAlive:true,guidePosition:phase.whitebox.activities.woundedDragTo});
assert.deepEqual(flow.ActivityRoute(),[phase.whitebox.activities.woundedDragTo]);
Use("p012_volunteer"); Tick();
assert.equal(flow.State().beat,"B12","a request is not the commander's approval");
assert.equal(signals.has("EscortCall"),false);
assert.equal(signals.has("P012EscortRequested"),true);
signals.add("P012EscortApproved"); Tick();
assert.equal(flow.State().beat,"B13");
At("Z06"); assert.equal(flow.State().beat,"B13","outbound history does not satisfy reverse escort");
for(const id of ["Z04","Z03","Z02","Z06"]) At(id);
assert.equal(flow.State().beat,"B13","player cannot leave escort before the column arrives");
Tick({columnAtEscortEnd:true,columnPosition:sample.position});
assert.equal(flow.State().beat,"B14");
Tick({},40);
const ambushActors=spawned.slice(-6);
Tick({position:{x:42.5,z:24},zone:"Z07"});
assert.equal(flow.routeIndex,0,"three metre turn cutting cannot consume the courtyard corner");
assert.deepEqual(flow.CurrentObjective().target,{x:39,z:25.5},"safe entry directs the player into the existing blue firing cover, not across the exposed gap");
assert.equal(flow.CurrentObjective().arrivalRadiusM,phase.whitebox.activities.ambushRouteRadiusM);
assert.equal(flow.RouteArrivalRadius(),0.6);
Tick({position:{x:44.39,z:26},zone:"Z07"});
assert.equal(flow.routeIndex,0,"outside the public arrival radius remains at the corner");
assert.ok(signals.has("P012AmbushStarted"));
assert.equal(signals.has("P012RoadGunSilenced"),false,"live road shooters cannot release the litters");
assert.equal(new Set(ambushActors.map(actor=>`${actor.x},${actor.z}`)).size,6,"six ambushers exist at distinct positions before the flank");
Tick({position:{x:39,z:25.5},bleeding:1,bandages:1});
assert.ok(flow.CurrentObjective().text.includes("按 B"));
Tick({bandages:0});
assert.ok(!flow.CurrentObjective().text.includes("按 B"));
assert.equal(flow.CurrentObjective().requiredAction,"fight","no bandage stock is not a mission gate");
assert.equal(flow.routeIndex,0,"entry cover does not consume the actual flank route");
At("Z07",phase.whitebox.anchors.stretcher);
assert.equal(flow.State().beat,"B14","kills alone do not replace the flank route");
for(const point of phase.whitebox.routes.flank){
  Tick({position:point,zone:"Z07",columnPosition:phase.whitebox.anchors.stretcher});
  if(point===phase.whitebox.routes.flank[0]) {
    assert.equal(flow.routeIndex,0,"road pressure is handled from the entry cover before the original flank route");
    assert.deepEqual(flow.CurrentObjective().target,phase.whitebox.activities.ambushGroups[0].cover);
  }
  const threat=flow.AmbushThreat();
  if(threat){
    if(threat.index===2){
      Tick({position:{x:72,z:35}});
      assert.equal(flow.CurrentObjective().requiredStance,"prone","the verified east gallery stays low before the third firing nest");
      Tick({position:{x:72,z:40}});
      assert.equal(flow.CurrentObjective().requiredStance,"prone");
    }
    Tick({position:threat.cover});
    const objective=flow.CurrentObjective();
    assert.equal(objective.requiredAction,"fight");
    assert.equal(objective.requiredStance,null,"standing fire is allowed at the firing pocket");
    assert.deepEqual(objective.target,threat.cover,"fight navigation targets a firing position, never enemy feet");
    assert.notDeepEqual(objective.target,{x:objective.lookAt.x,z:objective.lookAt.z});
    const cursor=flow.routeIndex;
    Tick({position:phase.whitebox.routes.flank[cursor]});
    assert.equal(flow.routeIndex,cursor,"current living group remains the visible objective");
    const groupActors=ambushActors.slice(threat.index*2,threat.index*2+2);
    groupActors[0].alive=false;
    Tick({enemyDeaths:spawned.filter(actor=>!actor.alive).length,position:point});
    if(threat.index===0)assert.equal(signals.has("P012RoadGunSilenced"),false,"one casualty is not both road shooters silenced");
    groupActors[1].alive=false;
    Tick({enemyDeaths:spawned.filter(actor=>!actor.alive).length,position:point});
    if(threat.index===0){
      assert.ok(signals.has("P012RoadGunSilenced"));
      assert.equal(signals.has("P012AmbushClear"),false,"short cover relocation cannot release the full road escort");
      assert.equal(signals.has("P012AirReady"),false);
      assert.equal(flow.State().beat,"B14","clearing only the road pair cannot skip the room and return leg");
    }
  }
}
assert.equal(flow.State().beat,"B15");
Use("p012_roadSupply"); At("Z08");
assert.equal(flow.State().beat,"B15","supply alone does not replace checking the wounded");
assert.equal(points.get("p012_roadWounded").Enabled(),false,"a fixed empty inspection point is not an actual litter");
assert.equal(points.get("p012_roadWounded").OnComplete(),false,"stale completion cannot check a missing litter");
const inspectionPoint={x:50,z:46.3};
Tick({position:{x:50,z:47},columnPosition:{x:50,z:47},zone:"Z07",roadWoundedPosition:inspectionPoint,roadWoundedAtInspection:true});
assert.deepEqual(points.get("p012_roadWounded").Anchor(),inspectionPoint);
Use("p012_roadWounded"); Tick();
assert.ok(signals.has("P012RoadWoundedChecked"));
assert.equal(flow.State().beat,"B16","actual inspection releases B16 before the whole column reaches z60");
for(const zone of ["Z07",null]) {
  const director=new FirstLevelP012Director({},phase.whitebox);
  director.Restore({...director.Snapshot(),beat:15,facts:["regroup","roadWounded"]});
  director.Update(.1,{position:{x:50,z:47},columnPosition:{x:50,z:70},zone});
  assert.equal(director.State().beat,"B15","actual checked facts still require physical proximity to the column");
  director.Update(.1,{position:{x:50,z:47},columnPosition:{x:50,z:47},zone});
  assert.equal(director.State().beat,"B16","actual inspection and nearby column do not depend on a region-circle label");
}
assert.equal(signals.has("P012AirReady"),false,"one inspected litter cannot substitute for four bearers entering the road");
Tick({position:{x:54,z:57},columnPosition:{x:50,z:56},airColumnEnteredRoad:false,airColumnReady:false,sprint:0});
assert.equal(signals.has("P012AirReady"),false);
Tick({position:{x:54,z:60},columnPosition:{x:50,z:66},airColumnEnteredRoad:true});
assert.equal(signals.has("P012AirReady"),false,"four bearers entering does not replace the player's actual acceleration");
assert.equal(flow.CurrentObjective().requiredAction,"sprint");
Tick({position:{x:50,z:63},sprint:1});Tick({position:{x:50,z:66},sprint:1});
assert.ok(signals.has("P012AirReady"),"first attack starts while the complete player road route still remains");
assert.ok(flow.airSprintM>=4);
assert.ok(flow.routeIndex<phase.whitebox.activities.airRoadRoute.length);
Tick({},200); assert.equal(flow.State().beat,"B16","time cannot pretend the aircraft passed");
signals.add("P012RailComplete"); Tick();
assert.equal(flow.State().beat,"B17","actual rail exit never waits for unused route points or the old z68 gate");
assert.match(flow.State().objective.text,/留意飞机来向/);
assert.doesNotMatch(flow.State().objective.text,/转向道路|向道路开火|扫射/,"cover-seeking prompt does not reveal the aircraft target before its action");
signals.add("P012CrowdFire"); Tick();
assert.equal(flow.State().beat,"B17","crowd fire alone cannot complete actual cover-seeking");
assert.match(flow.State().objective.text,/已向道路开火/,"real crowd fire changes the prompt to a completed observable event");
assert.doesNotMatch(flow.State().objective.text,/正在转向/,"turn wording cannot linger into the strafe");
assert.ok(signals.has("P012CrowdReady")&&signals.has("P012SeekAirCover"));
Walk(phase.whitebox.activities.airCoverRoute,{stance:"stand"});
assert.equal(flow.State().beat,"B17","standing beside the ditch is not entering low cover");
Tick({stance:"crouch"});
assert.equal(flow.State().beat,"B18");
Tick({carryKind:"stretcher"});
assert.equal(flow.State().beat,"B18","picking up alone does not replace carrying to cover");
Tick({position:phase.whitebox.activities.stretcherCarryTo,carryDistance:10});
assert.equal(flow.State().beat,"B18","carry destination cannot bypass the open ditch entrance");
Walk(phase.whitebox.activities.stretcherCarryRoute,{carryKind:"stretcher",carryDistance:20});
signals.add("P012Dived"); Tick({carryKind:null,stance:"crouch"});
Tick({},40);
const closeActors=spawned.slice(-6);
assert.deepEqual(closeActors.map(actor=>[actor.x,actor.z]),[[72,28],[72,30],[72,32],[72,61.5],[72,64],[72,66.5]],"six finite enemies start on screened northeast and southeast approaches");
assert.deepEqual(flow.enemyRoutes.slice(-6).map(entry=>entry.points[0]),[
  {x:74,z:30},{x:74,z:30},{x:74,z:30},{x:69,z:73},{x:69,z:73},{x:69,z:73}],"three actors physically follow each distinct approach without changing pair groups");
assert.deepEqual(flow.enemyRoutes.slice(-6).map(entry=>entry.encounterGroup),[0,0,1,1,2,2]);
assert.equal(flow.CurrentObjective().requiredAction,"fight");
assert.deepEqual(flow.CurrentObjective().target,{x:44,z:62});
KillWave(); assert.ok(signals.has("P012DitchClear"),"only cleared ditch combat releases actual litters");
Tick({},40);
const southActors=spawned.slice(-6);
assert.equal(new Set(southActors.map(actor=>`${actor.x},${actor.z}`)).size,6,"south combat has six separated indoor/outdoor actors");
KillWave(); At("Z09");
assert.equal(flow.State().beat,"B21","kills and zone arrival do not replace the room entrance route");
Use("p012_southGrenades"); assert.equal(currentGrenades,2);
Tick({grenades:currentGrenades,grenadeThrows:1});
assert.equal(flow.facts.has("southGrenadeThrown"),false,"an unrelated throw never fabricates an effective explosion");
assert.equal(flow.State().beat,"B21","grenade use still requires entering the cleared house");
At("Z09",phase.whitebox.activities.southRoom);
assert.equal(flow.State().beat,"B21","room destination cannot bypass the visible entrance route");
Walk(phase.whitebox.activities.southRoomRoute,{zone:"Z09"});
assert.equal(flow.State().beat,"B22"); Tick({},40);
assert.equal(flow.facts.has("southGrenadeThrown"),false,"six actually cleared enemies allow entry without pretending a grenade hit");
assert.equal(flow.State().beat,"B22","time does not fabricate the southern blockade");
Tick({blockadeVisible:true,blockadePressure:true});
assert.equal(flow.State().beat,"B22","far shooting cannot abandon litters back at the old ditch");
Walk(phase.whitebox.activities.southAssemblyRoute,{zone:"Z09"});
Tick({farSpawned:3,farDeaths:3,blockadeVisible:false,blockadePressure:false,columnAtSouthAssembly:true});
assert.equal(flow.State().beat,"B22","partial far spawn cannot impersonate the finite four being cleared");
Tick({farSpawned:4,farDeaths:4});
assert.equal(flow.State().beat,"B23");
assert.equal(flow.State().completionReasons[22],"blockadeCleared");
assert.match(flow.CurrentObjective().text,/四名远哨已清除/);
Use("p012_retreatSmoke"); assert.equal(smokeDeployments,1);
At("Z04"); Tick({columnArrived:true},100);
assert.equal(flow.State().beat,"B23","cannot bypass the retreat route with the old visited flag");
for(const point of phase.whitebox.routes.retreat) Tick({position:point,zone:"Z10",columnPosition:point,stance:"crouch"});
for(const event of ["P012RetreatCover0","P012RetreatCover1","P012RetreatCover2","P012HubRevisited"])assert.ok(signals.has(event),`${event} follows a real covered route fact`);
At("Z04");
assert.equal(flow.State().beat,"B23","head arrival does not replace the last litter or real smoke");
Tick({lastLitterArrived:true,retreatSmokeActive:true});
assert.ok(signals.has("P012LastLitterArrived"));
assert.equal(flow.State().beat,"B24");
assert.equal(flow.State().retreatCovers.length,3,"all three real escort cover stops were visited");
Tick({position:phase.whitebox.anchors.shelter,carryKind:"stretcher"});
assert.equal(flow.State().beat,"B24","pickup at the destination cannot complete delivery");
Tick({position:phase.whitebox.activities.regripPosition,carryKind:null});
Tick({carryKind:"stretcher"});
for(let z=-40;z>=-52;z-=3) Tick({position:{x:-7,z}});
assert.equal(flow.State().beat,"B25");
assert.equal(spawned.length,33,"all waves exhaust at a finite total");
Tick({},600); assert.equal(spawned.length,33,"waiting never respawns cleared enemies");
const count=spawned.length;
assert.equal(flow.Restore(beforeSpawn),true);
Tick({},100);
assert.equal(spawned.length,count,"checkpoint replay cannot reissue already-created waves");
assert.ok(restoredSignals,"checkpoint restores scenario signals");
assert.equal(AllowAutonomousBark(phase,()=>false),false);
assert.equal(AllowAutonomousBark(phase,(signal)=>signal==="AircraftTurnCrowd"),false,"aircraft does not reopen autonomous chatter");
assert.equal(AllowAutonomousBark(phase,(signal)=>signal==="P012Complete"),true);
assert.equal(AllowAutonomousBark(phase,()=>true),true);
assert.equal(AllowAutonomousBark({},()=>false),true,"normal chapters are unchanged");
assert.deepEqual(P012_WAVES.slice(0,5).map(w=>w.kind),["scouts","rifles","machineGun","mortar","culvert"]);
const spoken=[];
// Production Story -> Flow approval chain, with recorded duration and silent
// subtitle fallback. Restoring midway keeps the remaining occupancy, not a
// second recording or an instantly completed permission.
for (const voiced of [true, false]) {
  const heard=[]; const subtitles=[]; const registrations=new Map();
  const approvalStory=new StoryDirector({hud:{Say(...args){subtitles.push(args);},Title(){}}});
  const duration=CH1_VOICES.find(voice=>voice.key==="ch1_luo_08").dur;
  approvalStory.AttachVoice(({key})=>{heard.push(key);return voiced ? duration : 0;});
  approvalStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
  approvalStory.Signal("P012EscortRequestOpen");
  const director=new FirstLevelP012Director({Register:spec=>registrations.set(spec.id,spec),
    Signal:name=>approvalStory.Signal(name),Signalled:name=>approvalStory.Signalled(name)},phase.whitebox);
  director.beat=12;
  director.Update(.01,{position:phase.whitebox.activities.woundedDragTo,guideAlive:true,
    guidePosition:phase.whitebox.activities.woundedDragTo});
  const before=approvalStory.P012Snapshot();
  registrations.get("p012_volunteer").OnComplete();
  director.Update(.01,{});
  assert.equal(director.beat,12);assert.equal(approvalStory.Signalled("EscortCall"),false);
  for(let i=0;i<401 && !heard.includes("ch1_luo_08");i++) approvalStory.Update(.01,{p012Beat:12});
  assert.deepEqual(heard.slice(0,3),["ch1_junguan_01","ch1_shunzi_02","ch1_luo_08"],"recruitment, request and approval keep their causal order");
  const full=voiced ? duration : 2;
  approvalStory.Update(full/2,{p012Beat:12});
  const middle=approvalStory.P012Snapshot();
  assert.equal(approvalStory.Signalled("P012EscortApproved"),false);
  approvalStory.P012Restore(before);
  assert.ok(Math.abs(approvalStory.p012PendingCompletion.remaining-full/2)<1e-6);
  approvalStory.Update(full/2-.01,{p012Beat:12});
  director.Update(.01,{});assert.equal(director.beat,12);
  approvalStory.Update(.02,{p012Beat:12});director.Update(.01,{});
  assert.equal(director.beat,13);assert.equal(approvalStory.Signalled("EscortCall"),true);
  assert.ok(approvalStory.levelTime<8,"even an immediate request has no eight-second approval-only wait");
  approvalStory.P012Restore(middle);
  approvalStory.Signal("P012EscortRequested");
  for(let i=0;i<20;i++)approvalStory.Update(.5,{p012Beat:13});
  assert.equal(heard.filter(key=>key==="ch1_luo_08").length,1);
  assert.equal(approvalStory.Signalled("P012EscortApproved"),true);
  assert.equal(approvalStory.p012PendingCompletion,null);
  assert.ok(heard.includes("ch1_luo_09"),"return instruction can follow while the column moves");
  // Fresh instance recovery also completes the saved remaining subtitle.
  const recovered=new StoryDirector({hud:{Say(){},Title(){}}});
  recovered.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
  recovered.P012Restore(middle);recovered.Update(full/2+.01,{p012Beat:12});
  assert.equal(recovered.Signalled("P012EscortApproved"),true);
}
assert.equal(CH1_CHAPTER.beats.some(beat=>beat.p012CompleteSignal),false,"formal chapter has no completion gates");
{
  const ordinary=new StoryDirector({hud:{Say(){},Title(){}}});
  ordinary.BeginLevel(phase.contentId);
  ordinary.Play(phase.whitebox.storyBeats.find(beat=>beat.voice==="ch1_luo_08"),false);
  ordinary.Update(10,{});
  assert.equal(ordinary.Signalled("P012EscortApproved"),false,"completion opt-in cannot affect a normal chapter");
  assert.equal(ordinary.p012PendingCompletion,null);
}
const openingStory=new StoryDirector({hud:{Say(){},Title(){}}});
openingStory.AttachVoice(({key})=>{spoken.push(key);return 0.1;});
openingStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
openingStory.Update(100,{p012Beat:0});
assert.equal(spoken.length,0,"opening speech requires actual arrival rather than elapsed time");
for(const event of ["P012Arrival","P012TrainDoor","P012WeaponReceived","P012AmmoIssued"]){
  openingStory.Signal(event);openingStory.Update(10,{p012Beat:1});
}
assert.deepEqual(spoken,["ch0_junguan_04","ch0_luo_11","ch0_luo_08","ch1_luo_01"],"arrival and weapon dialogue is not trapped behind B05");
openingStory.Signal("P012AmmoTask");
for(let i=0;i<4;i++)openingStory.Update(10,{p012Beat:5});
for(const voice of ["ch1_luo_01","ch1_heyoutian_01","ch1_shunzi_01","ch1_luo_05"]){
  assert.equal(phase.whitebox.storyBeats.filter(beat=>beat.voice===voice).length,1,`${voice} was moved, never duplicated`);
  assert.equal(spoken.filter(key=>key===voice).length,1,`${voice} plays once at the actual task`);
}
for(const voice of spoken)assert.ok(existsSync(new URL(`./Audio/vo_${voice}.mp3`,import.meta.url)),`${voice} reuses a checked-in recording`);
// Real recording durations, frame-stepped actual aircraft windows. A deliberately
// blocked ordinary queue must not delay the scene-critical event lane.
const airStory=new StoryDirector({hud:{Say(){},Title(){}}});
const airSpoken=[];
let airTime=0;
airStory.AttachVoice(({key})=>{
  const duration=CH1_VOICES.find(voice=>voice.key===key)?.dur || 0;
  airSpoken.push({key,time:airTime,duration}); return duration;
});
airStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
const railFire=8,railExit=railFire+(100+120)/104,crowdFire=railExit+5;
for(airTime=0;airTime<60;airTime+=1/60){
  airStory.Signal("P012AircraftApproach");
  if(airTime>=railFire)airStory.Signal("P012AircraftRailFire");
  if(airTime>=railExit)airStory.Signal("P012AircraftRailExit");
  if(airTime>=crowdFire)airStory.Signal("P012AircraftCrowdFire");
  if(airTime>=crowdFire+1)airStory.Signal("StretcherHandoff");
  if(airTime>=crowdFire+9)airStory.Signal("P012StretcherLifted");
  airStory.Update(1/60,{p012Beat:18});
}
const AirVoice=(key)=>airSpoken.find(voice=>voice.key===key);
assert.ok(AirVoice("ch1_luo_13").time+AirVoice("ch1_luo_13").duration<railFire);
assert.ok(AirVoice("ch1_liuwencai_02").time>=railFire);
assert.ok(AirVoice("ch1_liuwencai_02").time+AirVoice("ch1_liuwencai_02").duration<railExit);
assert.ok(AirVoice("ch1_danjiayuan_04").time>=railExit);
assert.ok(AirVoice("ch1_danjiayuan_04").time+AirVoice("ch1_danjiayuan_04").duration<crowdFire);
assert.ok(AirVoice("ch1_yaowa_06").time-crowdFire<0.1,"crowd reaction starts at actual crowd fire");
assert.ok(AirVoice("ch1_heyoutian_06").time>=crowdFire+9,"long reaction accompanies actual carrying");
assert.equal(new Set(airSpoken.map(voice=>voice.key)).size,airSpoken.length,"repeated signals cannot repeat a voice");
assert.ok(airStory.fired.every(beat=>beat.level===phase.contentId),"immediate evidence retains the actual CH1 content ownership");
for(let i=1;i<airSpoken.length;i++)assert.ok(airSpoken[i].time>=airSpoken[i-1].time+airSpoken[i-1].duration,"recordings never overlap");
const staleStory=new StoryDirector({hud:{Say(){},Title(){}}});
const staleVoices=[];
staleStory.AttachVoice(({key})=>{staleVoices.push(key);return 2;});
staleStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
for(const signal of ["P012AircraftApproach","P012AircraftRailFire","P012AircraftRailExit","P012AircraftCrowdFire"])staleStory.Signal(signal);
staleStory.Update(0.1,{p012Beat:18});
assert.deepEqual(staleVoices,["ch1_yaowa_06"],"late callbacks discard expired vehicle/egress cues rather than playing them over the crowd");
assert.equal(staleStory.p012CueLog.filter(cue=>cue.expired).length,4);
const formalStory=new StoryDirector({hud:{Say(){},Title(){}}});
formalStory.BeginLevel(phase.contentId);
assert.equal(formalStory.p012Immediate.length,0,"formal story has no whitebox event lane");
assert.equal(formalStory.queue.length,CH1_CHAPTER.beats.length,"formal story order and count remain unchanged");
assert.equal(formalStory.P012Snapshot(),null);
assert.equal(formalStory.P012Restore({}),false,"formal checkpoint behaviour is unchanged");
const retryStory=new StoryDirector({hud:{Say(){},Title(){}}});
const retryVoices=[];
retryStory.AttachVoice(({key})=>{
  retryVoices.push(key); return CH1_VOICES.find(voice=>voice.key===key)?.dur || 0;
});
retryStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
retryStory.Signal("StretcherHandoff");
const beforeRequired=retryStory.P012Snapshot();
// Simulate a busy audio channel beyond the old 18-second deadline.
retryStory.sinceLast=-30;
for(let i=0;i<45*60;i++)retryStory.Update(1/60,{p012Beat:18});
assert.equal(retryVoices.filter(key=>key==="ch1_luo_17").length,1,"required interaction cue never expires while queued");
assert.equal(retryVoices.includes("ch1_heyoutian_06"),false,"casualty-ready alone cannot start carried-wounded reaction");
const afterRequired=retryStory.P012Snapshot();
const deliveredLedgerLength=retryStory.fired.length;
retryStory.levelTime=0;
assert.equal(retryStory.P012Restore(beforeRequired),true);
assert.equal(retryStory.fired.length,deliveredLedgerLength,"retry preserves the append-only ledger consumed by setpiece onVoice hooks");
for(let i=0;i<20*60;i++)retryStory.Update(1/60,{p012Beat:18});
assert.equal(retryVoices.filter(key=>key==="ch1_luo_17").length,1,"rewind cannot reissue the already-delivered interaction hook");
const pendingStory=new StoryDirector({hud:{Say(){},Title(){}}});
const pendingVoices=[];
pendingStory.AttachVoice(({key})=>{pendingVoices.push(key);return CH1_VOICES.find(voice=>voice.key===key)?.dur||0;});
pendingStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
pendingStory.levelTime=100;
pendingStory.P012Restore(beforeRequired);
assert.equal(pendingStory.p012SignalTimes.get("StretcherHandoff"),100,"signal ages rebase onto restored clock");
for(let i=0;i<10*60;i++)pendingStory.Update(1/60,{p012Beat:18});
assert.equal(pendingVoices.filter(key=>key==="ch1_luo_17").length,1,"saved pending interaction cue is not lost");
assert.equal(pendingStory.fired.filter(beat=>beat.voice==="ch1_luo_17").length,1,"pending required cue reaches the actual setpiece event ledger");
pendingStory.P012Restore(afterRequired);
pendingStory.Signal("StretcherHandoff");
for(let i=0;i<10*60;i++)pendingStory.Update(1/60,{p012Beat:18});
assert.equal(pendingVoices.filter(key=>key==="ch1_luo_17").length,1,"post-hook checkpoint is idempotent");
const returnStory=new StoryDirector({hud:{Say(){},Title(){}}});
const returnVoices=[];
returnStory.AttachVoice(({key})=>{returnVoices.push(key);return CH1_VOICES.find(voice=>voice.key===key)?.dur||0;});
returnStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
for(let i=0;i<120;i++)returnStory.Update(1,{p012Beat:23});
assert.equal(returnVoices.length,0,"elapsed return time cannot invent route calls or the ending exchange");
returnStory.Signal("P012RetreatCover0");
for(let i=0;i<12*60;i++)returnStory.Update(1/60,{p012Beat:23});
assert.ok(returnVoices.includes("ch1_luo_26"));
assert.ok(!returnVoices.includes("ch1_yaowa_10"),"no right-side threat is invented");
assert.ok(!returnVoices.includes("ch1_shangbing_04"));
returnStory.Signal("P012RegripReady");
for(let i=0;i<10*60;i++)returnStory.Update(1/60,{p012Beat:24});
assert.ok(returnVoices.includes("ch1_shangbing_04"));
assert.ok(!returnVoices.includes("ch1_shunzi_07"),"acknowledgement requires real regrip completion");
returnStory.Signal("P012Regripped");
for(let i=0;i<10*60;i++)returnStory.Update(1/60,{p012Beat:24});
assert.equal(returnVoices.filter(key=>key==="ch1_shunzi_07").length,1);
// Actual EscortColumn, four physical bearers: watching from the distant window
// permits only this bounded cover move, not a global follow-distance bypass.
{
  let time=0;const events=new Set(["P012AmbushStarted"]),actors=[];
  const host={Time:()=>time,PlayerPos:()=>({x:68,z:24}),Alive:actor=>actor.alive,PositionOf:actor=>actor.position,
    SpawnActor:({x,z})=>{const actor={alive:true,stance:0,position:{x,z},goal:{x,z}};actors.push(actor);return actor;},
    SetGoal:(actor,x,z)=>{actor.goal={x,z};}};
  const column=new EscortColumn(host,{waypoints:[{x:30,z:10},{x:31,z:12.2}],followRouteBodies:true,
    members:Array.from({length:4},()=>({role:"bearer"}))});
  column.Start();
  const identities=column.litters.map(litter=>[litter.front.handle,litter.rear.handle]);
  const context={phase,mem:{column},d:{host},Signal:name=>events.add(name)};
  StepP012RoadCover(context,name=>events.has(name));
  assert.ok(column.scriptPaused);assert.ok(actors.every(actor=>actor.stance===1));
  assert.equal(context.mem.p012RoadCoverMove.started,false);
  events.add("P012RoadGunSilenced");
  const before=actors.map(actor=>({...actor.position}));
  StepP012RoadCover(context,name=>events.has(name));
  assert.deepEqual(actors.map(actor=>actor.position),before,"starting the relocation does not teleport any bearer");
  assert.ok(column.scriptMoveWithoutEscort);assert.ok(actors.every(actor=>actor.stance===0));
  for(;time<40;time+=0.1){
    column.Update(0.1);
    for(const actor of actors){const dx=actor.goal.x-actor.position.x,dz=actor.goal.z-actor.position.z,d=Math.hypot(dx,dz);
      const step=Math.min(d,0.135);if(d>0){actor.position.x+=dx/d*step;actor.position.z+=dz/d*step;}}
    StepP012RoadCover(context,name=>events.has(name));
    if(events.has("P012RoadCoverReached"))break;
  }
  assert.ok(events.has("P012RoadCoverReached"),"first physical litter reaches its original spaced slots in visible cover");
  assert.equal(column.tailAdvanceM,0,"short cover move never compresses the trailing litter into the endpoint");
  assert.ok(Math.hypot(actors[0].position.x-actors[2].position.x,actors[0].position.z-actors[2].position.z)>3,"second litter retains longitudinal separation");
  assert.ok(column.scriptPaused);assert.equal(column.scriptMoveWithoutEscort,false);
  assert.deepEqual(column.waypoints.at(-1),phase.whitebox.activities.ambushColumnCoverRoute.at(-1));
  assert.ok(!events.has("P012AmbushClear")&&!events.has("P012AirReady"));
  assert.deepEqual(column.litters.map(litter=>[litter.front.handle,litter.rear.handle]),identities,"the same litter identities survive the move");
  events.add("P012AmbushClear");StepP012RoadCover(context,name=>events.has(name));
  assert.equal(column.scriptPaused,false);assert.equal(column.scriptMoveWithoutEscort,false);
  assert.equal(StepP012RoadCover({phase:{},mem:{column}},()=>true),false,"formal chapters do not opt in");
}
// Finite bounds use actual combat/movement facts, never elapsed time or invulnerability.
{
  const events=new Set(),actors=[],pressure=[];
  const director=new FirstLevelP012Director({Signalled:name=>events.has(name),Signal:name=>events.add(name),
    SpawnEnemy:spec=>{const actor={position:{x:spec.x,z:spec.z},alive:true};actors.push(actor);return actor;},
    EnemyPosition:actor=>actor.alive?actor.position:null,EnemyGoal:(actor,point)=>{actor.goal={x:point.x,z:point.z};},
    EnemyStaging:(actor,value)=>{actor.staging=value;},Pressure:wave=>pressure.push(wave.kind)},phase.whitebox);
  director.Restore({...director.Snapshot(),beat:18,spawnedTotal:21,unlockedWaves:[0,1,2,3,4,5]});
  const before=director.Snapshot(),sample={position:{x:47,z:80},zone:"Z08",carryKind:null};
  director.Update(.1,sample);assert.equal(actors.length,0,"being near the wounded does not pre-spawn before real lifting");
  events.add("P012StretcherLifted");director.Update(.1,sample);
  assert.equal(actors.length,6);assert.equal(director.spawnedTotal,27);
  assert.ok(actors.every(actor=>actor.staging));assert.deepEqual(pressure,[],"hidden staging is not recorded as active fire pressure");
  for(let index=0;index<3;index++)actors[index].position={...director.enemyRoutes[index].points[0]};
  director.Update(.1,sample);
  for(let index=0;index<3;index++)actors[index].position={...director.enemyRoutes[index].points[1]};
  director.Update(.1,sample);director.Update(30,sample);
  for(let index=0;index<3;index++)assert.deepEqual(actors[index].goal,director.enemyRoutes[index].points[1]);
  for(let index=3;index<6;index++)assert.deepEqual(actors[index].goal,director.enemyRoutes[index].spawnPoint);
  assert.deepEqual(pressure,[],"elapsed time cannot release staged enemies");
  actors[0].alive=false;events.add("P012DiveApproach");director.Update(.1,sample);
  assert.ok(actors.slice(1).every(actor=>!actor.staging));assert.equal(actors[0].alive,false,"a killed staged actor is never restored");
  assert.deepEqual(pressure,["closeFight"]);assert.equal(director.State().pressureHistory.at(-1).reason,"actualDiveApproach");
  director.Restore(before);director.Update(.1,sample);
  assert.equal(actors.length,6,"checkpoint rollback cannot duplicate the early finite wave receipt");
  assert.deepEqual(pressure,["closeFight"],"replayed approach cannot release a second pressure wave");
}
{
  const director=new FirstLevelP012Director({},phase.whitebox);
  director.Restore({...director.Snapshot(),beat:23,retreatPoint:5,facts:["retreatSmokeDeployed"]});
  const column={x:-4.8078,z:74.075};
  const update=position=>director.Update(.1,{position,columnPosition:column,stance:"stand",zone:"Z10"});
  update({x:-21.7998,z:27.8035});
  assert.equal(director.CurrentObjective().requiredAction,"follow","cover stance must not override actual rejoining");
  assert.deepEqual(director.CurrentObjective().target,{x:-18,z:50},"return via the intervening safe corner, not a diagonal to the litter");
  assert.equal(director.CurrentObjective().arrivalRadiusM,.6);
  assert.equal(director.retreatPoint,5,"rejoining does not consume the pending cover fact");
  update({x:-18,z:50});assert.deepEqual(director.CurrentObjective().target,{x:-8,z:72});
  update({x:-14,z:65});assert.equal(director.retreatRejoining,true,"hysteresis keeps rejoining in the 10–20 metre band");
  update({x:-8,z:72});assert.equal(director.retreatRejoining,false);
  const lead=director.CurrentObjective();
  assert.equal(lead.requiredAction,"follow","after reconnecting, lead the column nearby rather than sprinting back to the distant cover");
  assert.ok(director.RetreatRouteProjection(lead.target).along<=director.RetreatRouteProjection(column).along+10.01);
  assert.equal(director.retreatPoint,5);
  director.Restore({...director.Snapshot(),retreatPoint:12,retreatRejoining:true});
  director.Update(.1,{position:{x:4.98,z:-42.25},columnPosition:{x:-7,z:-37},lastLitterArrived:true,stance:"stand",zone:"Z10"});
  assert.equal(director.retreatRejoining,false,"parked litters cannot keep calling the player back");
  assert.deepEqual(director.CurrentObjective().target,{x:0,z:-52},"terminal route objective is restored after actual litter parking");
  assert.notEqual(director.CurrentObjective().requiredAction,"follow");
}
for(const index of [2,3,4]) {
  const pressures=[],actors=[];
  const director=new FirstLevelP012Director({Pressure:wave=>pressures.push(wave.kind),
    SpawnEnemy:spec=>{const actor={position:{x:spec.x,z:spec.z}};actors.push(actor);return actor;},
    EnemyPosition:actor=>actor.position},phase.whitebox);
  director.Restore({...director.Snapshot(),beat:P012_WAVES[index].beat,elapsed:129,lastWaveAt:100,
    unlockedWaves:Array.from({length:index},(_,i)=>i)});
  const sample={position:{x:23,z:-68},zone:"Z05",stance:"prone",enemyDeaths:0,mortarImpactCount:7,
    mortarWarningActive:true,mortarWarningPosition:{x:23,z:-68}};
  director.Update(.9,sample);
  assert.equal(actors.length,0,`${P012_WAVES[index].kind} cannot clear-bypass its 30s minimum`);
  assert.deepEqual(pressures,[],"no pressure callback or mortar blast warning before real wave release");
  if(index===3){assert.equal(director.mortarEscapeFrom,null);assert.ok(!director.CurrentObjective().text.includes("掷弹筒预警！"));}
  director.Update(.2,sample);
  assert.equal(actors.length,P012_WAVES[index].count);
  assert.deepEqual(pressures,[P012_WAVES[index].kind]);
  const event=director.State().pressureHistory.at(-1);
  assert.ok(event.interval>=30);assert.equal(event.reason,"clearMinimum30");assert.equal(event.mechanism,"newTacticalPressure");
  if(index===3){assert.ok(director.Signalled("P012MortarUnlocked"));assert.equal(director.mortarImpactStart,7);}
}
{
  const pressures=[];
  const director=new FirstLevelP012Director({Pressure:wave=>pressures.push(wave.kind),EnemyPosition:actor=>actor.position},phase.whitebox);
  director.Restore({...director.Snapshot(),beat:8,elapsed:139,lastWaveAt:100,unlockedWaves:[0,1]});
  director.enemyRoutes=[{handle:{position:{x:0,z:0}},points:[],index:0}];
  director.Update(.9,{position:{x:5,z:-65},zone:"Z05"});assert.equal(pressures.length,0);
  director.Update(.2,{position:{x:5,z:-65},zone:"Z05"});
  assert.deepEqual(pressures,["machineGun"]);
  assert.equal(director.State().pressureHistory.at(-1).reason,"normal40");
}
{
  for(const groups of [phase.whitebox.activities.closeFightGroups,phase.whitebox.activities.southFightGroups]) {
    assert.equal(groups.flatMap(group=>group.positions).length,6);
    assert.equal(groups.flatMap(group=>group.relocations).length,6);
    for(const group of groups) group.positions.forEach((point,index)=>{
      const next=group.relocations[index],distance=Math.hypot(next.x-point.x,next.z-point.z);
      assert.ok(distance>=2&&distance<2.3,"each existing actor receives only one short physical reposition");
    });
  }
  const actors=[0,1].map(x=>({position:{x,z:0},alive:true,lastFire:0,suppression:0}));
  const director=new FirstLevelP012Director({EnemyPosition:a=>a.alive?a.position:null,
    EnemyCombatState:a=>({lastFire:a.lastFire,suppression:a.suppression}),EnemyGoal:(a,p)=>{a.goal=p;}},phase.whitebox);
  director.enemyRoutes=actors.map((handle,encounterSlot)=>({handle,encounterSlot,encounterBeat:20,
    encounterGroup:0,index:1,points:[handle.position],relocation:{x:encounterSlot,z:3}}));
  const [cover,mover]=director.enemyRoutes,player={x:44,z:62};
  director.StepEnemyBound(cover,player);director.StepEnemyBound(mover,player);
  for(let i=0;i<100;i++){director.StepEnemyBound(cover,player);director.StepEnemyBound(mover,player);}
  assert.equal(mover.bound.phase,"cover","time alone cannot release a bound");
  actors[0].lastFire=10;director.StepEnemyBound(mover,player);
  assert.equal(mover.bound.reason,"coverFire");assert.equal(cover.bound.phase,"cover");
  actors[1].position={...mover.relocation};director.StepEnemyBound(mover,player);director.StepEnemyBound(cover,player);
  assert.equal(cover.bound.reason,"partnerSettled","cover shooter changes position only after partner actually arrives");
  const saved=director.Snapshot();director.Restore(saved);
  assert.equal(cover.bound.phase,"moving","checkpoint does not rewind live-world enemy bounds");
  mover.bound={phase:"cover",player,partnerFire:10};actors[1].suppression=.4;
  director.StepEnemyBound(mover,player);assert.equal(mover.bound.reason,"suppressed");
  mover.bound={phase:"cover",player,partnerFire:10};actors[1].suppression=0;actors[0].alive=false;
  director.StepEnemyBound(mover,player);assert.equal(mover.bound.reason,"partnerLost","a dead cover shooter cannot softlock its partner");
  actors[0].alive=true;mover.bound={phase:"cover",player,partnerFire:10};
  director.StepEnemyBound(mover,{x:47,z:62});assert.equal(mover.bound.reason,"playerRepositioned");
  assert.equal(actors.length,2,"bounds never spawn replacement enemies");
}
assert.equal(bandagesIssued,1,"only the first B11 receipt supplies one bandage, not B03/B15 or checkpoint restores");
for(const beat of [14,20,21]) {
  let resourceWrites=0;
  const director=new FirstLevelP012Director({GiveClips:()=>{resourceWrites++;},GiveBandages:()=>{resourceWrites++;},
    CheckWeapon:()=>{resourceWrites++;}},phase.whitebox);
  director.Restore({...director.Snapshot(),beat});
  director.lastSample={position:{x:44,z:62},ammo:0,clips:1,carryKind:null};
  const normal=director.CurrentObjective();
  assert.ok(!normal.text.includes("弹药耗尽"));
  director.lastSample.clips=0;
  const saved=director.Snapshot(),empty=director.CurrentObjective();
  assert.ok(empty.text.endsWith("弹药耗尽：到已清掩体旁靠近地上枪械，按 F 缴获（会替换当前枪弹）"));
  assert.deepEqual(empty.target,normal.target,"loot hint never directs the player to a hidden corpse");
  assert.equal(empty.interactionId,normal.interactionId);assert.equal(empty.requiredAction,normal.requiredAction);
  assert.deepEqual(director.Snapshot(),saved,"reading a low-ammo hint cannot mutate resource or mission state");
  director.lastSample.carryKind="stretcher";assert.ok(!director.CurrentObjective().text.includes("弹药耗尽"));
  director.lastSample.carryKind=null;director.lastSample.ammo=1;assert.ok(!director.CurrentObjective().text.includes("弹药耗尽"));
  assert.equal(resourceWrites,0);
}
points.get("p012_woundedCheck").OnComplete();
assert.equal(bandagesIssued,1,"repeated wounded callbacks cannot duplicate bandages");
console.log("FirstLevelP012FlowTest PASS: actions, ordered escort, flank, finite waves, aircraft facts and checkpoint replay");
