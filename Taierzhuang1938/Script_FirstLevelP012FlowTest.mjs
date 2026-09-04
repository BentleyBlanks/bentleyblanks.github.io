// P012实际状态机的纯Node宿主测试：用注册交互回调/玩家动作/正式信号驱动，不写beat跳关。
import assert from "node:assert/strict";
import { P012Point } from "./Data_FirstLevelP012Space.mjs";
import { FirstLevelP012Director, P012_WAVES, P012EastEnemyRejoinPath } from "./Script_FirstLevelP012Flow.mjs";
import { FIRST_LEVEL_P012_WHITEBOX_PHASE as phase } from "./Data_FirstLevelP012Whitebox.mjs";
import { CarrySystem } from "./Script_Carry.mjs";
import { AllowAutonomousBark } from "./Script_FirstLevelWhiteboxFlow.mjs";
import { StoryDirector } from "./Script_Story.mjs";
import { EscortColumn, StepP012RoadCover } from "./Script_MissionSetpieces.mjs";
import { VOICE_LINES as CH1_VOICES, CHAPTER as CH1_CHAPTER } from "./Data_MissionCh1.mjs";
import { existsSync, readFileSync } from "node:fs";
import { openingStoryBeats } from "./Data_FirstLevelP012Opening.mjs";
import { P012SegmentClear } from "./Script_FirstLevelP012March.mjs";
{
 const config=phase.whitebox,blocks=config.layout.blocks;
 const start={x:39.36023830793246,z:-136.07995752133593},target={x:32,z:-132};
 const actor={position:{...start},health:100,ammo:3,alive:true};let radius=.34,command=null;
 const calls=[];
 const director=new FirstLevelP012Director({EnemyBodyRadius:()=>radius,
  EnemyGoal:(handle,point)=>{assert.equal(handle,actor);command={...point};calls.push('goal');},
  EnemyRejoin:(handle,point)=>{assert.equal(handle,actor);calls.push(point?'rejoin':'release');},
 },config);
 const route={handle:actor,index:4,encounterBeat:9,points:config.routes.eastEnemy};
 const before={health:actor.health,ammo:actor.ammo,index:route.index};
 assert.equal(P012SegmentClear(blocks,start,target,radius),false,'recorded B09 actor is across the real east wall');
 const path=P012EastEnemyRejoinPath(config,start,target,radius,route.points);
 assert.ok(path?.length>1,'recorded coordinate requires a physical corner route');
 let at=start;for(const point of path){assert.ok(P012SegmentClear(blocks,at,point,radius));at=point;}
 assert.equal(P012EastEnemyRejoinPath(config,start,target,.42,route.points),null,'standing clearance cannot be claimed for prone capsule touching the wall');
 assert.equal(P012EastEnemyRejoinPath(config,start,target,undefined,route.points),null,'missing measured capsule is not guessed');
 assert.equal(director.StepEastEnemyRejoin({...route,encounterBeat:8},start),false,'other encounters are unaffected');
 let traveled=0,returned=false;
 for(let frame=0;frame<3000;frame++){
  if(!director.StepEastEnemyRejoin(route,actor.position)){returned=true;break;}
  assert.deepEqual(calls.slice(-2),['goal','rejoin'],'local hold goal is written before rejoin override');
  assert.ok(P012SegmentClear(blocks,actor.position,command,radius),'every issued leg uses the actual capsule');
  const distance=Math.hypot(command.x-actor.position.x,command.z-actor.position.z),step=Math.min(distance,2.6/30);
  actor.position.x+=(command.x-actor.position.x)*step/(distance||1);actor.position.z+=(command.z-actor.position.z)*step/(distance||1);traveled+=step;
 }
 assert.ok(returned&&traveled>DistanceForTest(start,target),'walks around the wall instead of through it');
 assert.equal(calls.at(-1),'release');assert.equal(route.rejoin,null);
 assert.deepEqual({health:actor.health,ammo:actor.ammo,index:route.index},before,'same actor, resources and route cursor survive reconnect');
 radius=.42;actor.position={...start};director.StepEastEnemyRejoin(route,actor.position);
 assert.equal(route.rejoin.blocked,true);assert.deepEqual(command,start,'insufficient clearance issues standstill, never a through-wall command');
 console.log('PASS B09 recorded east-wall reconnect preserves actor and facts with measured capsule clearance');
 function DistanceForTest(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
}

const points = new Map();
{
 const cues=phase.whitebox.storyBeats.filter(beat=>beat.voice?.startsWith("p012_text_Guide"));
 assert.equal(cues.length,4);
 for(const cue of cues){
  const shown=[],voices=[];
  const story=new StoryDirector({hud:{Say:(who,text)=>shown.push(text),Title(){}}});
  story.AttachVoice(({key})=>{voices.push(key);return 1;});
  story.BeginLevel(phase.contentId,{beats:cues,actualEventsOnly:true});
  story.Update(120,{p012Beat:23});
  assert.equal(shown.length,0,"elapsed time or chapter progress cannot invent guide arrival");
  story.Signal(cue.p012Immediate.event);story.Update(.01,{p012Beat:23});
  assert.deepEqual(shown,[cue.text],"actual guide arrival reaches the subtitle sink");
  story.Signal(cue.p012Immediate.event);story.Update(20,{p012Beat:23});
  assert.equal(shown.length,1,"arrival subtitle does not repeat every frame");
  assert.deepEqual(voices,[],"new guide cues are subtitle-only, never generated or borrowed voice");
 }
}
// Recorded VillageFrontlineCampaign failure: CP03 retry preserved B14 cursor5
// but the old public goal aimed straight through the ruin to the third nest.
{
 const config=phase.whitebox,blocks=config.layout.blocks,destination=config.routes.flank[5];
 const stuck={x:120.24068,z:38.25004};
 assert.equal(P012SegmentClear(blocks,stuck,destination,.42),false,"recorded stuck-to-goal ray still crosses real ruin walls");
 for(const initial of [config.activities.evacStagingPosition,{x:95,z:18}]){
  const actor={position:{...config.activities.ambushGroups[2].positions[0]}};
  const director=new FirstLevelP012Director({EnemyPosition:handle=>handle.position},config);
  director.beat=14;director.routeIndex=5;director.ambushEntryIndex=2;
  director.enemyRoutes=[{handle:actor,ambushGroup:2}];director.spawnedTotal=21;
  director.facts.add("volunteer");director.frontlineAmmoRemaining=4;
  const before={facts:[...director.facts],spawned:director.spawnedTotal,ammo:director.frontlineAmmoRemaining};
  const player={...initial};let travelled=0,started=false,finished=false;
  for(let frame=0;frame<2400;frame++){
   director.lastSample={position:player};director.StepAmbushRejoin(player);
   if(started&&!director.ambushRejoin){finished=true;break;}
   assert.ok(director.ambushRejoin,"checkpoint or non-death detour starts physical re-entry");started=true;
   const target=director.CurrentObjective().target;
   assert.ok(P012SegmentClear(blocks,player,target,.42),`public re-entry target must not cross a wall: ${JSON.stringify({player,target})}`);
   const distance=Math.hypot(target.x-player.x,target.z-player.z),step=Math.min(distance,3.05/60);
   player.x+=(target.x-player.x)*step/(distance||1);player.z+=(target.z-player.z)*step/(distance||1);travelled+=step;
   assert.equal(director.routeIndex,5);assert.equal(director.ambushEntryIndex,2);
   assert.deepEqual({facts:[...director.facts],spawned:director.spawnedTotal,ammo:director.frontlineAmmoRemaining},before);
  }
  assert.ok(finished&&Math.hypot(player.x-destination.x,player.z-destination.z)<=director.RouteArrivalRadius());
  assert.ok(travelled>Math.hypot(initial.x-destination.x,initial.z-destination.z),"physically rounds the walls, not a shortcut or teleport");
 }
 const direct=new FirstLevelP012Director({},config);direct.beat=14;direct.routeIndex=5;
 direct.StepAmbushRejoin(config.routes.flank[4]);assert.equal(direct.ambushRejoin,null,"normal visible next leg is unchanged");
}
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
let binocularOwned=false,northReactions=0,riflesReceived=0;
const flow = new FirstLevelP012Director({
  Register: (spec) => points.set(spec.id, spec), Carry: () => carry,
  Signal: (name) => signals.add(name), Signalled: (name) => signals.has(name),
  RestoreSignals: (list) => { restoredSignals = list; },
  CurrentClips: () => currentClips,
  GiveClips: (request) => { currentClips += request; return request; },
  GiveBandages: (request) => { bandagesIssued += request; return request; },
  CheckWeapon: () => { checkWeaponCalls++; },
  ReceiveWeapon: () => { riflesReceived++; return true; },
  SetBinocularsOwned:owned=>{binocularOwned=owned;},NorthNearMissReaction:()=>{northReactions++;},
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
let shelteredFromImpact=false;
flow.host.ShelteredFromImpact=()=>shelteredFromImpact;
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
assert.equal(flow.CurrentObjective().arrivalRadiusM,3,"opening follow publishes comfortable spacing without forcing the camera or attaching to the leader");
At("Z00", phase.whitebox.anchors.trainDoor);
assert.equal(flow.State().beat, "B00", "door proximity alone does not replace train traversal");
Walk(phase.whitebox.activities.trainRoute);
assert.equal(flow.State().beat,"B00","traversal cannot manufacture the physical arrival door signal");
signals.add("P012TrainDoor");Tick(); // Arrival controller is exercised in ArrivalTest.
assert.equal(flow.State().beat, "B01");
Use("p012_weaponCheck"); Tick();
assert.equal(flow.State().beat, "B01", "receiving a rifle still requires the single ammunition issue");
assert.equal(points.get("p012_weaponCheck").Enabled(),false,"rifle issue cannot be repeated");
assert.equal(points.get("p012_weaponCheck").OnComplete(),false,"stale repeated rifle completion is rejected");
assert.equal(riflesReceived,1,"exactly one rifle reaches the inventory host");
Use("p012_ammoIssue");
assert.equal(points.get("p012_ammoIssue").Enabled(),false,"ammunition issue cannot be repeated");
const issueCalls=checkWeaponCalls;
assert.equal(points.get("p012_ammoIssue").OnComplete(),false,"stale repeated ammunition completion is rejected");
assert.equal(checkWeaponCalls,issueCalls,"repeat completion cannot refill ammunition");
Tick({weaponActionCount:0,position:phase.whitebox.activities.weaponIssuePosition});
assert.equal(flow.State().beat,"B01","ammunition alone cannot skip the actual muster briefing");
const briefing=phase.whitebox.activities.briefing;
Tick({position:briefing.position,guidePosition:briefing.position,briefingReadyCount:2},120);
assert.equal(signals.has("P012BriefingStarted"),false,"elapsed time and gathered actors cannot replace the displayed muster call");
signals.add("P012MusterCalled");
Tick({briefingReadyCount:1});assert.equal(signals.has("P012BriefingStarted"),false,"one equipped teammate is insufficient");
Tick({briefingReadyCount:2,position:{x:briefing.position.x+30,z:briefing.position.z}});
assert.equal(signals.has("P012BriefingStarted"),false,"remote player cannot trigger briefing");
Tick({position:briefing.position,guidePosition:{x:briefing.position.x+5,z:briefing.position.z}});
assert.equal(signals.has("P012BriefingStarted"),false,"guide must actually reach muster location");
Tick({guidePosition:briefing.position});assert.equal(signals.has("P012BriefingStarted"),true);
Tick({},120);assert.equal(flow.State().beat,"B01","no timer fallback invents subtitle completion");
signals.add("P012MissionExplained");Tick();assert.equal(flow.State().beat,"B01");
signals.add("P012BriefingRouteExplained");Tick();assert.equal(flow.State().beat,"B01");
signals.add("P012BriefingComplete");Tick();
assert.equal(flow.State().beat,"B02","actual briefing completion permits departure with no obligatory R");
assert.equal(sample.weaponActionCount,0);
assert.equal(flow.State().checkpointId, "CP00");
const villageRoute = phase.whitebox.activities.villageRoute;
Tick({zone:"Z01",position:P012Point(70,100),guidePosition:villageRoute[2],guideRouteIndex:3,trafficReady:false});
assert.equal(flow.State().routeIndex,0,"a remote guide does not grant followed segments");
for (let i=0;i<villageRoute.length;i++) {
  const point=villageRoute[i];
  Tick({zone:"Z01",position:{x:point.x+3.1,z:point.z},guidePosition:{x:point.x+1.9,z:point.z},
    guideRouteIndex:Math.min(i+1,villageRoute.length-1),trafficReady:false});
}
assert.equal(flow.State().beat,"B03","following the physical village route proceeds without a hidden requirement to spot both traffic streams");
assert.equal(sample.trafficReady,false,"progress does not fabricate an opposing-traffic observation");
const issuedBeforeHub=checkWeaponCalls;
Tick({position:{x:12,z:0},guidePosition:{x:0,z:0},yaw:1.4});
assert.equal(points.has("p012_hubSupply"),false,"B03 does not register a second ammunition issue");
assert.equal(checkWeaponCalls,issuedBeforeHub,"entering the village cannot mint more clips");
assert.equal(flow.State().beat,"B03","elapsed time cannot substitute for joining the real guide");
assert.equal(points.has("p012_binocularTake"),false);
assert.equal(points.has("p012_binocularReturn"),false);
assert.equal(flow.CurrentObjective().interactionId,null);
assert.equal(flow.orientationIndex,0);
assert.equal(binocularOwned,false,"no binocular equipment is granted");
const hub=villageRoute.at(-1),exit=phase.whitebox.activities.shellCoverRoute[0];
assert.equal(P012SegmentClear(phase.whitebox.layout.blocks,hub,exit,.42),true,"production north exit is physically clear");
{
 const wall={x:0,z:-8,w:8,d:1,h:2,solid:true};
 const blocked=new FirstLevelP012Director({}, {...phase.whitebox,layout:{...phase.whitebox.layout,blocks:[...phase.whitebox.layout.blocks,wall]}});
 blocked.beat=3;
 blocked.Update(120,{position:hub,guidePosition:hub,guideAlive:true});
 assert.equal(blocked.State().beat,"B03","blocked exit cannot be bypassed by elapsed time or recognition flags");
 const remote=new FirstLevelP012Director({},phase.whitebox);remote.beat=3;
 remote.Update(120,{position:{x:12,z:0},guidePosition:hub,guideAlive:true,binocularRaised:true,northSubjectVisible:true,southSubjectVisible:true});
 assert.equal(remote.State().beat,"B03");assert.equal(remote.orientationIndex,0);
}
Tick({position:hub,guidePosition:hub,guideAlive:true,zone:"Z02"});
assert.equal(flow.State().beat,"B03","the actual hub briefing must finish before departure");
assert.ok(signals.has("P012HubBriefingStarted"));
assert.equal(flow.CurrentObjective().text,"听班长交代前沿位置与后送路","briefing text must not simultaneously order the player to leave");
signals.add("P012HubBriefed");Tick();
assert.ok(signals.has("P012VillageNorthDeparture"));
assert.equal(signals.has("P012NorthApproachChat"),false,"departure and roadside chat do not fire in the same update");
assert.equal(flow.State().beat,"B04");assert.equal(shelling,0);
assert.equal(flow.CurrentObjective().text,"跟随班长北上");
const northRoute=phase.whitebox.activities.shellCoverRoute;
Tick({position:northRoute[0],zone:"Z03",stance:"stand",guidePosition:northRoute[0]});
assert.ok(signals.has("P012NorthApproachChat"));assert.equal(shelling,0);
const a=northRoute[0],b=northRoute[1],length=Math.hypot(b.x-a.x,b.z-a.z);
Tick({position:{x:a.x+(b.x-a.x)*8/length,z:a.z+(b.z-a.z)*8/length}});assert.equal(shelling,0);
Tick({position:{x:a.x+(b.x-a.x)*11/length,z:a.z+(b.z-a.z)*11/length}});assert.equal(shelling,1);
assert.equal(northReactions,0);assert.equal(flow.CurrentObjective().text,"跟随班长北上","request is not an actual explosion");
Tick({mortarImpactCount:1});assert.equal(northReactions,1);
assert.ok(flow.CurrentObjective().text.includes("炮弹落在路旁"));
assert.equal(flow.CurrentObjective().requiredAction,"sprint","the cover goal is not overwritten by a generic crouch action");
Tick({position:northRoute[1],stance:"crouch"});
assert.equal(flow.facts.has("northCovered"),false,"crouching on the exposed route is not entering a ditch");
const shelter=phase.whitebox.activities.northShelterPosition;
Tick({position:shelter,stance:"crouch"});
assert.equal(flow.facts.has("northCovered"),false,"the right location without a real blocked ray is not cover");
assert.equal(flow.CurrentObjective().requiredAction,"crouch");
shelteredFromImpact=true;
Tick({position:shelter,stance:"stand"});
assert.equal(flow.facts.has("northCovered"),false,"standing in the refuge does not complete low-posture teaching");
Tick({position:shelter,stance:"crouch"});
assert.equal(flow.facts.has("northCovered"),true);
assert.ok(signals.has("P012NorthDitchEntered"));
for(const p of northRoute.slice(1))Tick({position:p,zone:"Z03",stance:"crouch",guidePosition:p});
At("Z04");assert.equal(shelling,1);assert.equal(northReactions,1);
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
assert.equal(flow.facts.has("supply"),false,"rewind does not invent the removed village supply fact");
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
Tick({position:P012Point(5,-65),mortarWarningActive:true,mortarWarningPosition:P012Point(5,-65)});
assert.equal(flow.CurrentObjective().requiredAction,"sprint","mortar escape starts with sprint, never slow prone crawling");
assert.equal(flow.CurrentObjective().requiredStance,"stand");
Tick({position:P012Point(-3,-65)});
assert.equal(flow.CurrentObjective().requiredStance,"prone","after actual six-metre escape the remaining transfer is prone");
Tick({position:phase.whitebox.anchors.gunports[0]});
assert.equal(flow.CurrentObjective().requiredStance,null,"arrival at a safe gunport permits standing to fire");
const mortarFightingSample=flow.lastSample;
flow.lastSample={...mortarFightingSample,nearEnemyDeaths:11,stance:"stand"};
assert.equal(flow.CurrentObjective().requiredStance,"prone","cleared mortar fight explicitly requests the low stance needed to finish relocation");
flow.lastSample=mortarFightingSample;
Tick({mortarImpactCount:(sample.mortarImpactCount||0)+1,mortarImpactPosition:P012Point(100,100)});
KillWave(); Tick({},40); KillWave();
assert.equal(flow.State().beat,"B11");
Use("p012_woundedCheck"); Tick();
assert.equal(flow.State().beat,"B11","wounded check cannot replace reloading");
Tick({weaponActionCount:sample.weaponActionCount+1}); At("Z04");
assert.equal(flow.State().beat,"B11","checking and loading do not replace physically dragging the wounded");
Walk(phase.whitebox.activities.woundedDragRoute,{carryKind:"wounded"});
Tick({carryKind:null,woundedDragDelivered:true,woundedDragDistance:34,guideAlive:false});
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
Tick({position:P012Point(42.5,24),zone:"Z07"});
assert.equal(flow.routeIndex,0,"three metre turn cutting cannot consume the courtyard corner");
assert.deepEqual(flow.CurrentObjective().target,P012Point(39,25.5),"safe entry directs the player into the existing blue firing cover, not across the exposed gap");
assert.equal(flow.CurrentObjective().arrivalRadiusM,phase.whitebox.activities.ambushRouteRadiusM);
assert.equal(flow.RouteArrivalRadius(),0.6);
Tick({position:P012Point(44.39,26),zone:"Z07"});
assert.equal(flow.routeIndex,0,"outside the public arrival radius remains at the corner");
assert.ok(signals.has("P012AmbushStarted"));
assert.equal(signals.has("P012RoadGunSilenced"),false,"live road shooters cannot release the litters");
assert.equal(new Set(ambushActors.map(actor=>`${actor.x},${actor.z}`)).size,6,"six ambushers exist at distinct positions before the flank");
Tick({position:P012Point(39,25.5),bleeding:1,bandages:1});
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
      Tick({position:P012Point(72,35)});
      assert.equal(flow.CurrentObjective().requiredStance,"prone","the verified east gallery stays low before the third firing nest");
      Tick({position:P012Point(72,40)});
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
const inspectionPoint=P012Point(50,46.3);
Tick({position:P012Point(50,47),columnPosition:P012Point(50,47),zone:"Z07",roadWoundedPosition:inspectionPoint,roadWoundedAtInspection:true});
assert.deepEqual(points.get("p012_roadWounded").Anchor(),inspectionPoint);
Use("p012_roadWounded"); Tick();
assert.ok(signals.has("P012RoadWoundedChecked"));
assert.equal(flow.State().beat,"B16","actual inspection releases B16 before the whole column reaches z60");
for(const zone of ["Z07",null]) {
  const director=new FirstLevelP012Director({},phase.whitebox);
  director.Restore({...director.Snapshot(),beat:15,facts:["regroup","roadWounded"]});
  director.Update(.1,{position:P012Point(50,47),columnPosition:P012Point(50,70),zone});
  assert.equal(director.State().beat,"B15","actual checked facts still require physical proximity to the column");
  director.Update(.1,{position:P012Point(50,47),columnPosition:P012Point(50,47),zone});
  assert.equal(director.State().beat,"B16","actual inspection and nearby column do not depend on a region-circle label");
}
assert.equal(signals.has("P012AirReady"),false,"one inspected litter cannot substitute for four bearers entering the road");
Tick({position:P012Point(54,57),columnPosition:P012Point(50,56),airColumnEnteredRoad:false,airColumnReady:false,sprint:0});
assert.equal(signals.has("P012AirReady"),false);
Tick({position:P012Point(54,60),columnPosition:P012Point(50,66),airColumnEnteredRoad:true});
assert.equal(signals.has("P012AirReady"),false,"four bearers entering does not replace the player's actual acceleration");
assert.equal(flow.CurrentObjective().requiredAction,"sprint");
Tick({position:P012Point(50,63),sprint:1});Tick({position:P012Point(50,66),sprint:1});
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
assert.deepEqual(closeActors.map(actor=>[actor.x,actor.z]),[[72,28],[72,30],[72,32],[72,61.5],[72,64],[72,66.5]].map(([x,z])=>Object.values(P012Point(x,z))),"six finite enemies start on screened northeast and southeast approaches");
assert.deepEqual(flow.enemyRoutes.slice(-6).map(entry=>entry.points[0]),[
  P012Point(74,30),P012Point(74,30),P012Point(74,30),P012Point(69,73),P012Point(69,73),P012Point(69,73)],"three actors physically follow each distinct approach without changing pair groups");
assert.deepEqual(flow.enemyRoutes.slice(-6).map(entry=>entry.encounterGroup),[0,0,1,1,2,2]);
assert.equal(flow.CurrentObjective().requiredAction,"fight");
assert.deepEqual(flow.CurrentObjective().target,P012Point(44,62));
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
for(let z=-40;z>=-52;z-=3) Tick({position:P012Point(-7,z)});
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
{
  const shown=[],story=new StoryDirector({hud:{Say(who,text,seconds){shown.push({text,seconds});},Title(){}}});
  story.BeginLevel(phase.contentId,{beats:openingStoryBeats,actualEventsOnly:true});
  for(let i=0;i<1200;i++)story.Update(.1,{p012Beat:1});
  assert.equal(shown.length,0);assert.equal(story.Signalled("P012MusterCalled"),false);
  story.Signal("P012AmmoIssued");
  for(let i=0;i<100&&!story.Signalled("P012MusterCalled");i++)story.Update(.1,{p012Beat:1});
  assert.equal(shown.length,1);assert.equal(story.Signalled("P012MusterCalled"),true);
  assert.equal(story.Signalled("P012BriefingComplete"),false);
  story.Signal("P012BriefingStarted");
  const completed=[];
  for(let i=0;i<240;i++){
    story.Update(.1,{p012Beat:1});
    for(const signal of ["P012MissionExplained","P012BriefingRouteExplained","P012BriefingComplete"])
      if(story.Signalled(signal)&&!completed.includes(signal))completed.push(signal);
  }
  assert.equal(shown.length,4,"muster, mission, route and reply actually reach the subtitle sink");
  assert.deepEqual(completed,["P012MissionExplained","P012BriefingRouteExplained","P012BriefingComplete"]);
  assert.deepEqual(shown.map(cue=>cue.seconds),[5,6.5,6,4],"each real completion follows its own displayed subtitle duration");
}
openingStory.AttachVoice(({key})=>{spoken.push(key);return 0.1;});
openingStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
openingStory.Update(100,{p012Beat:0});
assert.equal(spoken.length,0,"opening speech requires actual arrival rather than elapsed time");
for(const event of ["P012Arrival","P012TrainDoor","P012WeaponReceived","P012AmmoIssued"]){
  openingStory.Signal(event);openingStory.Update(10,{p012Beat:1});
}
assert.deepEqual(spoken,["ch0_luo_08"],"arrival uses its own quiet subtitles, while gun issue retains its checked-in recording");
openingStory.Signal("P012AmmoTask");
for(let i=0;i<4;i++)openingStory.Update(10,{p012Beat:5});
assert.equal(phase.whitebox.storyBeats.filter(beat=>beat.voice==="ch1_luo_01").length,0,"old one-line ammo departure is replaced by the actual muster briefing");
for(const voice of ["ch1_heyoutian_01","ch1_shunzi_01","ch1_luo_05"]){
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
{
 const said=[],voices=[];
 const audition=new StoryDirector({hud:{Say:(who,text)=>said.push(text),Title(){}}});
 audition.AttachVoice(({key})=>{voices.push(key);return 12;});
 audition.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
 audition.Update(.016,{p012Beat:4});assert.equal(said.length,0,"no chat or impact before real event");
 audition.Signal("P012VillageNorthDeparture");audition.Update(.016,{p012Beat:3});
 assert.match(said.at(-1),/北口/);
 audition.Signal("P012NorthApproachChat");audition.Update(1/60,{p012Beat:4});
 assert.match(said.at(-1),/子弹捂好/,"actual chat replaces stale recognition subtitle within one frame");
 const count=said.length;audition.Update(.1,{p012Beat:4});assert.equal(said.length,count,"impact is not predicted by time");
 audition.Signal("P012NorthNearMissImpact");audition.Update(1/60,{p012Beat:4});
 assert.match(said.at(-1),/卧倒/,"actual impact immediately interrupts active chat");
 for(let i=0;i<20;i++)audition.Update(1,{p012Beat:4});
 assert.equal(said.length,count+1,"expired north/south/return subtitles never replay after impact");
 assert.equal(voices.length,0,"audition interruption never calls voice playback");
 const exchange=[];
 const chatStory=new StoryDirector({hud:{Say:(who,text)=>exchange.push(text),Title(){}}});
 chatStory.AttachVoice(()=>{throw new Error("subtitle exchange must not request audio");});
 chatStory.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
 chatStory.Signal("P012NorthApproachChat");chatStory.Update(.016,{p012Beat:4});
 chatStory.Update(2.79,{p012Beat:4});assert.equal(exchange.length,1,"first line retains its 2.8 second reading time");
 chatStory.Update(.02,{p012Beat:4});assert.match(exchange.at(-1),/家当/,"reply follows normally without a gameplay wait");
 chatStory.Update(2.87,{p012Beat:4});assert.equal(exchange.length,2);
 chatStory.Signal("P012NorthNearMissImpact");chatStory.Update(1/60,{p012Beat:4});
 assert.match(exchange.at(-1),/卧倒/,"5.7-second physical impact interrupts the still-visible reply");
 for(let i=0;i<8;i++)chatStory.Update(1,{p012Beat:4});assert.equal(exchange.length,3);
 const recorded=new StoryDirector({hud:{Say:(who,text)=>said.push(text),Title(){}}});
 recorded.AttachVoice(()=>12);
 recorded.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
 recorded.Play({type:"line",text:"recorded dialogue",voice:"existing"},false);
 recorded.Signal("P012NorthApproachChat");recorded.Update(1/60,{p012Beat:4});
 assert.equal(said.at(-1),"recorded dialogue","subtitle override cannot interrupt a real recording");
}
formalStory.BeginLevel(phase.contentId);
{
 const said=[];
 const savedApproval=new StoryDirector({hud:{Say(){},Title(){}}});
 savedApproval.AttachVoice(()=>4);
 savedApproval.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
 savedApproval.Play({type:"line",text:"required approval",voice:"ch1_luo_08",p012CompleteSignal:"P012EscortApproved"},false);
 savedApproval.Update(1,{p012Beat:12});
 const snapshot=savedApproval.P012Snapshot();
 const restored=new StoryDirector({hud:{Say:(who,text)=>said.push(text),Title(){}}});
 restored.BeginLevel(phase.contentId,{beats:phase.whitebox.storyBeats,actualEventsOnly:true});
 restored.levelTime=100;restored.Signal("P012VillageNorthDeparture");restored.Update(.016,{p012Beat:3});
 assert.ok(restored.p012SubtitleActiveUntil>100,"real old-clock subtitle is still on screen");
 restored.levelTime=0;restored.P012Restore(snapshot);
 assert.equal(restored.p012SubtitleActiveUntil,0,"rewind discards the old absolute subtitle deadline");
 assert.equal(said.at(-1),"required approval");
 restored.Signal("P012NorthApproachChat");restored.Update(.016,{p012Beat:12});
 assert.equal(said.at(-1),"required approval","interruptible chat cannot replace restored approval");
 assert.equal(restored.Signalled("P012EscortApproved"),false);
 restored.Update(2.97,{p012Beat:12});
 assert.equal(restored.Signalled("P012EscortApproved"),false,"restored approval retains its remaining duration");
 restored.Update(.02,{p012Beat:12});
 assert.equal(restored.Signalled("P012EscortApproved"),true);
 assert.match(said.at(-1),/子弹捂好/,"queued chat may play after the approval completes");
}
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
  const host={Time:()=>time,PlayerPos:()=>(P012Point(68,24)),Alive:actor=>actor.alive,PositionOf:actor=>actor.position,
    SpawnActor:({x,z})=>{const actor={alive:true,stance:0,position:{x,z},goal:{x,z}};actors.push(actor);return actor;},
    SetGoal:(actor,x,z)=>{actor.goal={x,z};}};
  const column=new EscortColumn(host,{waypoints:[P012Point(30,10),P012Point(31,12.2)],followRouteBodies:true,
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
  const before=director.Snapshot(),sample={position:P012Point(47,80),zone:"Z08",carryKind:null};
  director.Update(.1,sample);assert.equal(actors.length,0,"being near the wounded does not pre-spawn before real lifting");
  events.add("P012StretcherLifted");director.Update(.1,sample);
  assert.equal(actors.length,6);assert.equal(director.spawnedTotal,27);
  assert.ok(actors.every(actor=>actor.staging));assert.deepEqual(pressure,[],"hidden staging is not recorded as active fire pressure");
  for(let waypoint=0;waypoint<=2;waypoint++){
    for(let index=0;index<3;index++)actors[index].position={...director.enemyRoutes[index].points[waypoint]};
    director.Update(.1,sample);
  }
  director.Update(.1,sample);director.Update(30,sample);
  for(let index=0;index<3;index++)assert.deepEqual(actors[index].goal,director.enemyRoutes[index].points[2]);
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
  const retreat=phase.whitebox.routes.retreat;
  director.Restore({...director.Snapshot(),beat:23,retreatPoint:8,facts:["retreatSmokeDeployed"]});
  const column=retreat[5];
  const behindColumn=distance=>{const next=retreat[6],length=Math.hypot(next.x-column.x,next.z-column.z);
    return {x:column.x+(next.x-column.x)*distance/length,z:column.z+(next.z-column.z)*distance/length};};
  const update=position=>director.Update(.1,{position,columnPosition:column,stance:"stand",zone:"Z10"});
  update(retreat[7]);
  assert.equal(director.CurrentObjective().requiredAction,"follow","cover stance must not override actual rejoining");
  assert.deepEqual(director.CurrentObjective().target,retreat[6],"return via the intervening safe corner, not a diagonal to the litter");
  assert.equal(director.CurrentObjective().arrivalRadiusM,.6);
  assert.equal(director.retreatPoint,8,"rejoining does not consume the pending cover fact");
  update(retreat[6]);assert.deepEqual(director.CurrentObjective().target,column);
  update(behindColumn(15));assert.equal(director.retreatRejoining,true,"hysteresis keeps rejoining in the 10–20 metre band");
  update(behindColumn(8));assert.equal(director.retreatRejoining,false);
  const lead=director.CurrentObjective();
  assert.equal(lead.requiredAction,"follow","after reconnecting, lead the column nearby rather than sprinting back to the distant cover");
  assert.ok(director.RetreatRouteProjection(lead.target).along<=director.RetreatRouteProjection(column).along+10.01);
  assert.equal(director.retreatPoint,8);
  director.Restore({...director.Snapshot(),retreatPoint:retreat.length-1,retreatRejoining:true});
  director.Update(.1,{position:P012Point(4.98,-42.25),columnPosition:phase.whitebox.activities.regripPosition,lastLitterArrived:true,stance:"stand",zone:"Z10"});
  assert.equal(director.retreatRejoining,false,"parked litters cannot keep calling the player back");
  assert.notDeepEqual(director.CurrentObjective().target,retreat[2],"parked column never sends the player to a missed historical cover");
  assert.equal(director.CurrentObjective().requiredAction,"follow");
}
{
  const holds=[];
  const director=new FirstLevelP012Director({HoldRetreatForCover:value=>holds.push(value)},phase.whitebox);
  const route=phase.whitebox.routes.retreat,cover=route[2];
  director.Restore({...director.Snapshot(),beat:23,retreatPoint:1,facts:["retreatSmokeDeployed","retreatSmokeObserved"]});
  const sample={position:route[0],columnPosition:cover,stance:"stand",zone:"Z10"};
  director.Update(.1,sample);
  assert.equal(holds.at(-1),true,"real column waits at its first pending cover while player rejoins");
  assert.deepEqual(director.retreatCovers,[],"waiting creates no cover facts");
  director.Update(.1,{...sample,position:cover});
  assert.equal(director.CurrentObjective().requiredAction,"crouch","at actual stopped column, follow gives way to low cover action");
  assert.deepEqual(director.retreatCovers,[],"standing cannot complete cover");
  director.Update(.1,{...sample,position:cover,stance:"crouch"});
  assert.deepEqual(director.retreatCovers,[2]);
  assert.equal(holds.at(-1),false,"actual cover immediately releases the physical column");
  const saved=director.Snapshot();director.Restore(saved);
  assert.equal(holds.at(-1),false,"restore releases stale world hold before recomputation");
  const parked=phase.whitebox.activities.regripPosition;
  director.Update(.1,{...sample,columnPosition:parked,lastLitterArrived:true,columnArrived:true});
  assert.equal(director.beat,23,"arrival alone cannot invent the missing cover or guard action");
  assert.deepEqual(director.retreatCovers,[2]);
  assert.equal(holds.at(-1),false);
  director.Update(.1,{...sample,position:parked,columnPosition:parked,lastLitterArrived:true,columnArrived:true,zone:"Z04"});
  assert.equal(director.beat,23,"standing at parked litter cannot complete recovery");
  director.Update(.1,{...sample,position:parked,columnPosition:parked,lastLitterArrived:true,columnArrived:true,zone:"Z04",stance:"crouch"});
  assert.equal(director.beat,24);
  assert.deepEqual(director.retreatCovers,[2],"safe arrival recovery does not backfill historical cover events");
  assert.equal(director.completionReasons[23],"escortArrivedBeforeCover");
  assert.equal(holds.at(-1),false,"exit releases hold");
}
for(const index of [2,3,4]) {
  const pressures=[],actors=[];
  const director=new FirstLevelP012Director({Pressure:wave=>pressures.push(wave.kind),
    SpawnEnemy:spec=>{const actor={position:{x:spec.x,z:spec.z}};actors.push(actor);return actor;},
    EnemyPosition:actor=>actor.position},phase.whitebox);
  director.Restore({...director.Snapshot(),beat:P012_WAVES[index].beat,elapsed:129,lastWaveAt:100,
    unlockedWaves:Array.from({length:index},(_,i)=>i)});
  const sample={position:P012Point(23,-68),zone:"Z05",stance:"prone",enemyDeaths:0,mortarImpactCount:7,
    mortarWarningActive:true,mortarWarningPosition:P012Point(23,-68)};
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
  director.enemyRoutes=[{handle:{position:P012Point(0,0)},points:[],index:0}];
  director.Update(.9,{position:P012Point(5,-65),zone:"Z05"});assert.equal(pressures.length,0);
  director.Update(.2,{position:P012Point(5,-65),zone:"Z05"});
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
  const [cover,mover]=director.enemyRoutes,player=P012Point(44,62);
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
  director.StepEnemyBound(mover,P012Point(47,62));assert.equal(mover.bound.reason,"playerRepositioned");
  assert.equal(actors.length,2,"bounds never spawn replacement enemies");
}
assert.equal(bandagesIssued,1,"only the first B11 receipt supplies one bandage, not B03/B15 or checkpoint restores");
for(const beat of [14,20,21]) {
  let resourceWrites=0;
  const director=new FirstLevelP012Director({GiveClips:()=>{resourceWrites++;},GiveBandages:()=>{resourceWrites++;},
    CheckWeapon:()=>{resourceWrites++;}},phase.whitebox);
  director.Restore({...director.Snapshot(),beat});
  director.lastSample={position:P012Point(44,62),ammo:0,clips:1,carryKind:null};
  const normal=director.CurrentObjective();
  assert.ok(!normal.text.includes("步枪打空"));
  director.lastSample.clips=0;
  const saved=director.Snapshot(),empty=director.CurrentObjective();
  assert.ok(empty.text.endsWith("步枪打空：留意倒下士兵的枪械，靠近按 F 缴获（替换当前枪弹）"));
  assert.deepEqual(empty.target,normal.target,"loot hint never directs the player to a hidden corpse");
  assert.equal(empty.interactionId,normal.interactionId);assert.equal(empty.requiredAction,normal.requiredAction);
  assert.deepEqual(director.Snapshot(),saved,"reading a low-ammo hint cannot mutate resource or mission state");
  director.lastSample.grenades=6;
  const withGrenades=director.CurrentObjective();
  assert.ok(withGrenades.text.endsWith("步枪打空，尚有6枚手榴弹：按住 G 准备，松开投出"));
  assert.ok(!withGrenades.text.includes("按 F 缴获"),"available throwables take precedence over an unseen pickup");
  assert.deepEqual(withGrenades.target,normal.target,"resource advice never invents a new destination");
  assert.equal(withGrenades.requiredAction,normal.requiredAction);
  assert.deepEqual(director.Snapshot(),saved,"throwable advice cannot create resources or advance the encounter");
  director.lastSample.grenades=0;assert.ok(director.CurrentObjective().text.endsWith("（替换当前枪弹）"));
  director.lastSample.carryKind="stretcher";assert.ok(!director.CurrentObjective().text.includes("步枪打空"));
  director.lastSample.carryKind=null;director.lastSample.ammo=1;assert.ok(!director.CurrentObjective().text.includes("步枪打空"));
  assert.equal(resourceWrites,0);
}
points.get("p012_woundedCheck").OnComplete();
assert.equal(bandagesIssued,1,"repeated wounded callbacks cannot duplicate bandages");
{
 const actors=[],modes=[],goals=[];
 const director=new FirstLevelP012Director({
  SpawnEnemy:spec=>{const actor={...spec,alive:true,position:{x:spec.x,z:spec.z},perception:{}};actors.push(actor);return actor;},
  EnemyPosition:actor=>actor.alive?actor.position:null,
  EnemyScoutState:actor=>actor.perception,
  EnemyScoutMode:(actor,mode)=>{actor.mode=mode;modes.push(mode);},
  EnemyGoal:(actor,goal)=>{actor.goal=goal;goals.push({...goal});},
 },phase.whitebox);
 director.beat=6;director.unlockedWaves=[0];director.SpawnWave(P012_WAVES[0],0);
 const beforeContact=director.Snapshot(),search=phase.whitebox.firstContact.scoutSearch;
 assert.equal(actors.length,2,"scout search owns exactly the existing two finite actors");
 const gunport=phase.whitebox.anchors.gunports[1];
 for(let frame=0;frame<600;frame++)for(const route of director.enemyRoutes){
  const actor=route.handle;assert.equal(director.StepScoutSearch(route,actor.position),true);
  const dx=actor.goal.x-actor.position.x,dz=actor.goal.z-actor.position.z,d=Math.hypot(dx,dz),step=Math.min(d,actor.mode.speedMps*.1);
  if(d){actor.position.x+=dx/d*step;actor.position.z+=dz/d*step;}
  const range=Math.hypot(actor.position.x-gunport.x,actor.position.z-gunport.z);
  assert.ok(range>=45&&range<=60,"unalerted search never approaches inside the first-contact distance band");
 }
 assert.ok(actors.every(actor=>actor.mode.searching&&actor.mode.speedMps===search.speedMps));
 assert.ok(director.enemyRoutes.every(route=>!route.scout.alerted),"elapsed time alone cannot alert scouts");
 actors[0].perception={detectedPlayer:true};
 assert.equal(director.StepScoutSearch(director.enemyRoutes[0],actors[0].position),false);
 assert.equal(director.State().scouts[0].reason,"detectedPlayer");
 assert.equal(actors[0].mode.speedMps,search.approachSpeedMps);
 assert.ok(director.enemyRoutes[0].points.at(-1).z>actors[0].position.z,"actual detection connects to the approach lane");
 actors[1].perception={hit:true};director.StepScoutSearch(director.enemyRoutes[1],actors[1].position);
 assert.equal(director.State().scouts[1].reason,"hit");
 actors[0].alive=false;director.Restore(beforeContact);
 director.Update(.1,{position:gunport,enemyDeaths:1});
 assert.equal(actors.length,2);assert.equal(actors[0].alive,false,"checkpoint never replaces a killed scout");
 assert.equal(director.State().scouts[1].reason,"hit","world alert state survives a player-only rewind");
 const alarmRoute={handle:actors[1],points:search.entries[1].points,index:0,scout:{approach:[gunport],alerted:false}};
 actors[1].perception={alarmed:true};director.StepScoutSearch(alarmRoute,actors[1].position);
 assert.equal(alarmRoute.scout.reason,"alarmed","real squad alarm is an independent transition");
 const {FIRST_LEVEL_P012_LAYOUT:layout}=await import("./Data_FirstLevelP012Layout.mjs");
 function Blocked(point,radius=.42){return layout.blocks.some(box=>{
  if(box.solid===false||box.y-box.h/2>1.8||box.y+box.h/2<=.05)return false;
  const dx=point.x-box.x,dz=point.z-box.z,c=Math.cos(box.ry),s=Math.sin(box.ry);
  return Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-box.w/2),Math.max(0,Math.abs(dx*s+dz*c)-box.d/2))<radius;
 });}
 for(const entry of search.entries){const path=[entry.spawn,...entry.points];
  for(let leg=1;leg<path.length;leg++)for(let sample=0;sample<=100;sample++){
   const a=path[leg-1],b=path[leg],point={x:a.x+(b.x-a.x)*sample/100,z:a.z+(b.z-a.z)*sample/100};
   assert.equal(Blocked(point),false,"scout reveal/search is a real collision-clear lateral walk");
  }
 }
}
console.log("FirstLevelP012FlowTest PASS: actions, ordered escort, flank, finite waves, aircraft facts and checkpoint replay");
