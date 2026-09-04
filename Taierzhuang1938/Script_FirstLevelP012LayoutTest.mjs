// Pure Node geometry audit: OBB/circle sweep, not merely a constants check.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {P012Point,P012NorthPoint,P012SouthPoint,P012MapPoints} from "./Data_FirstLevelP012Space.mjs";
import {FIRST_LEVEL_P012_LAYOUT as layout,P012_ROUTES as routes,P012_ZONES as zones,P012_ANCHORS as anchors,P012_SEMANTIC_COLORS as colors,P012_ENEMY_LANES as lanes} from "./Data_FirstLevelP012Layout.mjs";
import {TRAVERSAL,TraversalKind} from "./Data_Traversal.mjs";
import {FirstLevelP012Director} from "./Script_FirstLevelP012Flow.mjs";
import {FIRST_LEVEL_P012_WHITEBOX_PHASE as phase} from "./Data_FirstLevelP012Whitebox.mjs";
function FootY(layout,p) {
 let y=0;
 for(const b of layout.walkableSurfaces||[]){
  const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.ry||0),s=Math.sin(b.ry||0);
  if(Math.abs(dx*c-dz*s)<=b.w/2&&Math.abs(dx*s+dz*c)<=b.d/2)y=Math.max(y,b.y+b.h/2);
 }
 return y;
}
function Hits(p,b,r=1.3) {
 const foot=FootY(layout,p);
 if(b.solid===false||b.y-b.h/2>foot+1.8||b.y+b.h/2<=foot+0.05)return false;
 const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.ry),s=Math.sin(b.ry);
 const x=dx*c-dz*s,z=dx*s+dz*c;
 return Math.hypot(Math.max(0,Math.abs(x)-b.w/2),Math.max(0,Math.abs(z)-b.d/2))<r;
}
function Audit(name,route,obstacles,r=1.3){
 let length=0,samples=0;
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],distance=Math.hypot(b.x-a.x,b.z-a.z);length+=distance;
  for(let j=0;j<=Math.ceil(distance/0.2);j++){
   const k=j/Math.ceil(distance/0.2),p={x:a.x+(b.x-a.x)*k,z:a.z+(b.z-a.z)*k};
   const hits=obstacles.filter(block=>Hits(p,block,r));
   assert.equal(hits.length,0,`${name} at ${p.x.toFixed(2)},${p.z.toFixed(2)}: ${hits.map(b=>b.id)}`);samples++;
  }
 }
 console.log(`${name}: ${length.toFixed(1)}m, ${samples} swept samples, radius ${r}m clear`);return length;
}
assert.equal(zones.length,11);assert.deepEqual(zones[2].x,0);assert.equal(zones[5].z,P012NorthPoint(5,-80).z);
const escortGateBars=layout.gates.filter(b=>b.id.startsWith("HubEscortGate"));
assert.equal(escortGateBars.length,15,"escort gate is a see-through physical grille");
for(let index=1;index<escortGateBars.length;index++) {
 const left=escortGateBars[index-1],right=escortGateBars[index];
 const gap=right.z-right.d/2-(left.z+left.d/2);
 assert.ok(gap>0.3&&gap<0.68,"grille admits sight but not the narrowest player capsule");
 assert.equal(right.signal,"EscortCall","every bar opens and restores with the same story signal");
}
// Sweep all three actual stance radii across the closed former solid panel.
for(const radius of [0.34,0.42])for(let z=3.77;z<=10.63;z+=0.05)
 assert.ok(escortGateBars.some(b=>Hits({x:23,z},b,radius)),"no stance-sized passage through closed grille");
assert.equal(layout.ground.y+layout.ground.h/2,0);
// Analytic GroundHeight owns flat-floor contact. A second solid at y=0 makes
// Rapier spawn overlap rejection eject the player from the carriage.
for(const block of layout.blocks.filter(b=>b.semantic==="ground"&&b.y+b.h/2===0))assert.equal(block.solid,false,`${block.id} duplicates analytic floor collision`);
for(const b of layout.blocks)assert.ok(colors[b.semantic]!==undefined,`${b.id} semantic`);
assert.ok(!layout.blocks.some(b=>b.id==="StationWindowSill"),"obsolete carriage window removed");
const ruinSill=layout.blocks.find(b=>b.id==="RuinWindowSill"),ruinLintel=layout.blocks.find(b=>b.id==="RuinWindowLintel");
assert.equal(ruinSill.semantic,"cover","low-headroom window must not advertise a guaranteed vault");
assert.ok(ruinLintel.y-ruinLintel.h/2-(ruinSill.y+ruinSill.h/2)<1.78,"window cannot fit the standing vault capsule above its sill");
const routePaint=layout.blocks.filter(b=>/^(North|South|Retreat|Flank|TrainExit)Route\d+$/.test(b.id));
for(const paint of routePaint){
 assert.equal(paint.solid,false,"route paint never changes collision");
 assert.equal(paint.y+paint.h/2,paint.semantic==="stretcherRoute"?.045:.025,"route semantic fixes its visual depth layer");
}
for(const kind of ["step","vault","mantle"]){const b=layout.blocks.find(b=>b.semantic===kind);assert.equal(TraversalKind(b.h),kind);}
for(const p of [anchors.weaponCheck,anchors.ammoPickup,anchors.ammoDrop,...anchors.gunports,anchors.scout,anchors.stretcher])assert.ok(!layout.blocks.some(b=>Hits(p,b,0.4)),`anchor ${JSON.stringify(p)} buried`);
assert.ok(Audit("NorthInitial",routes.north,[...layout.blocks,...layout.gates])>190,"north route has actual expanded depth");
Audit("CarriageDoorToEquipment",routes.trainExit,layout.blocks,0.4);
for(const [index,entry] of phase.whitebox.activities.traffic.entries())Audit(`OpeningTraffic${index}`,entry.route,layout.blocks,0.42);
assert.ok(!layout.blocks.some(b=>Hits(anchors.trainSpawn,b,0.4)));
assert.equal(FootY(layout,anchors.trainSpawn),1.25,"spawn stands on the occupied middle carriage floor");
const occupiedFloor=layout.blocks.find(b=>b.id==="StationCar1Floor");
assert.ok(Math.abs(anchors.trainSpawn.x-occupiedFloor.x)<occupiedFloor.w/2&&Math.abs(anchors.trainSpawn.z-occupiedFloor.z)<occupiedFloor.d/2);
const stairPoints=[{x:occupiedFloor.x,z:61},...Array.from({length:5},(_,i)=>layout.blocks.find(b=>b.id===`StationExitStep${i}`))];
const stairHeights=stairPoints.map(p=>FootY(layout,p));
assert.deepEqual(stairHeights,[1.25,1,.75,.5,.25,0],"all actual descending tread heights are sampled, not the carriage roof");
for(let i=1;i<stairHeights.length;i++)assert.ok(stairHeights[i-1]-stairHeights[i]<=TRAVERSAL.stepMax);
Audit("ActualEastStairDescent",stairPoints,layout.blocks,.4);
const stationApron=layout.blocks.find(block=>block.id==="StationPlatformApron");
assert.ok(stationApron.y+stationApron.h/2<.025-.005,"grey station apron cannot z-fight the green route paint");
const sidingRails=layout.blocks.filter(block=>/^StationLoadingSidingRail-?1$/.test(block.id));
assert.equal(sidingRails.length,2);
assert.equal((sidingRails[0].x+sidingRails[1].x)/2,-72);
assert.ok(sidingRails.every(rail=>Math.abs(rail.z-rail.d/2-123)<.001),"turnout has a continuous loading siding after its southern end");
assert.ok(layout.blocks.some(block=>block.id==="StationLoadingSidingBuffer"&&block.z>165),"loading siding has a visible terminal buffer");
const stationRails=layout.blocks.filter(b=>/^StationRail-?1$/.test(b.id));
assert.equal(stationRails.length,2);
assert.equal((stationRails[0].x+stationRails[1].x)/2,occupiedFloor.x,"railway axis matches all carriages");
for(const floor of layout.blocks.filter(b=>/^StationCar\dFloor$/.test(b.id)))assert.equal(floor.x,occupiedFloor.x);
const outerLips=layout.blocks.filter(b=>/^Horizon(West|East|North|South)Lip\d+$/.test(b.id));
assert.ok(outerLips.length>=4,"distant earth edges exist on all sides");
for(const b of outerLips){
 const dx=anchors.trainSpawn.x-b.x,dz=anchors.trainSpawn.z-b.z,c=Math.cos(b.ry||0),s=Math.sin(b.ry||0);
 const distance=Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-b.w/2),Math.max(0,Math.abs(dx*s+dz*c)-b.d/2));
 assert.ok(distance>200,`${b.id} is a distant earth edge, not a wall beside the station (${distance.toFixed(1)}m)`);
}
assert.ok(Audit("StretcherSouth",routes.south,layout.blocks)>310,"south route includes the long cross-region connection");
const returnLength=Audit("StretcherReturn",routes.retreat,layout.blocks);assert.ok(returnLength>150);
const activityRoutes={weaponIssue:[P012MapPoints({x:-55,z:44}),P012MapPoints({x:-55,z:34}),P012MapPoints({x:-45,z:34}),P012MapPoints({x:-43,z:40})],
 orientations:phase.whitebox.activities.orientations.flatMap(point=>point.via?[point.via,point.position]:[point.position]),
 shellCover:phase.whitebox.activities.shellCoverRoute,
 ammo:phase.whitebox.activities.ammoRoute,
 finalCarry:[P012MapPoints({x:-7,z:-37}),P012MapPoints({x:-7,z:-45}),P012MapPoints({x:-7,z:-52})]};
for(const [name,route] of Object.entries(activityRoutes))Audit(`Activity_${name}`,route,layout.blocks);
Audit("FinalRegripApproach",[P012MapPoints({x:5,z:-46}),P012MapPoints({x:-7,z:-37})],layout.blocks);
for(const offset of [-2,2])Audit(`TrafficLane${offset}`,routes.north.slice(2,8).map(p=>({x:p.x+offset,z:p.z})),layout.blocks,0.4);
for(const state of layout.scenario.states){
 const geometry=[...layout.blocks.filter(b=>!layout.scenario.replaceBlockIds.includes(b.id)),...state.blocks];
 Audit(`${state.id}South`,routes.south,geometry);
 Audit(`${state.id}Return`,routes.retreat,geometry);
 for(const [name,route] of Object.entries(activityRoutes))Audit(`${state.id}_Activity_${name}`,route,geometry);
}
const flankLength=Audit("HouseFlank",routes.flank,layout.blocks,0.4);assert.ok(flankLength/2>=35&&flankLength/2<=50);
const cornerFlow=new FirstLevelP012Director({},phase.whitebox);cornerFlow.beat=14;
const cornerRadius=cornerFlow.RouteArrivalRadius();
assert.equal(cornerFlow.CurrentObjective().arrivalRadiusM,cornerRadius,"HUD and route consumption share the same arrival tolerance");
assert.ok(cornerRadius<=.6);
const oldShortcut=[P012MapPoints({x:42.5,z:24}),P012MapPoints({x:58,z:24})];
assert.ok(Array.from({length:201},(_,i)=>({x:oldShortcut[0].x+(oldShortcut[1].x-oldShortcut[0].x)*i/200,z:oldShortcut[0].z})).some(p=>layout.blocks.some(b=>b.id==="EvacWindowScreen"&&Hits(p,b,.42))),"regression reproduces the old public 3m early-turn wall collision");
assert.ok(Math.hypot(42.5-45,24-26)>cornerRadius,"actual early-turn position is not an arrived corner");
// Sweeping radius(player)+radius(arrival) covers every segment joining points
// inside the endpoint arrival discs, not just the ideal waypoint centerline.
Audit("PublicB14ArrivalEnvelope",[P012MapPoints({x:42.5,z:24}),...routes.flank],layout.blocks,.42+cornerRadius);
Audit("HouseFightCoverBypassPlayerEnvelope",routes.flank.slice(0,-3),layout.blocks,.42+cornerRadius);
const ruinFights=[{at:P012MapPoints({x:58,z:24}),enemies:[P012MapPoints({x:58,z:39}),P012MapPoints({x:57,z:41})]},{at:P012MapPoints({x:68,z:24}),enemies:[P012MapPoints({x:68,z:34}),P012MapPoints({x:70,z:36})]},{at:P012MapPoints({x:72,z:43}),enemies:[P012MapPoints({x:67,z:49}),P012MapPoints({x:70,z:49})]}];
const lateFights=[{at:P012MapPoints({x:44,z:62}),enemies:phase.whitebox.activities.closeFightGroups.flatMap(group=>group.positions)},...phase.whitebox.activities.southFightGroups.map(group=>({at:group.cover,enemies:group.positions}))];
Audit("LateFightSupplyLink",[P012MapPoints({x:44,z:62}),P012MapPoints({x:44,z:66}),P012MapPoints({x:47,z:80}),P012MapPoints({x:42,z:94})],layout.blocks,1.3);
Audit("SouthRoomClearRoute",phase.whitebox.activities.southRoomRoute,layout.blocks,1.3);
const southApproach=[phase.whitebox.activities.closeFightRoute[0],...phase.whitebox.activities.southRoomRoute];
const frontlineRetry=P012MapPoints({x:3.32966,z:-43.11849});
assert.ok(Array.from({length:501},(_,i)=>({x:frontlineRetry.x+(anchors.gunports[0].x-frontlineRetry.x)*i/500,z:frontlineRetry.z+(anchors.gunports[0].z-frontlineRetry.z)*i/500}))
 .some(p=>layout.blocks.some(b=>b.id==="ReverseSlopeWest"&&Hits(p,b,.42))),"old CP01 to west gunport guidance crosses the reverse slope");
for(const beat of [6,7,8,9,10]) {
 const director=new FirstLevelP012Director({},phase.whitebox);director.beat=beat;
 const goal=anchors.gunports[beat===8?2:beat===10?0:1];
 const before=JSON.stringify(director.Snapshot());let point=frontlineRetry;const path=[point];
 for(let hop=0;hop<8&&Math.hypot(point.x-goal.x,point.z-goal.z)>.01;hop++) {
  director.lastSample={position:point,clips:1};
  const objective=director.CurrentObjective();
  assert.equal(objective.arrivalRadiusM,.6);assert.equal(objective.requiredAction,"move");
  point=objective.target;path.push(point);
 }
 assert.deepEqual(point,goal,`B${beat} retry rejoins its actual gunport`);
 Audit(`FrontlineRetry${beat}`,path,layout.blocks,.42+.6);
 director.lastSample={position:goal,clips:1};director.CurrentObjective();
 assert.equal(director.frontlineApproaching,false,"normal battle guidance resumes at the gunport");
 assert.equal(JSON.stringify(director.Snapshot()),before,"frontline guidance does not change progress, resources or enemy receipts");
 director.lastSample={position:frontlineRetry,clips:0};
 assert.equal(director.CurrentObjective().interactionId,"p012_frontlineAmmo","actual supply interaction retains priority");
}
const retryFlow=new FirstLevelP012Director({},phase.whitebox);retryFlow.beat=21;retryFlow.routeIndex=5;
const retrySnapshot=JSON.stringify(retryFlow.Snapshot());
assert.equal(retryFlow.RouteArrivalRadius(),.6);
Audit("SouthRetryArrivalEnvelope",southApproach,layout.blocks,.42+retryFlow.RouteArrivalRadius());
const oldRetryTarget=P012MapPoints({x:34,z:104.4}),retrySpawn=P012MapPoints({x:44,z:62});
// The old return bank has moved with the macro route. Recovery below must still
// traverse the actual public approach without rewinding any completed room leg.
assert.ok(Math.hypot(oldRetryTarget.x-retrySpawn.x,oldRetryTarget.z-retrySpawn.z)>40);
for(const beat of [21,22]) {
 retryFlow.beat=beat;
 const route=retryFlow.ActivityRoute();
 for(let index=0;index<route.length;index++) {
  retryFlow.routeIndex=index;retryFlow.lastSample={position:retrySpawn};
  let point=retrySpawn;const recovered=[point],budget=route.length+southApproach.length+2;
  for(let hop=0;hop<budget;hop++) {
   retryFlow.lastSample={position:point};
   const objective=retryFlow.CurrentObjective();
   assert.equal(objective.arrivalRadiusM,.6,"player-facing tolerance matches swept geometry");
   if(Math.hypot(point.x-route[index].x,point.z-route[index].z)<.01)break;
   point=objective.target;recovered.push(point);
  }
  assert.deepEqual(point,route[index],`B${beat} route ${index} recovers from CP05`);
  assert.equal(retryFlow.routeIndex,index,"navigation never rewinds room progress");
  Audit(`B${beat}Retry${index}`,recovered,layout.blocks,.42+.6);
 }
}
retryFlow.beat=21;retryFlow.routeIndex=5;retryFlow.lastSample={position:southApproach[2]};
assert.deepEqual(retryFlow.CurrentObjective().target,southApproach[3],"walking back along the road retains forward corner guidance");
assert.equal(JSON.stringify(retryFlow.Snapshot()),retrySnapshot,"guidance does not mutate facts, enemies, checkpoint or resources");
for(const [i,goal] of lateFights[0].enemies.entries())Audit(`RearguardArrival${i}`,[P012SouthPoint(72,54+i*2.5),P012MapPoints({x:69,z:73}),P012MapPoints({x:64,z:73}),P012MapPoints({x:64,z:67}),goal],layout.blocks,.42);
const ruinCovers=layout.blocks.filter(b=>/^Ruin.*FightCover$/.test(b.id));
assert.equal(ruinCovers.length,3);
for(const b of ruinCovers)assert.ok(b.semantic==="cover"&&b.h>=.9&&b.h<=1.05);
for(const fight of [...ruinFights,...lateFights]){
 assert.ok(!layout.blocks.some(b=>Hits(fight.at,b,.42)));
 for(const enemy of fight.enemies){
  assert.ok(!layout.blocks.some(b=>Hits(enemy,b,.42)));
  for(const height of (ruinFights.includes(fight)?[.42,.8,1.62]:[.42,1.62])){
   let blocked=false;
   for(let sample=0;sample<=500;sample++){
    const k=sample/500,p={x:fight.at.x+(enemy.x-fight.at.x)*k,z:fight.at.z+(enemy.z-fight.at.z)*k},eye=height+(1.5-height)*k;
    if(layout.blocks.some(b=>b.y-b.h/2<eye&&b.y+b.h/2>eye&&Hits(p,b,.01)))blocked=true;
   }
   assert.equal(blocked,height<1,`ruin fight ${JSON.stringify(fight.at)} eye/torso ${height} versus ${JSON.stringify(enemy)}`);
  }
 }
}
Audit("ConnectedGunports",routes.gunports,layout.blocks,0.42);
const closeGunports=routes.gunports.map(p=>({x:p.x,z:p.z-.8}));
Audit("GunportTransitClose",closeGunports,layout.blocks,0.42);
const breastwork=layout.blocks.filter(b=>b.id.startsWith("Gunport")&&b.semantic==="cover");
assert.equal(breastwork.length,5);
for(const block of breastwork)assert.ok(block.h<=1.05&&block.solid!==false);
// Check real sloping enemy-eye rays, not a constant-height plan-view line.
// A prone head remains screened throughout both exposed lateral gaps; a
// standing player's sight stays above every breastwork segment.
for(const route of [routes.gunports,closeGunports])for(let segment=1;segment<route.length;segment++){
 const a=route[segment-1],b=route[segment];
 for(let step=0;step<=100;step++){
  const t=step/100,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  for(const enemy of [...lanes.west.terminalGoals,P012MapPoints({x:-25,z:-83}),lanes.center.goal,lanes.east.goal,lanes.machineGun.goal]){
   let screened=false;
   for(let sample=0;sample<=500;sample++){
    const k=sample/500,q={x:p.x+(enemy.x-p.x)*k,z:p.z+(enemy.z-p.z)*k},eye=.45+(1.5-.45)*k;
    if(breastwork.some(block=>eye<block.y+block.h/2&&Hits(q,block,.01)))screened=true;
   }
   assert.ok(screened,`prone transit exposed at ${JSON.stringify(p)} to ${JSON.stringify(enemy)}`);
  }
 }
}
const sight=Math.hypot(anchors.scout.x-anchors.gunports[1].x,anchors.scout.z-anchors.gunports[1].z);assert.ok(sight>=45&&sight<=60);
const mgDistance=Math.hypot(lanes.machineGun.goal.x-anchors.gunports[2].x,lanes.machineGun.goal.z-anchors.gunports[2].z);
assert.ok(mgDistance>=60&&mgDistance<=80,`MG final firing position ${mgDistance.toFixed(2)}m must stay at 60–80m, not only spawn there`);
function SightClear(a,b,height){
 for(let i=0;i<=500;i++){
  const k=i/500,p={x:a.x+(b.x-a.x)*k,z:a.z+(b.z-a.z)*k};
  assert.ok(!layout.blocks.some(block=>block.solid!==false&&block.y-block.h/2<height&&block.y+block.h/2>height&&Hits(p,{...block,y:0.5,h:1},0.01)),`sight blocked at ${JSON.stringify(p)}`);
 }
}
function SegmentBlocked(from,to){
 return layout.blocks.some(b=>{
  if(b.solid===false)return false;
  const c=Math.cos(b.ry),s=Math.sin(b.ry),local=p=>[(p.x-b.x)*c-(p.z-b.z)*s,p.y-b.y,(p.x-b.x)*s+(p.z-b.z)*c];
  const a=local(from),end=local(to),half=[b.w/2,b.h/2,b.d/2];let low=0,high=1;
  for(let axis=0;axis<3;axis++){
   const delta=end[axis]-a[axis];
   if(Math.abs(delta)<1e-8){if(Math.abs(a[axis])>half[axis])return false;}
   else{const t=(-half[axis]-a[axis])/delta,u=(half[axis]-a[axis])/delta;low=Math.max(low,Math.min(t,u));high=Math.min(high,Math.max(t,u));if(low>high)return false;}
  }
  return true;
 });
}
// These are real visibility pockets, not merely HUD group indices. Later
// shooters remain damageable but their bodies are behind solid partitions.
const southGroups=phase.whitebox.activities.southFightGroups;
const sideShotCases=[
 {name:"B14",center:{x:99,z:25.5},radius:1,actual:{x:99.708,z:25.066},enemy:{x:129.5,y:1.5,z:35.5}},
 {name:"B21",center:{x:102,z:94},radius:.6,actual:{x:102.124,z:93.635},enemy:{x:86.221,y:1.5,z:97.445}},
];
for(const scenario of sideShotCases){
 const points=[scenario.actual,scenario.center];
 for(let ring=1;ring<=5;ring++)for(let angle=0;angle<72;angle++)points.push({
  x:scenario.center.x+scenario.radius*ring/5*Math.cos(angle*Math.PI/36),
  z:scenario.center.z+scenario.radius*ring/5*Math.sin(angle*Math.PI/36)});
 const currentEnemies=scenario.name==="B14"?phase.whitebox.activities.ambushGroups[0].positions:southGroups[0].positions;
 for(const point of points){
  assert.ok(!layout.blocks.some(box=>Hits(point,box,.42)),`${scenario.name} arrival capsule is clear`);
  assert.ok(SegmentBlocked({...point,y:.42},scenario.enemy),`${scenario.name} actual side-fire arrival shelter at ${point.x},${point.z}`);
  for(const enemy of currentEnemies)assert.ok(!SegmentBlocked({...point,y:1.62},{...enemy,y:1.5}),`${scenario.name} current group remains shootable across arrival tolerance`);
 }
}
// This is the player's side excursion, not the convoy route (audited above at 1.3m).
Audit("B14WaitingExitArrivalEnvelope",[P012SouthPoint(39,25.5),P012SouthPoint(45,26)],layout.blocks,1.02);
assert.equal(southGroups.reduce((total,group)=>total+group.positions.length,0),6);
for(const [index,group] of southGroups.entries()) {
 assert.deepEqual(phase.whitebox.activities.southRoomRoute[group.routeIndex],group.cover);
 for(const enemy of [...group.positions,...group.relocations]) {
  assert.ok(!SegmentBlocked({...group.cover,y:1.62},{...enemy,y:1.5}),`B21 pocket ${index} standing fire is open`);
  assert.ok(SegmentBlocked({...group.cover,y:.42},{...enemy,y:1.5}),`B21 pocket ${index} prone body is sheltered`);
 }
 for(const later of southGroups.slice(index+1))for(const enemy of [...later.positions,...later.relocations])
  assert.ok(SegmentBlocked({...group.cover,y:1.62},{...enemy,y:1.5}),`B21 pocket ${index} screens later groups`);
}
Audit("B21ReturnToAssembly",phase.whitebox.activities.southAssemblyRoute,layout.blocks,1.3);
Audit("InjuredRoadCoverAccess",[P012MapPoints({x:42.5,z:24}),P012MapPoints({x:39,z:25.5}),P012MapPoints({x:45,z:26})],layout.blocks,1.02);
for(let i=0;i<360;i++){
 const point=P012SouthPoint(39+.6*Math.cos(i*Math.PI/180),25.5+.6*Math.sin(i*Math.PI/180));
 assert.ok(!layout.blocks.some(b=>Hits(point,b,.42)));
 for(const enemy of [P012MapPoints({x:58,y:1.5,z:39}),P012MapPoints({x:57,y:1.5,z:41})]){
  assert.ok(SegmentBlocked({...point,y:.42},enemy),"existing waiting cover protects an injured prone player before the exposed road transfer");
  assert.ok(!SegmentBlocked({...point,y:1.62},enemy),"standing at the waiting cover still exposes a real firing angle");
 }
}
let relocationCount=0;
for(const key of ["closeFightGroups","southFightGroups"]){
 const groups=phase.whitebox.activities[key];
 assert.equal(groups.length,3,`${key} keeps three finite pairs`);
 for(const [groupIndex,group] of groups.entries()){
  assert.equal(group.positions.length,2);assert.equal(group.relocations.length,2);
  for(const [index,to] of group.relocations.entries()){
   const from=group.positions[index],label=`${key}_${groupIndex}_${index}`;
   Audit(`RelocationEnvelope_${label}`,[from,to],layout.blocks,1.02);
   for(let sample=0;sample<=100;sample++){
    const t=sample/100,enemy={x:from.x+(to.x-from.x)*t,y:1.5,z:from.z+(to.z-from.z)*t};
    assert.ok(!SegmentBlocked(enemy,{...group.cover,y:1.62}),`${label} must remain a genuinely shootable moving enemy`);
    assert.ok(SegmentBlocked(enemy,{...group.cover,y:.42}),`${label} must retain the player's real prone shelter through its whole move`);
   }
   relocationCount++;
  }
 }
}
assert.equal(relocationCount,12,"B20/B21 geometry audits every configured relocation, not a stale copied coordinate list");
for(const [groupIndex,group] of phase.whitebox.activities.closeFightGroups.entries()) {
 for(const [index,approach] of group.approaches.entries()) {
  const route=[group.spawns[index],...approach,group.positions[index]];
  Audit(`CloseApproach_${groupIndex}_${index}`,route,layout.blocks,1.02);
  for(let leg=1;leg<route.length;leg++)assert.ok(Math.hypot(route[leg].x-route[leg-1].x,route[leg].z-route[leg-1].z)<=12,
   "scripted close approaches stay below coarse-navigation activation, including arrival tolerance");
  if(group.stagingStopIndices[index]>=0)assert.ok(approach[group.stagingStopIndices[index]].z>=45,
   "northern staging stop remains behind the intended firing approach, not the new intermediate waypoint");
 }
}
for(const [index,route] of phase.whitebox.activities.retreatPursuitRoutes.entries()) {
 Audit(`RetreatPursuit_${index}`,route,layout.blocks,1.02);
 for(let leg=1;leg<route.length;leg++)assert.ok(Math.hypot(route[leg].x-route[leg-1].x,route[leg].z-route[leg-1].z)<=10.001,
  "pursuers use the real ditch entry and short navigation legs, never cut through its new bank");
}
const ambushEnemies=[P012MapPoints({x:58,y:1.5,z:39}),P012MapPoints({x:57,y:1.5,z:41}),P012MapPoints({x:68,y:1.5,z:34}),P012MapPoints({x:70,y:1.5,z:36}),P012MapPoints({x:67,y:1.5,z:49}),P012MapPoints({x:70,y:1.5,z:49})];
const shelteredTransfers=[{name:"RoadPocketEarlyProne",a:P012MapPoints({x:56.5,z:24.23077}),b:P012MapPoints({x:58,z:24}),first:0,axis:"z"},
 {name:"NorthToEastProne",a:P012MapPoints({x:68,z:24}),b:P012MapPoints({x:72,z:24}),first:4,axis:"z"},
 {name:"EastCorridorProne",a:P012MapPoints({x:72,z:24}),b:P012MapPoints({x:72,z:43}),first:4,axis:"x"}];
for(const segment of shelteredTransfers){
 const exposed={};
 for(const y of [.42,1.05,1.62]){
  let count=0;
  for(let sample=0;sample<=100;sample++)for(const offset of [-.2,0,.2]){
   const t=sample/100,p={x:segment.a.x+(segment.b.x-segment.a.x)*t,y,z:segment.a.z+(segment.b.z-segment.a.z)*t};p[segment.axis]+=offset;
   if(ambushEnemies.slice(segment.first).some(enemy=>!SegmentBlocked(p,enemy)))count++;
  }
  exposed[y]=count;
 }
 assert.equal(exposed[.42],0,`${segment.name} must protect a real prone-width lane`);
 assert.ok(exposed[1.05]>0&&exposed[1.62]>0,`${segment.name} must not misleadingly promise standing/crouched head protection`);
 console.log(`${segment.name}: exposed samples per 303, prone/crouch/stand ${exposed[.42]}/${exposed[1.05]}/${exposed[1.62]}`);
}
for(const sample of [{...P012SouthPoint(57.3419,24.0851),enemy:P012MapPoints({x:58,y:1.5,z:39})},{...P012SouthPoint(71.971,33.671),enemy:P012MapPoints({x:70,y:1.5,z:49})}]){
 assert.ok(SegmentBlocked({...sample,y:.42},sample.enemy),"recorded later B14 wound point must be protected when prone");
 assert.ok(!SegmentBlocked({...sample,y:1.62},sample.enemy),"standing fire at recorded wound point remains real exposure");
}
// Audit every transfer, including arrival-disc edges, under the actual staged
// living groups. Exposure is reported, not disguised as universally safe cover.
for(let index=1;index<routes.flank.length;index++){
 const a=routes.flank[index-1],b=routes.flank[index],remaining=index===1?ambushEnemies:index===2?ambushEnemies.slice(2):index<=5?ambushEnemies.slice(4):[];
 const counts=[];
 for(const y of [.42,1.05,1.62]){
  let exposed=0;
  for(let step=0;step<=20;step++)for(let angle=0;angle<8;angle++){
   const t=step/20,theta=angle*Math.PI/4,p={x:a.x+(b.x-a.x)*t+Math.cos(theta)*cornerRadius,y,z:a.z+(b.z-a.z)*t+Math.sin(theta)*cornerRadius};
   if(remaining.some(enemy=>!SegmentBlocked(p,enemy)))exposed++;
  }
  counts.push(exposed);
 }
 console.log(`B14 transfer ${index}: live=${remaining.length}, exposed prone/crouch/stand per 168: ${counts.join("/")}`);
}
Audit("ConvoyWindowAdvance",[P012MapPoints({x:30,z:10}),P012MapPoints({x:34,z:18.8})],layout.blocks,1.3);
for(let sample=0;sample<=100;sample++){
 const t=sample/100;
 for(const side of [-.6,0,.6])for(const y of [.7,1.5])for(const enemy of [P012MapPoints({x:68,y:1.5,z:34}),P012MapPoints({x:70,y:1.5,z:36})])
  assert.ok(SegmentBlocked(enemy,{...P012SouthPoint(30+4*t+side*.910366,10+8.8*t-side*.413803),y}),"convoy short advance and litter half-width must not emerge into indoor fire");
}
for(const x of [58,68])for(const y of [.7,1.5])assert.ok(!SegmentBlocked({...P012SouthPoint(x,24),y:1.62},P012MapPoints({x:34,y,z:18.8})),"window must reveal actual convoy, including low stretcher");
for(const x of [58,68])assert.ok(!SegmentBlocked({...P012SouthPoint(x,24),y:1.62},{...P012SouthPoint(34-1.1*.413803,18.8-1.1*.910366),y:.7}),"first physical litter trails lead bearer 1.1m and must still be visible");
SightClear(anchors.gunports[1],anchors.scout,1.62);
SightClear(anchors.gunports[2],lanes.machineGun.goal,1.62);
SightClear(P012MapPoints({x:68,z:34}),anchors.stretcher,1.62);
const partition=layout.blocks.find(b=>b.id==="RuinCrossfirePartition");
assert.deepEqual([partition.x,partition.z,partition.w,partition.d,partition.h],[P012SouthPoint(67,40).x,P012SouthPoint(67,40).z,7,.5,2.2]);
assert.equal(partition.semantic,"boundary");
// Include the public arrival-disc uncertainty, not just the exact blue-pocket
// centers: the previous narrow partition exposed x62.253,z24.002 mid-transfer.
for(let step=0;step<=100;step++)for(let angle=0;angle<72;angle++){
 const theta=angle*Math.PI/36;
 for(const y of [1.62,1.05])for(const enemy of [P012MapPoints({x:67,y:1.5,z:49}),P012MapPoints({x:70,y:1.5,z:49})])
  assert.ok(SegmentBlocked({...P012SouthPoint(58+step*.1+Math.cos(theta)*cornerRadius,24+Math.sin(theta)*cornerRadius),y},enemy),"rear pair must not crossfire the entire public B14 transfer envelope");
}
for(const y of [1.62,1.05])assert.ok(SegmentBlocked(P012MapPoints({x:62.253,y,z:24.002}),P012MapPoints({x:67,y:1.5,z:49})),"actual 644.95s torso-hit position is screened");
for(const from of [P012MapPoints({x:68,z:24}),P012MapPoints({x:68.23,z:23.93}),P012MapPoints({x:66.42,z:23.99})]){
 for(const enemy of [P012MapPoints({x:68,z:34}),P012MapPoints({x:70,z:36})])SightClear(from,enemy,1.62);
 for(const enemy of [P012MapPoints({x:67,z:49}),P012MapPoints({x:70,z:49})]){
  let screened=false;
  for(let i=0;i<=1000;i++){
   const t=i/1000,p={x:from.x+(enemy.x-from.x)*t,z:from.z+(enemy.z-from.z)*t},eye=1.62+(1.5-1.62)*t;
   if(eye<partition.y+partition.h/2&&Hits(p,partition,.001))screened=true;
  }
  assert.ok(screened,`second firing pocket ${JSON.stringify(from)} must screen southern crossfire`);
 }
}
for(const enemy of [P012MapPoints({x:67,z:49}),P012MapPoints({x:70,z:49})])SightClear(P012MapPoints({x:72,z:43}),enemy,1.62);
Audit("RuinPartitionBypass",[P012MapPoints({x:72,z:30}),P012MapPoints({x:72,z:43})],layout.blocks,.42+cornerRadius);
for(const point of anchors.blockadePositions){
 assert.ok(!layout.blocks.some(b=>Hits(point,b,.42)));
 assert.ok(Math.hypot(point.x-P012SouthPoint(42,98).x,point.z-P012SouthPoint(42,98).z)>=28);
 SightClear(P012MapPoints({x:42,z:98}),point,1.62);
}
for(let index=0;index<6;index++){
 const from=P012MapPoints({x:44,z:62}),to=P012SouthPoint(72,54+index*2.5);let blocked=false;
 for(let sample=0;sample<=500;sample++){
  const k=sample/500,p={x:from.x+(to.x-from.x)*k,z:from.z+(to.z-from.z)*k};
  if(layout.blocks.some(b=>b.y-b.h/2<1.62&&b.y+b.h/2>1.62&&Hits(p,b,.01)))blocked=true;
 }
 assert.ok(blocked,`B20 spawn ${index} must arrive from behind real geometry`);
}
for(const [name,lane] of Object.entries(lanes)){
 Audit(`${name}EnemyApproach`,lane.waypoints,layout.blocks,0.4);
 for(const gunport of anchors.gunports){
  let blocked=false;
  for(let i=0;i<=500;i++){
   const k=i/500,p={x:gunport.x+(lane.spawn.x-gunport.x)*k,z:gunport.z+(lane.spawn.z-gunport.z)*k};
   if(layout.blocks.some(b=>b.y-b.h/2<1.62&&b.y+b.h/2>1.62&&Hits(p,b,0.01)))blocked=true;
  }
  assert.ok(blocked,`${name} spawn visible from gunport`);
 }
}
for(const [index,goal] of lanes.west.terminalGoals.entries()){
 const distance=Math.hypot(goal.x-anchors.gunports[0].x,goal.z-anchors.gunports[0].z);
 assert.ok(distance>=12&&distance<=15,`culvert terminal ${index} must remain a readable 12–15m threat`);
 Audit(`CulvertTerminal${index}`,[...lanes.west.waypoints.slice(0,-1),goal],layout.blocks,0.4);
 for(const other of lanes.west.terminalGoals.slice(index+1))assert.ok(Math.hypot(goal.x-other.x,goal.z-other.z)>=1.2,"culvert terminal capsules cannot share a single goal");
}
const bridge=layout.blocks.find(b=>b.id==="ReturnRailSpurDeck");
assert.ok(routes.retreat.some(p=>Math.abs(p.x-bridge.x)+1.3<bridge.w/2&&Math.abs(p.z-bridge.z)+1.3<bridge.d/2),"whole stretcher corridor actually passes under the drainage bridge, not along its outer edge");
assert.ok(bridge.y-bridge.h/2>=2.6);
assert.ok(bridge.x-bridge.w/2>20,"return bridge cannot extend over the station or intersect the locomotive");
assert.ok(!layout.blocks.some(block=>/^ReturnRailSpur(?:BasePier|StationPier|MiddlePier|NorthRail|SouthRail)$/.test(block.id)),"no obsolete elevated railway across the station skyline");
assert.ok(layout.gates.filter(g=>g.signal==="EscortCall").some(g=>Hits(P012MapPoints({x:23,z:7.2}),g)));
const returnGate=layout.gates.find(g=>g.signal==="SouthCut");
assert.equal(returnGate.id,"ReturnGate");assert.equal(returnGate.solid,true);
const gateLegA=routes.retreat[1],gateLegB=routes.retreat[2];
const gateLegLength=Math.hypot(gateLegB.x-gateLegA.x,gateLegB.z-gateLegA.z);
const gateForward={x:(gateLegB.x-gateLegA.x)/gateLegLength,z:(gateLegB.z-gateLegA.z)/gateLegLength};
const gateNormal={x:gateForward.z,z:-gateForward.x};
const gateCenter={x:(gateLegA.x+gateLegB.x)/2,z:(gateLegA.z+gateLegB.z)/2};
assert.ok(Math.hypot(returnGate.x-gateCenter.x,returnGate.z-gateCenter.z)<1e-6);
const gateBanks=layout.blocks.filter(b=>b.id.startsWith("ReturnBank2_"));
assert.equal(gateBanks.length,2);
// Every ground-level crossing of this local section passes through along=0.
// Cover the whole corridor and both outer bank edges, not just its centreline;
// this includes paths angled from any point on one approach edge to the other.
for(let across=-5.8;across<=5.8;across+=.025){
 const point={x:gateCenter.x+gateNormal.x*across,z:gateCenter.z+gateNormal.z*across};
 assert.ok([returnGate,...gateBanks].some(b=>Hits(point,b,.42)),"closed return gate has no capsule-sized bank-edge gap");
 let blocked=false;
 for(let step=0;step<=80;step++){
  const along=-2+step*.05,p={x:point.x+gateForward.x*along,z:point.z+gateForward.z*along};
  if([returnGate,...gateBanks].some(b=>Hits(p,b,.42)))blocked=true;
 }
 assert.ok(blocked,"closed return cross-section blocks offset approach sweeps");
}
Audit("ReturnGateOpenStretcher",[gateLegA,gateLegB],layout.blocks,1.3);
Audit("ReturnGateClosedDoesNotSealEscort",routes.south,[...layout.blocks,returnGate],1.3);
// Standing and takeoff / landing space around each traversal obstacle is physically clear.
for(const [kind,p] of Object.entries(anchors.traversal)){
 const box=layout.blocks.find(b=>b.id===`Station${kind[0].toUpperCase()+kind.slice(1)}`);
 for(const dz of [-2,2])assert.ok(!layout.blocks.some(b=>b!==box&&Hits({x:p.x,z:p.z+dz},b,0.4)),`${kind} blocked landing`);
 // The real traversal starts 0.9m south and ends at the shared reach distance.
 // Sweep the whole horizontal capsule footprint against the full apex+standing
 // envelope, including overhead decks that ground-only tests deliberately skip.
 const reach=kind==="mantle"?TRAVERSAL.mantleReachM:TRAVERSAL.vaultReachM;
 const apex=box.h+(kind==="mantle"?TRAVERSAL.mantleApexOverM:TRAVERSAL.vaultApexOverM);
 for(let i=0;i<=100;i++){
  const sample={x:p.x,z:p.z+0.9-reach*i/100};
  for(const obstacle of layout.blocks){
   if(obstacle===box||obstacle.solid===false||obstacle.y+obstacle.h/2<=0||obstacle.y-obstacle.h/2>=apex+1.78)continue;
   assert.ok(!Hits(sample,{...obstacle,y:0.5,h:1},0.4),`${kind} full traversal envelope blocked by ${obstacle.id}`);
  }
 }
}
assert.ok(!layout.blocks.some(b=>["RailEmbankment","WestBoundary","EastBoundary","NorthBoundary","SouthBoundary"].includes(b.id)),"obsolete railway wall and four close boundary walls removed");
console.log("PASS P012 layout geometry");
// Execute the production reconciliation method with a minimal field host; no WebGL needed.
const fieldSource=fs.readFileSync(new URL("./Script_FirstLevelWhiteboxField.mjs",import.meta.url),"utf8").replace(/\r/g,"");
const syncMethod=fieldSource.match(/  SyncScenario\(\{[\s\S]*?\n  }\n/)[0];
const sync=vm.runInNewContext(`({${syncMethod}})`).SyncScenario;
const host={layout,gates:new Map([["a",{open:false,spec:{signal:"EscortCall"}}],["b",{open:false,spec:{signal:"SouthCut"}}]]),scenarioState:"Ordered",
 OpenGate(id){this.gates.get(id).open=true;return true;},CloseGate(id){this.gates.get(id).open=false;return true;},
 SetScenarioState(state){if(this.scenarioState===state.id)return false;this.scenarioState=state.id;return true;}};
assert.equal(sync.call(host,{signalled:()=>true}),3,"two gates plus changed hub must refresh navigation");
assert.equal(sync.call(host,{signalled:()=>false,restore:true}),3,"two restored gates plus changed hub must refresh navigation");
assert.equal(sync.call(host,{signalled:()=>false,restore:true}),0,"stable restore is idempotent");
host.layout={};assert.equal(sync.call(host,{signalled:()=>true}),2,"legacy count remains opened gates only");
console.log("PASS P012 scenario reconciliation change counts");
