// P2 spatial blueprint, pure data. Runtime +Z is south (Notion +Z north inverted).
// Planar ground is deliberate: trench banks provide relative shelter without a second height source.
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { P012Point, P012MapPoints, P012SouthPoint, P012RailPoint, P012StationPoint, P012_SPACE_BOUNDS } from "./Data_FirstLevelP012Space.mjs";
import { P012_STATION_BLOCKS, P012_STATION_SURFACES, P012_STATION_GATES, P012_STATION_REMOVE_IDS, P012_STATION_HEIGHTS } from "./Data_FirstLevelP012Station.mjs";
import { P012_HORIZON_GROUND, P012_HORIZON_BLOCKS, P012_HORIZON_REMOVE_IDS } from "./Data_FirstLevelP012Horizon.mjs";
import { P012_RESTING_BLOCKS } from "./Data_FirstLevelP012Resting.mjs";
import { P012_VILLAGE_LIFE_BLOCKS } from "./Data_FirstLevelP012VillageLife.mjs";

export const P012_SEMANTIC_COLORS = Object.freeze({ ground:0xb8b8b0, structure:0xc9c9c3, step:0xf1cf45, vault:0xe58b2f, mantle:0xb75bd6, cover:0x3977c8, boundary:0x24272c, danger:0xc83232, missionRoute:0x35b86b, stretcherRoute:0x2dcbd0 });
function Point(x,z) { return Object.freeze({x,z}); }
function Route(points) { return Object.freeze(points.map(([x,z])=>Point(x,z))); }
const blueprintZones = Object.freeze([
  ["Z00","后方兵站",-55,55,35,30], ["Z01","集结村路",-30,30,18,50],
  ["Z02","村口枢纽",0,0,45,40], ["Z03","暴露接近道路",0,-30,18,40],
  ["Z04","反斜面交通壕",0,-52,30,25], ["Z05","前沿阵地",5,-80,70,50],
  ["Z06","后送巷道",30,10,22,55], ["Z07","破屋截击区",55,35,42,48],
  ["Z08","扫射道路",50,68,16,65], ["Z09","南路断点",42,98,50,38],
  ["Z10","西侧回撤沟道",-18,48,10,95],
].map(([id,name,x,z,w,d])=>Object.freeze({id,name,x,z,w,d,radius:Math.min(w,d)*0.38})));

const north = Route([[-55,55],[-55,44],[-43,40],[-36,40],[-30,30],[-30,19],[-17,12],[0,0],[0,-17],[0,-30],[5,-38],[5,-46],[0,-52],[0,-59],[5,-65]]);
const south = Route([[5,-65],[0,-59],[0,-52],[5,-46],[5,-38],[0,-30],[0,-17],[0,0],[16,5],[30,10],[35,21],[45,26],[50,35],[50,47],[54,57],[50,68],[47,80],[42,98]]);
// Exact Z09/Z02/Z04 coordinates make the P2 "about 95m" return impossible. Keep the real loop.
const retreat = Route([[42,98],[28,96],[12,85],[-8,72],[-18,50],[-22,27],[-18,11],[0,0],[0,-17],[0,-30],[5,-38],[5,-46],[0,-52]]);
const flank = Route([[45,26],[58,24],[68,24],[72,24],[72,30],[72,43],[74,43],[74,48],[68,48],[59,48],[58,39],[58,37],[50,35],[45,26]]);
export const P012_BLUEPRINT_ROUTES = Object.freeze({ north, south, retreat, flank,
  trainExit:Route([[-66,65],[-66,61],[-60,61],[-55,55],[-55,44]]),
  gunports:Route([[-15,-64],[5,-65],[23,-68]]),
  westEnemy:Route([[-26,-108],[-17,-108],[-17,-100],[-26,-99],[-26,-74],[-20,-74],[-15,-78.5]]),
  centerEnemy:Route([[14,-113],[5,-113],[5,-96],[5,-81]]),
  eastEnemy:Route([[35,-115],[29,-115],[29,-108],[35,-108],[32,-92],[23,-80]]) });
const blueprintEnemyLanes = Object.freeze({
  center:Object.freeze({spawn:Point(14,-113),reveal:Point(5,-113),goal:Point(5,-81),waypoints:P012_BLUEPRINT_ROUTES.centerEnemy}),
  west:Object.freeze({spawn:Point(-26,-108),reveal:Point(-17,-100),goal:Point(-15,-78.5),waypoints:P012_BLUEPRINT_ROUTES.westEnemy,
    terminalGoals:Object.freeze([-17.1,-15.7,-14.3,-12.9].map(x=>Point(x,-78.5)))}),
  east:Object.freeze({spawn:Point(35,-115),reveal:Point(29,-108),goal:Point(23,-80),waypoints:P012_BLUEPRINT_ROUTES.eastEnemy}),
});
export const P012_BLUEPRINT_ANCHORS = Object.freeze({
  trainSpawn:Point(-66,63.3), trainDoor:Point(-60,61), railObserve:Point(-3,0), supplyPoint:Point(4,4), sideImpact:Point(-6,-33),
  ammoCrate:Point(-7,-52), railPassFrom:Point(-72,0), railPassTo:Point(-72,110),
  crowdTurnFrom:Point(50,110), crowdTurnTo:Point(50,30), diveFrom:Point(50,110), diveTo:Point(50,30),
  weaponCheck:Point(-55,44), ammoPickup:Point(-7,-52), ammoDrop:Point(5,-65),
  ammoIssue:Point(-55,34), weaponInspect:Point(-45,34),
  gunports:Object.freeze([Point(-15,-64),Point(5,-65),Point(23,-68)]),
  scout:Point(5,-113), gunpoint:Point(58,39), stretcher:Point(45,26),
  shelter:Point(-7,-52), southGunpoint:Point(48,107),
  blockadePositions:Object.freeze([Point(66,114),Point(70,115),Point(74,116),Point(77,117)]),
  strafeSlots:Object.freeze([Point(44,60),Point(58,72),Point(39,84)]),
  traversal:Object.freeze({step:Point(-49,56),vault:Point(-44,56),mantle:Point(-39,56)})
});
function Box(id,x,z,w,d,h,semantic="boundary",options={}) {
  return Object.freeze({id,x,z,w,d,h,y:h/2,ry:0,solid:true,cover:null,tag:`p012_${semantic}`,semantic,...options});
}
const blocks=[];
function Add(...items) { blocks.push(...items); }
function Strip(id,a,b,width,semantic,height=0.035,solid=false) {
  return Box(id,(a.x+b.x)/2,(a.z+b.z)/2,width,Math.hypot(b.x-a.x,b.z-a.z),height,semantic,{ry:Math.atan2(b.x-a.x,b.z-a.z),solid});
}
for (const [name,route] of Object.entries({North:north,South:south,Retreat:retreat,Flank:flank,TrainExit:P012_BLUEPRINT_ROUTES.trainExit})) {
  const stretcher=name==="South"||name==="Retreat";
  // Non-solid visual paint: cyan wins at shared routes, never coplanar with green.
  for(let i=1;i<route.length;i++) Add(Strip(`${name}Route${i}`,route[i-1],route[i],name==="Flank"?1.4:2.8,stretcher?"stretcherRoute":"missionRoute",stretcher?0.045:0.025));
}
Add(Box("WestBoundary",-79,1,2,236,4),Box("EastBoundary",79,1,2,236,4),Box("NorthBoundary",0,-117,160,2,4),Box("SouthBoundary",0,119,160,2,4));
// Western railway: a strong long-lived silhouette, not a line across the hub.
Add(Box("RailEmbankment",-72,-10,7,206,2.5),Box("StationTrainB",-66,79,5,20,4),Box("StationSouthCargo",-51,71,26,3,3),Box("StationEastShed",-35,62,5,16,3));
// Raised crossarms make the west railway distinguishable from the perimeter
// at standing eye height. These remain untextured solid whitebox primitives.
for(const [index,z] of [-60,-30,0,30,60].entries()) {
 Add(Box(`RailTelegraphPost${index}`,-72,z,0.35,0.35,6.3),
   Box(`RailTelegraphCrossarm${index}`,-72,z,0.35,4,0.3,"boundary",{y:5.8}));
}
// Walkable carriage shell, not a solid model proxy. East-side door gap is a real opening.
Add(Box("StationTrainAFloor",-66,56,5,24,0.1,"ground",{y:-0.05,solid:false}),Box("StationTrainAWest",-68.5,56,0.4,24,3.8),Box("StationTrainAEastSouth",-63.5,65.5,0.4,5,3.8),Box("StationTrainANorth",-66,44,5,0.4,3.8),Box("StationTrainASouth",-66,68,5,0.4,3.8),Box("StationTrainARoof",-66,56,5.4,24,0.3,"boundary",{y:3.95}));
// Actual aperture frames the station outside; no see-through wall collider spans the window.
Add(Box("StationWindowNorthPier",-63.5,45,0.4,2,3.8),Box("StationWindowSouthPier",-63.5,57,0.4,2,3.8),Box("StationWindowSill",-63.5,51,0.4,10,TRAVERSAL.vaultMax-0.1,"cover"),Box("StationWindowLintel",-63.5,51,0.4,10,1.1,"boundary",{y:3.25}));
// Narrow structural slats admit light but cannot become an alternate pre-door exit.
for(let i=0;i<16;i++) Add(Box(`StationWindowSlat${i}`,-63.5,46.15+i*0.64,0.4,0.16,1.6,"boundary",{y:1.9}));
Add(Box("StationStep",-49,56,2,1,TRAVERSAL.stepMax-0.08,"step"),Box("StationVault",-44,56,2,0.65,TRAVERSAL.vaultMax-0.1,"vault"),Box("StationMantle",-39,56,2,0.65,TRAVERSAL.mantleMax-0.1,"mantle"));
// Visible interaction furniture sits beside, never on, the usable action anchors.
Add(Box("WeaponCheckTable",-57.2,44,0.8,1.5,0.85,"missionRoute"),Box("HubSupplyCrate",2,6,1.2,0.8,0.8,"missionRoute"),Box("AmmoPickupCrate",-9.3,-50,1.2,0.8,0.8,"missionRoute"),Box("AmmoDeliveryTray",8,-64,1.2,0.8,0.8,"missionRoute"));
Add(Box("WeaponIssueCrate",-57,34,0.8,1.2,0.8,"missionRoute"),Box("WeaponInspectBench",-47,36,1.2,0.8,0.85,"missionRoute"));
Add(Box("VillageWestHouse",-42,24,8,16,3.2),Box("VillageEastHouse",-11,29,8,13,3.2),Box("VillageWaitingBay",-36,32,3,2,0.9,"cover"));
Add(Box("HubBrokenWallTall",-13,-7,10,1,4),Box("HubBrokenWallLow",-6,-7,4,1,2.5),Box("HubWellWest",10,-3,0.5,3,0.95,"cover"),Box("HubWellEast",13,-3,0.5,3,0.95,"cover"),Box("HubWellNorth",11.5,-4.5,3.5,0.5,0.95,"cover"),Box("HubWellSouth",11.5,-1.5,3.5,0.5,0.95,"cover"));
Add(Box("ApproachWestCover",-5,-25,3,5,1,"cover"),Box("ApproachEastCover",8,-30,3,5,1,"cover"),Box("ApproachDitchBank",10,-39,1,10,1,"cover"));
// Dogleg cuts direct sight between preparation trench and enemy field.
Add(Box("ReverseSlopeWest",-9,-60,14,3,2.8),Box("ReverseSlopeEast",16,-57,19,3,2.8),Box("AmmoBayBack",-9,-55,7,1,2.3),Box("AmmoBaySide",-12,-51,1,8,2.3));
// A red danger marker identifies the northern fighting entrance above its
// low silhouette; it is not a national flag or a HUD direction arrow.
Add(Box("FrontEntranceMarkerPost",-3,-49,0.25,0.25,4.8),
 Box("FrontEntranceDangerMarker",-1.8,-49,2.4,0.15,1.1,"danger",{y:4.1}));
for (const [i,p] of P012_BLUEPRINT_ANCHORS.gunports.entries()) Add(Box(`Gunport${i}Cover`,p.x,p.z-2.5,5,1,1,"cover",{cover:{faceX:0,faceZ:-1}}));
// Continuous communication breastwork: the southern edge remains walkable even
// at the close firing position (port.z - 1.2). Standing eyes clear the 1.05m top.
for(let i=1;i<P012_BLUEPRINT_ANCHORS.gunports.length;i++) {
  const a=P012_BLUEPRINT_ANCHORS.gunports[i-1],b=P012_BLUEPRINT_ANCHORS.gunports[i];
  Add({...Strip(`GunportTransitCover${i}`,Point(a.x,a.z-2.5),Point(b.x,b.z-2.5),1,"cover",1.05,true),cover:{faceX:0,faceZ:-1}});
}
Add(Box("FrontlineRearWest",-13,-69,8,0.8,0.9,"cover"),Box("FrontlineRearEast",17,-72,8,0.8,0.9,"cover"),Box("CulvertWestPier",-30,-85,2,16,3),Box("CulvertEastPier",-22,-85,2,16,3),Box("CulvertRoof",-26,-85,10,16,0.7,"boundary",{y:3.35}),Box("EastEnemyWall",38,-96,2,30,2.8),Box("EnemySpawnScreenWest",-26,-104,12,2,3),Box("EnemySpawnScreenCenter",14,-110,12,1,3),Box("EnemySpawnScreenEast",35,-113,9,1,3));
// A visible rail spur joins the western embankment and crosses the actual Z10 drainage route.
// Deck bottom is above standing clearance; its piers are outside the swept stretcher corridor.
Add(Box("ReturnRailSpurDeck",-40,50,64,5,0.5,"boundary",{y:3.25}),Box("ReturnRailSpurWestPier",-30,50,2,5,3),Box("ReturnRailSpurEastPier",-8,50,2,5,3));
Add(Box("EvacWestCourtyard",22,18,5,15,2.5),Box("EvacEastCourtyard",40,9,5,16,2.5),Box("EvacWaitingCover",41,29,3,4,1,"cover"));
Add(Box("EvacWaitingSideCover",50,29.5,.4,4,1.05,"cover"));
// The existing eastern courtyard is the tall wall. Low blue pieces mark the
// player's side-fire corner and two separate squad positions without sealing
// the established convoy window or the 1.3 m stretcher lane.
Add(Box("RoadContactSideFire",36.5,14,.6,4,1.05,"cover",{cover:{faceX:1,faceZ:0}}),
 Box("RoadContactAllyCoverNorth",26,18,3,.6,1.05,"cover"),Box("RoadContactAllyCoverSouth",30,20,3,.6,1.05,"cover"));
// B15-B19 readable tactical furniture. The wall is Luo's physical regroup/
// aircraft-observation position; the cart actually closes the exposed road
// until either rescue branch is completed. The litter bay is hard cover, not
// a hidden coordinate painted into the objective system.
Add(Box("AirObservationWall",44,51,6,.5,1.05,"cover"),
  Box("AirLitterShelterWest",42,61,.8,7,1.1,"cover"));
// Single-storey ruin: open north entrance and east breach, real window towards waiting stretcher.
Add(Box("RuinWestNorth",61,28,1,4,2.8),Box("RuinWestSouth",61,42,1,7,2.8),Box("RuinWindowSill",61,34,1,8,0.85,"cover"),Box("RuinWindowLintel",61,34,1,8,0.6,"boundary",{y:2.5}),Box("RuinEast",76,35,1,26,2.8),Box("RuinNorth",69,20,15,1,2.8),Box("RuinSouth",67,52,12,1,2.8),Box("RuinBrokenRoof",68,28,8,8,0.35,"boundary",{y:3.1}),Box("AmbushGunShield",55,40,1,3,1,"cover"));
// B14 firing corners: standing fire clears the top; prone heads and crouched
// torsos are screened. A 1.05m crouch eye cannot hide behind a 1.05m flat-ground wall.
Add(Box("RuinRoadFightCover",58,26,5,0.4,1.05,"cover"),Box("RuinWindowFightCover",68,26,3,0.4,1.05,"cover"),Box("RuinSouthFightCover",70.5,45,3,0.4,1.05,"cover"));
Add(Box("RuinEastTransitCover",70.75,38.45,0.4,16.9,1.05,"cover"));
// Split indoor and southern fire lanes: expose the next pair only after the
// player rounds the eastern corner, without closing the existing flank path.
Add(Box("RuinCrossfirePartition",67,40,7,0.5,2.2,"boundary"));
// The north window can see the convoy emerging from the courtyard, while
// southern indoor shooters remain screened throughout its short advance.
Add(Box("EvacWindowScreen",45,22.9,0.5,3,2.2,"boundary"));
// Open western sky: low banks only, and several separate shelter pockets.
for(const [i,p] of P012_BLUEPRINT_ANCHORS.strafeSlots.entries()) Add(Box(`Ditch${i}OuterBank`,p.x-2,p.z,0.8,7,1,"cover"),Box(`Ditch${i}InnerBank`,p.x+2,p.z,0.8,4,1,"cover"));
Add(Box("SouthDangerRoad",42,110,14,14,0.06,"danger",{solid:false}),Box("SouthHouseWest",24,106,1,14,2.8),Box("SouthHouseBack",30,112,13,1,2.8),Box("SouthHouseEast",36,109,1,6,2.8),Box("SouthGunCover",48,109,5,1,1,"cover"),Box("SouthFarBlockade",52,116,26,1,2.5));
Add(Box("SouthRoadFightCover",45,98,0.4,4,1.05,"cover"),Box("SouthNorthFightCover",38.5,101.8,0.4,2.4,1.05,"cover"),Box("SouthRoomFightCover",31.5,106.7,6,0.4,1.05,"cover"));
// Blueprint coordinates: compile these tactical partitions exactly once below.
Add(Box("SouthHouseNorthPartition",31.75,102,15.5,.5,2.8),
 Box("SouthCourtSightPartition",36,96.85,.5,3.3,2.8),
 Box("SouthCourtFightCover",39.4,100,.4,2,1.05,"cover"));
Add(Box("SouthRoadSideCover",35.5,95.4,.4,1.2,1.05,"cover"));
Add(Box("DitchRearguardInnerBank",46,64,0.8,4,1.05,"cover"),
 Strip("DitchDelayEastBank",{x:52.8,z:65.5},{x:49.8,z:79.5},0.8,"cover",1.05,true),
 Box("RearguardArrivalScreen",66,60,1,20,2.8,"boundary"));
// Return drainage banks sit outside the entire swept route, with chamfered open joints.
for(let i=1;i<6;i++) {
 const a=retreat[i-1],b=retreat[i],len=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/len,nz=-(b.x-a.x)/len;
 for(const side of [-1,1]) { const inset=3/len,aa={x:a.x+(b.x-a.x)*inset+nx*side*5,z:a.z+(b.z-a.z)*inset+nz*side*5},bb={x:b.x-(b.x-a.x)*inset+nx*side*5,z:b.z-(b.z-a.z)*inset+nz*side*5}; Add(Strip(`ReturnBank${i}_${side===1?"East":"West"}`,aa,bb,0.8,"cover",1.1,true)); }
}
const hubStates=Object.freeze([
 Object.freeze({id:"Ordered",signal:null,blocks:Object.freeze([Box("HubStateWall",-13,-7,10,1,4),Box("HubStateWallLow",-6,-7,4,1,2.5),Box("HubOrderedSupplyA",-15,0,2,2,1,"cover"),Box("HubOrderedSupplyB",-15,3,2,2,1,"cover")])}),
 Object.freeze({id:"Damaged",signal:"EscortCall",blocks:Object.freeze([Box("HubStateWall",-15,-7,6,1,3.5),Box("HubStateWallLow",-8,-7,8,1,1.1,"cover"),Box("HubFallenMasonry",-13,-10,4,2,0.45,"step"),Box("HubDamagedSupply",-15,0,2,2,0.6,"vault")])}),
 Object.freeze({id:"Abandoned",signal:"SouthCut",blocks:Object.freeze([Box("HubStateWall",-16,-7,4,1,2.5),Box("HubStateWallLow",-9,-7,10,1,0.8,"cover"),Box("HubFallenMasonry",-13,-10,5,3,0.45,"step"),Box("HubAbandonedCrate",-15,0,3,1,0.45,"step",{ry:0.4}),Box("HubAbandonedFrame",12,10,4,1,0.5,"step",{ry:-0.35})])}),
]);
const blueprintGates=Object.freeze([
  // Open sight between real bars, not an invisible solid wall. The 0.35m
  // gaps are narrower than every player capsule, including prone.
  ...Array.from({length:15},(_,index)=>Object.freeze({
   ...Box(index===0?"HubEscortGate":`HubEscortGateBar${index}`,23,3.77+index*0.49,0.3,0.14,3),signal:"EscortCall",
  })),
  Object.freeze({...Box("TrainDoor",-63.5,60.5,0.4,5,3.8),signal:"P012TrainDoor"}),
  Object.freeze({...Box("ReturnGate",22,92,1,9,3),signal:"SouthCut"}),
  Object.freeze({...Box("AirRoadCartObstacle",50,70,4.5,1.4,1,"vault"),signal:"P012AirObstacleResolved"}),
]);

// Tactical islands retain metre-scale collision and sightlines. Only their
// placement changes; the inter-island roads below are newly authored in world
// coordinates rather than scaling the old lane widths or movement speeds.
const mappedRoutes = P012MapPoints(P012_BLUEPRINT_ROUTES);
const northLink = Route([[0,-17],[-12,-32],[-12,-50],[0,-62]]);
// The exposed approach remains direct. After impact, actor facts own the
// regroup beat; the ammunition box alone follows this dogleg trench.
export const P012_BLUEPRINT_AMMO_CARRY = Route([[-7,-52],[0,-52],[5,-46],[16,-46],[19,-51],[18,-54],[5,-54],[5,-59],[5,-65]]);
const ammoCarry = Object.freeze(P012MapPoints(P012_BLUEPRINT_AMMO_CARRY));
const eastLink = Route([[30,10],[44,28],[64,28],[74,6],[84,6]]);
const worldVillage=Route([[-43,100],[-36,95],[-30,80],[-30,62],[-34,46],[-30,30],[-30,19],[-17,12],[0,0]]);
const worldNorth = Object.freeze([Point(-55,115),Point(-55,104),...worldVillage,...northLink,...mappedRoutes.north.slice(9)]);
const worldSouth = Object.freeze([...mappedRoutes.south.slice(0,6),...northLink.slice().reverse(),
  ...mappedRoutes.south.slice(7,9),...eastLink,...mappedRoutes.south.slice(9)]);
const worldRetreat = Route([[102,98],[85,83],[68,68],[42,48],[34.6666666667,40],[20,24],
  [0,0],[0,-17],[-12,-32],[-12,-50],[0,-62],[0,-70],[5,-78],[5,-86],[0,-90]]);
const machineGunEnemy = Route([[35,-201],[23,-201],[23,-195],[23,-178]]);
export const P012_ROUTES = Object.freeze({...mappedRoutes,north:worldNorth,village:worldVillage,trainExit:Object.freeze(P012MapPoints(P012_BLUEPRINT_ROUTES.trainExit,P012StationPoint)),south:worldSouth,retreat:worldRetreat,
  villageWaiting:Route([[-39,94],[-26,60]]),
  villageEvacuation:Route([[-28.6,80],[-23,91],[-23,110],[-18,132],[-18,155]]),
  villageEvacuationWaiting:Route([[-19,108],[-14,153]]),
  approach:Object.freeze([...northLink,Point(3,-70),Point(5,-78),Point(5,-82)]),ammoCarry,machineGunEnemy});
export const P012_ENEMY_LANES = Object.freeze({...P012MapPoints(blueprintEnemyLanes),
  machineGun:Object.freeze({spawn:machineGunEnemy[0],reveal:machineGunEnemy[2],goal:machineGunEnemy.at(-1),waypoints:machineGunEnemy})});
export const P012_ANCHORS = Object.freeze({...P012MapPoints(P012_BLUEPRINT_ANCHORS),hub:Point(0,0),
  ...Object.fromEntries(["trainSpawn","trainDoor","weaponCheck","ammoIssue","weaponInspect","traversal"].map(key=>[key,P012MapPoints(P012_BLUEPRINT_ANCHORS[key],P012StationPoint)])),
  railPassFrom:P012RailPoint(-72,0),railPassTo:P012RailPoint(-72,110)});
export const P012_ZONES = Object.freeze(blueprintZones.map(zone=>Object.freeze({...zone,
  ...(zone.id==="Z00"?P012StationPoint(zone.x,zone.z):zone.id==="Z10"?{x:42,z:48,d:100}:P012Point(zone.x,zone.z))})));

const discarded = /^(WestBoundary|EastBoundary|NorthBoundary|SouthBoundary|RailEmbankment|ReturnRailSpur.*|ReturnBank.*|(North|South|Retreat|Flank|TrainExit)Route\d+)$/;
const worldBlocks = blocks.filter(block=>!discarded.test(block.id)).map(block=>{
  // The hub-facing court is an orientation landmark; add its moved counterpart
  // separately. Telegraphs follow the continuous railway, not the north island.
  if(block.id==="EvacEastCourtyard"||block.id.startsWith("RailTelegraph"))return block;
  if(/^(StationStep|StationVault|StationMantle|WeaponCheckTable|WeaponIssueCrate|WeaponInspectBench)$/.test(block.id)){
    const point=P012StationPoint(block.x,block.z);
    return {...block,...point,y:block.y+(point.x>=-62&&point.x<=-30&&point.z>=98&&point.z<=151?P012_STATION_HEIGHTS.platformTop:0)};
  }
  return {...block,...P012Point(block.x,block.z)};
});
worldBlocks.push({...blocks.find(block=>block.id==="EvacEastCourtyard"),...P012SouthPoint(40,9),id:"EvacDestinationCourtyard"});
worldBlocks.push(...P012_VILLAGE_LIFE_BLOCKS);
// Separate buildings and open courts, not a continuous tunnel. The broad centre
// corridor admits opposing foot traffic without shrinking people or cover.
worldBlocks.push(Box("StationNorthWestHouse",-81,85,10,12,3.5,"structure"),
 Box("VillageSouthEastHouse",-18,73,12,14,3.2,"structure"),
 Box("VillageMiddleWestHouse",-45,57,9,10,3.2,"structure"),
 Box("VillageWaitingBenchSouth",-40,90,2,1,.65,"cover"),
 Box("VillageWaitingBenchNorth",-23,60,2,1,.65,"cover"));
// Three staggered, finite courts shape the authored bends. Inner corner houses
// interrupt long diagonal shortcuts; short walls leave lateral court openings,
// rather than forming a continuous narrow tunnel or four enclosing walls.
worldBlocks.push(Box("VillageBendWestHouse",-38.6,77,10,10,3.3,"structure"),
 Box("VillageBendEastHouse",-25.9,46,8,10,3.1,"structure"),
 Box("VillageNorthGateHouse",-21,23,8,8,3.4,"structure"),
 Box("VillageWestCourtWall",-33,68,.4,6,1.4,"structure"),
 Box("VillageEastCourtWall",-27,75,.4,6,1.4,"structure"),
 Box("VillageSouthCourtReturn",-46,89,5,.4,1.15,"cover"),
 Box("VillageMiddleCourtReturn",-39,52,5,.4,1.4,"structure"),
 Box("VillageNorthCourtReturn",-36,27,4,.4,1.4,"structure"));
// Readable four-metre grey lane, below existing route paint. Branch/court ground
// remains open; these strips have no collision or separate support surface.
for(let index=1;index<worldVillage.length;index++)worldBlocks.push(Strip(`VillageRoadBed${index}`,worldVillage[index-1],worldVillage[index],4,"ground",.012));
for(let index=1;index<P012_ROUTES.villageEvacuation.length;index++)worldBlocks.push(Strip(`VillageEvacuationPaint${index}`,P012_ROUTES.villageEvacuation[index-1],P012_ROUTES.villageEvacuation[index],1.3,"stretcherRoute",.045));
worldBlocks.push(Box("VillageEvacuationWaitingBench",-16,108,2,1,.65,"cover"),Box("StationEastWaitingBench",-11,153,2,1,.65,"cover"));
for(const [name,route] of Object.entries({North:worldNorth,South:worldSouth,Retreat:worldRetreat,Flank:P012_ROUTES.flank,TrainExit:P012_ROUTES.trainExit})) {
  const stretcher=name==="South"||name==="Retreat";
  for(let i=1;i<route.length;i++)worldBlocks.push(Strip(`${name}Route${i}`,route[i-1],route[i],name==="Flank"?1.4:2.8,
    stretcher?"stretcherRoute":"missionRoute",stretcher?.045:.025));
}
for(const [name,route] of Object.entries({AmmoCarry:P012_ROUTES.ammoCarry})) {
  for(let index=1;index<route.length;index++)worldBlocks.push(Strip(`${name}Route${index}`,route[index-1],route[index],
    name==="AmmoCarry"?2.2:2.8,"missionRoute",name==="AmmoCarry"?.03:.025));
}
for(let index=4;index<=6;index++){
  const a=P012_ROUTES.ammoCarry[index-1],b=P012_ROUTES.ammoCarry[index],length=Math.hypot(b.x-a.x,b.z-a.z);
  const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,nx=uz,nz=-ux,inset=Math.min(2,length*.22);
  for(const side of [-1,1])worldBlocks.push({...Strip(`AmmoDoglegBank${index}_${side<0?"West":"East"}`,
    Point(a.x+ux*inset+nx*side*3,a.z+uz*inset+nz*side*3),Point(b.x-ux*inset+nx*side*3,b.z-uz*inset+nz*side*3),.8,"cover",1.05,true),
    cover:{faceX:-nx*side,faceZ:-nz*side}});
}
// Staggered silhouettes conceal the enclosing test volume; no empty rectangle
// immediately announces the end of the battlefield from the initial station.
worldBlocks.push(Box("WestBoundary",-109,-27.5,2,373,8),Box("EastBoundary",184,-27.5,2,373,7),
  Box("NorthBoundary",37.5,-214,295,2,8),Box("SouthBoundary",37.5,159,295,2,7),
  Box("RailEmbankment",-72,-32.5,7,315,2.5),
  Box("NorthLinkWestBank",-21,-39,3,35,3.2),Box("NorthLinkEastShoulder",8,-43,13,19,3.8),
  // A real low ditch bank separates the first near miss from the crouched
  // refuge. Both ends are open; it does not span or pinch the escort route.
  Box("NorthNearMissDitchBank",-15.6,-43.15,.8,12.7,1.1,"cover"),
  Box("EastLinkNorthCourt",48,13,12,4,3.1),Box("EastLinkEastCourt",58,40,15,14,3.2),
  Box("EastLinkWestCourt",28,54,10,25,3),Box("EastLinkSouthCourt",66,-1,22,5,3),
  Box("EastLinkEastShoulder",91,73,12,15,3.5),
  Box("DepthNorthFarm",-51,-170,22,34,6),Box("DepthEastFarm",160,51,26,46,7),
  Box("DepthSouthVillage",110,145,49,15,6),Box("DepthSouthWest",-110,150,26,42,5),
  Box("DepthWestTerrace",-91,-35,16,42,5),Box("DepthWestOutbuildings",-91,95,16,32,4.5),
  Box("DepthEastTerrace",150,-20,26,35,4.3),Box("DepthNorthEastVillage",145,-100,25,48,6),
  Box("DepthSouthTerrace",20,155,30,12,4.6),Box("DepthSouthFarm",42,142,36,20,5.7),Box("DepthSouthEast",161,135,18,25,4.8),
  Box("MachineGunSpawnScreen",35,-197,10,1,3),
  Box("MachineGunPositionCover",23,-176.5,4,.7,1,"cover"),
  // A short damaged farm-road bridge spans the return drainage channel. The
  // legacy identifier remains stable, but this is NOT a railway suspended at
  // carriage-roof height across the station. The actual railway stays west.
  Box("ReturnRailSpurDeck",33.5,40,23,5,.5,"structure",{y:3.25}),
  Box("ReturnRailSpurWestPier",23,40,2,5,3,"structure"),Box("ReturnRailSpurEastPier",44,40,2,5,3,"structure"),
  Box("ReturnBridgeNorthParapet",33.5,37.7,23,.4,.5,"structure",{y:3.75}),
  Box("ReturnBridgeSouthParapet",33.5,42.3,23,.4,.5,"structure",{y:3.75}));
// The real retreat uses the western culvert and revisits the same hub. Banks
// preserve a swept stretcher corridor, with open chamfered joints at corners.
for(let i=1;i<6;i++) {
  const a=worldRetreat[i-1],b=worldRetreat[i],len=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/len,nz=-(b.x-a.x)/len;
  for(const side of [-1,1]) {
    const inset=Math.min((i===1?9:3)/len,.4),aa={x:a.x+(b.x-a.x)*inset+nx*side*5,z:a.z+(b.z-a.z)*inset+nz*side*5},
      bb={x:b.x-(b.x-a.x)*inset+nx*side*5,z:b.z-(b.z-a.z)*inset+nz*side*5};
    worldBlocks.push(Strip(`ReturnBank${i}_${side===1?"East":"West"}`,aa,bb,.8,"cover",1.1,true));
  }
}
// Close the actual second return leg across its full bank-to-bank section.
// The old axis-aligned gate missed the rerouted player centreline. Keep this
// away from the first-leg entry shared with the still-open evacuation road.
const returnGateA=worldRetreat[1],returnGateB=worldRetreat[2];
const returnGateLength=Math.hypot(returnGateB.x-returnGateA.x,returnGateB.z-returnGateA.z);
const returnGateNormal={x:(returnGateB.z-returnGateA.z)/returnGateLength,z:-(returnGateB.x-returnGateA.x)/returnGateLength};
const returnGateCenter={x:(returnGateA.x+returnGateB.x)/2,z:(returnGateA.z+returnGateB.z)/2};
const returnClosure=Strip("ReturnGate",
  Point(returnGateCenter.x-returnGateNormal.x*5.4,returnGateCenter.z-returnGateNormal.z*5.4),
  Point(returnGateCenter.x+returnGateNormal.x*5.4,returnGateCenter.z+returnGateNormal.z*5.4),
  .8,"boundary",3,true);
const worldGates = blueprintGates.map(gate=>gate.id.startsWith("HubEscortGate")?gate:
  gate.id==="ReturnGate"?{...returnClosure,signal:gate.signal}:({...gate,...P012Point(gate.x,gate.z)}));
const stationReplacements=P012_STATION_REMOVE_IDS.map(pattern=>new RegExp(pattern));
const KeepBlock=block=>!P012_HORIZON_REMOVE_IDS.includes(block.id)&&!stationReplacements.some(pattern=>pattern.test(block.id));
const stationBlocks=P012_STATION_BLOCKS;
// Recruits from each carriage use a visible gun rack followed by a separate
// ammunition table. Leave the interaction side clear, not a target inside a box.
const recruitIssueBlocks=[101.8,121,139].flatMap((z,index)=>[
  ...(index===0?[]:[Box(`StationRecruitGunRack${index}`,-56.7,z+1.4,1.2,.55,1.2,"missionRoute",{y:P012_STATION_HEIGHTS.platformTop+.6}),
    ...[-.4,0,.4].map((offset,rifle)=>Box(`StationRecruitRifle${index}_${rifle}`,-56.7+offset,z+1.4,.09,.12,1.35,"boundary",{y:P012_STATION_HEIGHTS.platformTop+.675}))]),
  ...(index===0?[]:[Box(`StationRecruitAmmoTable${index}`,-51,z+1.4,2,.7,.8,"missionRoute",{y:P012_STATION_HEIGHTS.platformTop+.4})]),
]);
export const FIRST_LEVEL_P012_LAYOUT=Object.freeze({scenario:Object.freeze({replaceBlockIds:Object.freeze(["HubBrokenWallTall","HubBrokenWallLow"]),states:hubStates}),
  bounds:P012_SPACE_BOUNDS,ground:P012_HORIZON_GROUND,walkableSurfaces:P012_STATION_SURFACES,
  blocks:Object.freeze([...worldBlocks.filter(KeepBlock),...stationBlocks,...recruitIssueBlocks,...P012_RESTING_BLOCKS,...P012_HORIZON_BLOCKS]),
  gates:Object.freeze([...worldGates.filter(KeepBlock),...P012_STATION_GATES]),
  sections:Object.freeze(P012_ZONES.map(zone=>Object.freeze({id:zone.id,pressure:zone.name}))),semanticColors:P012_SEMANTIC_COLORS});
